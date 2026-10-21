import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import BacktestSession, Trade, TradeImage, User
from ..ratelimit import limiter
from ..schemas import ImageOut, ImagePatch
from ..storage import EXT, get_storage, sniff_image

router = APIRouter(tags=["images"])


async def _read_validated(file: UploadFile) -> tuple[bytes, str]:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Ảnh vượt quá {get_settings().max_upload_mb} MB")
    if not data:
        raise HTTPException(422, "Tệp rỗng")
    ctype = sniff_image(data)
    if ctype is None:
        raise HTTPException(415, "Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP")
    return data, ctype


def _upload_guard(user: User, db: Session) -> None:
    s = get_settings()
    if not limiter.hit(f"upload:{user.id}", s.upload_rate_limit, s.upload_rate_window_s):
        raise HTTPException(429, "Tải ảnh quá nhanh, vui lòng thử lại sau")
    n = db.scalar(select(func.count()).select_from(TradeImage).where(TradeImage.user_id == user.id,
                                                                      TradeImage.deleted_at.is_(None)))
    if n >= s.max_images_per_user:
        raise HTTPException(403, "Đã đạt hạn mức số ảnh lưu trữ")


async def _create(db: Session, request: Request, user: User, file: UploadFile, kind: str, caption: str,
                  trade: Trade | None = None, session: BacktestSession | None = None) -> TradeImage:
    if kind not in ("before", "after", "other"):
        raise HTTPException(422, "Loại ảnh không hợp lệ")
    _upload_guard(user, db)
    data, ctype = await _read_validated(file)
    img_id = uuid.uuid4()
    key = f"u/{user.id}/{img_id}.{EXT[ctype]}"
    # Ghi object trước, rồi mới ghi DB; nếu DB lỗi thì xóa object vừa ghi (không để metadata trỏ tới tệp không tồn tại)
    get_storage().put(key, data, ctype)
    order = db.scalar(select(func.coalesce(func.max(TradeImage.sort_order), 0)).where(
        TradeImage.trade_id == trade.id if trade else TradeImage.backtest_session_id == session.id)) or 0
    img = TradeImage(id=img_id, user_id=user.id, trade_id=trade.id if trade else None,
                     backtest_session_id=session.id if session else None, kind=kind, caption=caption[:2000],
                     storage_key=key, content_type=ctype, size_bytes=len(data),
                     sha256=hashlib.sha256(data).hexdigest(),
                     original_filename=(file.filename or "")[:255], sort_order=order + 1)
    try:
        db.add(img)
        audit(db, request, user.id, "image.upload", "image", img_id,
              trade_id=str(trade.id) if trade else None, session_id=str(session.id) if session else None,
              size=len(data))
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(key)
        raise
    return img


@router.post("/trades/{trade_id}/images", response_model=ImageOut, status_code=201)
async def upload_trade_image(trade_id: uuid.UUID, request: Request, file: UploadFile = File(...),
                             kind: str = Form("other"), caption: str = Form(""),
                             user: User = Depends(current_user), db: Session = Depends(get_db)):
    trade = owned(db, Trade, trade_id, user, "Giao dịch")
    return await _create(db, request, user, file, kind, caption, trade=trade)


@router.post("/backtest-sessions/{session_id}/images", response_model=ImageOut, status_code=201)
async def upload_session_image(session_id: uuid.UUID, request: Request, file: UploadFile = File(...),
                               kind: str = Form("other"), caption: str = Form(""),
                               user: User = Depends(current_user), db: Session = Depends(get_db)):
    sess = owned(db, BacktestSession, session_id, user, "Phiên backtest")
    return await _create(db, request, user, file, kind, caption, session=sess)


@router.get("/trades/{trade_id}/images", response_model=list[ImageOut])
def list_trade_images(trade_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned(db, Trade, trade_id, user, "Giao dịch")
    return db.scalars(select(TradeImage).where(TradeImage.trade_id == trade_id, TradeImage.deleted_at.is_(None))
                      .order_by(TradeImage.sort_order, TradeImage.created_at)).all()


@router.get("/backtest-sessions/{session_id}/images", response_model=list[ImageOut])
def list_session_images(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned(db, BacktestSession, session_id, user, "Phiên backtest")
    return db.scalars(select(TradeImage).where(TradeImage.backtest_session_id == session_id,
                                               TradeImage.deleted_at.is_(None))
                      .order_by(TradeImage.sort_order, TradeImage.created_at)).all()


def _image(db: Session, image_id: uuid.UUID, user: User) -> TradeImage:
    img = owned(db, TradeImage, image_id, user, "Ảnh")
    if img.deleted_at is not None:
        raise HTTPException(404, "Ảnh không tồn tại")
    return img


@router.get("/images/{image_id}/file")
def image_file(image_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    img = _image(db, image_id, user)
    try:
        data = get_storage().get(img.storage_key)
    except Exception:
        raise HTTPException(404, "Không tìm thấy tệp ảnh trong storage")
    return Response(data, media_type=img.content_type,
                    headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
                             "Content-Disposition": "inline"})


@router.patch("/images/{image_id}", response_model=ImageOut)
def update_image(image_id: uuid.UUID, body: ImagePatch, request: Request,
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    img = _image(db, image_id, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(img, k, v)
    audit(db, request, user.id, "image.update", "image", img.id)
    db.commit()
    return img


@router.put("/images/{image_id}/file", response_model=ImageOut)
async def replace_image(image_id: uuid.UUID, request: Request, file: UploadFile = File(...),
                        user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Thay ảnh: ghi object mới, cập nhật DB, rồi mới xóa object cũ."""
    img = _image(db, image_id, user)
    s = get_settings()
    if not limiter.hit(f"upload:{user.id}", s.upload_rate_limit, s.upload_rate_window_s):
        raise HTTPException(429, "Tải ảnh quá nhanh, vui lòng thử lại sau")
    data, ctype = await _read_validated(file)
    old_key = img.storage_key
    new_key = f"u/{user.id}/{img.id}-{uuid.uuid4().hex[:8]}.{EXT[ctype]}"
    get_storage().put(new_key, data, ctype)
    img.storage_key, img.content_type, img.size_bytes = new_key, ctype, len(data)
    img.sha256 = hashlib.sha256(data).hexdigest()
    img.original_filename = (file.filename or "")[:255]
    try:
        audit(db, request, user.id, "image.replace", "image", img.id)
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(new_key)
        raise
    try:
        get_storage().delete(old_key)
    except Exception:  # noqa: BLE001
        pass
    return img


@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Xóa 2 pha: (1) đánh dấu deleted_at và commit; (2) xóa object; (3) đánh dấu storage_purged_at.
    Nếu bước 2 lỗi, bản ghi vẫn còn để `cli gc-storage` thử lại — không bao giờ mất liên kết."""
    img = _image(db, image_id, user)
    img.deleted_at = datetime.now(timezone.utc)
    audit(db, request, user.id, "image.delete", "image", img.id)
    db.commit()
    try:
        get_storage().delete(img.storage_key)
        img.storage_purged_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
