from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import audit, csrf_guard, current_user, rate_limit
from ..models import User, UserSession
from ..schemas import LoginIn, PasswordIn, ProfileIn, RegisterIn, UserOut
from ..security import DUMMY_HASH, hash_password, needs_rehash, new_session_token, token_hash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
auth_limit = rate_limit("auth", "auth_rate_limit", "auth_rate_window_s")


def _start_session(db: Session, request: Request, response: Response, user: User) -> None:
    s = get_settings()
    token = new_session_token()
    db.add(UserSession(user_id=user.id, token_hash=token_hash(token),
                       expires_at=datetime.now(timezone.utc) + timedelta(hours=s.session_ttl_hours),
                       user_agent=(request.headers.get("user-agent") or "")[:255]))
    response.set_cookie(s.session_cookie_name, token, max_age=s.session_ttl_hours * 3600, httponly=True,
                        secure=s.cookie_secure, samesite="lax", path="/")


@router.post("/register", response_model=UserOut, status_code=201,
             dependencies=[Depends(csrf_guard), Depends(auth_limit)])
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(409, "Email đã được đăng ký")
    user = User(email=email, password_hash=hash_password(body.password),
                display_name=body.display_name, timezone=body.timezone)
    db.add(user)
    db.flush()
    _start_session(db, request, response, user)
    audit(db, request, user.id, "auth.register", "user", user.id)
    db.commit()
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(csrf_guard), Depends(auth_limit)])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok or not user.is_active:
        audit(db, request, user.id if user else None, "auth.login_failed")
        db.commit()
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    # dọn phiên hết hạn của người dùng
    db.execute(delete(UserSession).where(UserSession.user_id == user.id,
                                         UserSession.expires_at < datetime.now(timezone.utc)))
    _start_session(db, request, response, user)
    audit(db, request, user.id, "auth.login")
    db.commit()
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(UserSession).where(UserSession.id == request.state.session_id))
    audit(db, request, user.id, "auth.logout")
    db.commit()
    response.delete_cookie(get_settings().session_cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.timezone is not None:
        user.timezone = body.timezone
    db.add(user)
    audit(db, request, user.id, "user.update_profile", "user", user.id)
    db.commit()
    return user


@router.post("/password", status_code=204, dependencies=[Depends(auth_limit)])
def change_password(body: PasswordIn, request: Request, response: Response,
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    user.password_hash = hash_password(body.new_password)
    # đăng xuất mọi phiên khác
    db.execute(delete(UserSession).where(UserSession.user_id == user.id,
                                         UserSession.id != request.state.session_id))
    db.add(user)
    audit(db, request, user.id, "auth.password_changed", "user", user.id)
    db.commit()
