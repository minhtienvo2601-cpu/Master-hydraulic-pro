import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuditLog, User, UserSession
from .ratelimit import limiter
from .security import token_hash

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "tradejournal"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def csrf_guard(request: Request) -> None:
    """Chống CSRF cho xác thực bằng cookie: mọi yêu cầu thay đổi dữ liệu phải có header tùy biến.
    Trình duyệt không cho trang khác gửi header này tới API mà không qua CORS preflight (đã bị chặn)."""
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(403, "Thiếu header X-Requested-With")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    csrf_guard(request)
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        raise HTTPException(401, "Chưa đăng nhập")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    if sess is None or sess.expires_at.replace(tzinfo=sess.expires_at.tzinfo or timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(401, "Phiên đăng nhập hết hạn")
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Tài khoản không hoạt động")
    request.state.session_id = sess.id
    return user


def rate_limit(scope: str, limit_attr: str, window_attr: str):
    def dep(request: Request) -> None:
        s = get_settings()
        if not limiter.hit(f"{scope}:{client_ip(request)}", getattr(s, limit_attr), getattr(s, window_attr)):
            raise HTTPException(429, "Quá nhiều yêu cầu, vui lòng thử lại sau")

    return dep


def audit(db: Session, request: Request | None, user_id: uuid.UUID | None, action: str,
          entity: str = "", entity_id: object = "", **meta) -> None:
    """Ghi lịch sử thao tác quan trọng. Không ghi mật khẩu/token/nội dung nhạy cảm vào meta."""
    db.add(AuditLog(user_id=user_id, action=action, entity=entity, entity_id=str(entity_id or ""),
                    meta=meta, ip=client_ip(request) if request else ""))


def owned(db: Session, model, obj_id: uuid.UUID, user: User, label: str = "Bản ghi"):
    """Lấy bản ghi thuộc về người dùng; trả 404 (không phải 403) để không lộ sự tồn tại dữ liệu người khác."""
    obj = db.get(model, obj_id)
    if obj is None or obj.user_id != user.id:
        raise HTTPException(404, f"{label} không tồn tại")
    return obj
