import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy import asc, desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import Account, BacktestSession, StrategyVersion, Tag, Trade, TradeImage, User
from ..queries import TradeFilter, apply_filter, trade_filter
from ..schemas import TradeIn, TradeOut, TradePage
from ..storage import get_storage
from ..trade_calc import derive

router = APIRouter(prefix="/trades", tags=["trades"])

EDITABLE = [f for f in TradeIn.model_fields if f not in ("tags", "row_version", "code")]
SORTS = {"entry_time": Trade.entry_time, "exit_time": Trade.exit_time, "net_pnl": Trade.net_pnl,
         "r_multiple": Trade.r_multiple, "code": Trade.code}


def gen_code(trade_type: str, when: datetime) -> str:
    return f"{'L' if trade_type == 'live' else 'B'}-{when:%Y%m%d}-{secrets.token_hex(3).upper()}"


def check_refs(db: Session, user: User, body) -> None:
    """Mọi khóa ngoại phải thuộc cùng người dùng."""
    if body.account_id:
        owned(db, Account, body.account_id, user, "Tài khoản")
    if body.strategy_version_id:
        owned(db, StrategyVersion, body.strategy_version_id, user, "Phiên bản chiến lược")
    if body.backtest_session_id:
        s = owned(db, BacktestSession, body.backtest_session_id, user, "Phiên backtest")
        if body.strategy_version_id and body.strategy_version_id != s.strategy_version_id:
            raise HTTPException(422, "Phiên bản chiến lược phải trùng với phiên bản của phiên backtest")


def set_tags(db: Session, user: User, trade: Trade, names: list[str]) -> None:
    clean = sorted({n.strip()[:60] for n in names if n and n.strip()})
    tags = []
    for n in clean:
        tag = db.scalar(select(Tag).where(Tag.user_id == user.id, Tag.name == n))
        if tag is None:
            tag = Tag(user_id=user.id, name=n)
            db.add(tag)
            db.flush()
        tags.append(tag)
    trade.tags = tags


def image_counts(db: Session, ids: list[uuid.UUID]) -> dict:
    if not ids:
        return {}
    rows = db.execute(select(TradeImage.trade_id, func.count()).where(
        TradeImage.trade_id.in_(ids), TradeImage.deleted_at.is_(None)).group_by(TradeImage.trade_id)).all()
    return dict(rows)


def to_out(t: Trade, count: int = 0) -> TradeOut:
    out = TradeOut.model_validate(t)
    out.image_count = count
    return out


@router.get("", response_model=TradePage)
def list_trades(f: TradeFilter = Depends(trade_filter), page: int = Query(1, ge=1),
                page_size: int = Query(25, ge=1, le=100),
                sort: str = Query("entry_time", pattern="^(entry_time|exit_time|net_pnl|r_multiple|code)$"),
                order: str = Query("desc", pattern="^(asc|desc)$"),
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    base = apply_filter(select(Trade), f, user)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    col = SORTS[sort]
    direction = desc if order == "desc" else asc
    stmt = base.order_by(direction(col).nulls_last(), desc(Trade.created_at), Trade.id) \
               .offset((page - 1) * page_size).limit(page_size)
    items = db.scalars(stmt).all()
    counts = image_counts(db, [t.id for t in items])
    return TradePage(items=[to_out(t, counts.get(t.id, 0)) for t in items], total=total or 0,
                     page=page, page_size=page_size)


@router.post("", response_model=TradeOut, status_code=201)
def create_trade(body: TradeIn, request: Request, response: Response,
                 idempotency_key: str | None = Header(None, max_length=100),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Tạo giao dịch. Gửi header Idempotency-Key để thao tác lặp lại (do mạng chập chờn) không tạo bản ghi trùng."""
    if idempotency_key:
        existing = db.scalar(select(Trade).where(Trade.user_id == user.id, Trade.idempotency_key == idempotency_key))
        if existing:
            response.status_code = 200
            return to_out(existing, image_counts(db, [existing.id]).get(existing.id, 0))
    check_refs(db, user, body)
    if body.backtest_session_id and not body.strategy_version_id:
        body.strategy_version_id = db.get(BacktestSession, body.backtest_session_id).strategy_version_id
    t = Trade(user_id=user.id, idempotency_key=idempotency_key,
              code=(body.code or "").strip() or gen_code(body.trade_type, body.entry_time))
    for f in EDITABLE:
        setattr(t, f, getattr(body, f))
    derive(t)
    db.add(t)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        if idempotency_key and "idem" in str(e.orig):
            existing = db.scalar(select(Trade).where(Trade.user_id == user.id, Trade.idempotency_key == idempotency_key))
            response.status_code = 200
            return to_out(existing)
        raise HTTPException(409, "Mã giao dịch đã tồn tại")
    set_tags(db, user, t, body.tags)
    audit(db, request, user.id, "trade.create", "trade", t.id, trade_type=t.trade_type)
    db.commit()
    db.refresh(t)
    return to_out(t)


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = owned(db, Trade, trade_id, user, "Giao dịch")
    return to_out(t, image_counts(db, [t.id]).get(t.id, 0))


@router.put("/{trade_id}", response_model=TradeOut)
def update_trade(trade_id: uuid.UUID, body: TradeIn, request: Request,
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Cập nhật tại chỗ (không tạo bản ghi mới). row_version chống ghi đè khi sửa đồng thời trên 2 thiết bị."""
    t = owned(db, Trade, trade_id, user, "Giao dịch")
    if body.row_version is None or body.row_version != t.row_version:
        raise HTTPException(409, "Giao dịch đã được thay đổi ở nơi khác. Hãy tải lại trước khi lưu.")
    if body.trade_type != t.trade_type:
        raise HTTPException(422, "Không thể đổi loại giao dịch Live/Backtest; hãy tạo bản ghi mới")
    check_refs(db, user, body)
    changed = [f for f in EDITABLE if getattr(t, f) != getattr(body, f)]
    for f in EDITABLE:
        setattr(t, f, getattr(body, f))
    if body.code and body.code.strip() and body.code.strip() != t.code:
        t.code = body.code.strip()
        changed.append("code")
    derive(t)
    t.row_version += 1
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Mã giao dịch đã tồn tại")
    set_tags(db, user, t, body.tags)
    audit(db, request, user.id, "trade.update", "trade", t.id, fields=changed)
    db.commit()
    db.refresh(t)
    return to_out(t, image_counts(db, [t.id]).get(t.id, 0))


@router.delete("/{trade_id}", status_code=204)
def delete_trade(trade_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Xóa giao dịch và ảnh của nó. Object ảnh chỉ bị xóa khỏi storage SAU khi DB commit thành công."""
    t = owned(db, Trade, trade_id, user, "Giao dịch")
    imgs = db.scalars(select(TradeImage).where(TradeImage.trade_id == t.id)).all()
    keys = [i.storage_key for i in imgs if i.storage_purged_at is None]
    for i in imgs:
        db.delete(i)
    db.flush()
    db.delete(t)
    audit(db, request, user.id, "trade.delete", "trade", trade_id, code=t.code, images=len(imgs))
    db.commit()
    purge_objects(keys)


def purge_objects(keys: list[str]) -> None:
    st = get_storage()
    for k in keys:
        try:
            st.delete(k)
        except Exception:  # noqa: BLE001 — object mồ côi sẽ được job dọn dẹp (cli gc-storage) xử lý
            pass


@router.get("/meta/options")
def trade_options(trade_type: str | None = Query(None, pattern="^(live|backtest)$"),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Các giá trị đã dùng (thị trường, setup...) để gợi ý trong form và bộ lọc."""
    out = {}
    for name, col in (("markets", Trade.market), ("timeframes", Trade.timeframe), ("setups", Trade.setup),
                      ("trading_sessions", Trade.trading_session), ("market_conditions", Trade.market_condition),
                      ("emotions", Trade.emotion)):
        stmt = select(col).where(Trade.user_id == user.id, col != "").distinct().order_by(col).limit(200)
        if trade_type:
            stmt = stmt.where(Trade.trade_type == trade_type)
        out[name] = list(db.scalars(stmt).all())
    out["tags"] = list(db.scalars(select(Tag.name).where(Tag.user_id == user.id).order_by(Tag.name)).all())
    out["server_time"] = datetime.now(timezone.utc).isoformat()
    return out
