"""Băm mật khẩu (Argon2id) và token phiên đăng nhập."""
import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_ph = PasswordHasher()  # Argon2id, tham số mặc định theo khuyến nghị của argon2-cffi


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _ph.check_needs_rehash(hashed)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# Băm giả để thời gian phản hồi đăng nhập không lộ email có tồn tại hay không
DUMMY_HASH = _ph.hash(secrets.token_urlsafe(16))
