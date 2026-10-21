"""Công cụ vận hành.

  python -m app.cli export-user --email a@b.c --out export.zip   # xuất dữ liệu kể cả khi tài khoản đã ngưng
  python -m app.cli verify-storage                               # kiểm tra mọi ảnh trong DB đều có object (sau khôi phục)
  python -m app.cli gc-storage                                   # dọn object của ảnh đã đánh dấu xóa
  python -m app.cli purge-sessions                               # xóa phiên đăng nhập hết hạn
"""
import argparse
import hashlib
import sys
from datetime import datetime, timezone

from sqlalchemy import delete, func, select

from .csv_io import build_user_archive
from .db import SessionLocal
from .models import TradeImage, User, UserSession
from .storage import get_storage


def export_user(email: str, out: str, no_images: bool) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if not user:
            print("Không tìm thấy người dùng", file=sys.stderr)
            return 1
        data = build_user_archive(db, user, get_storage(), include_images=not no_images)
    with open(out, "wb") as f:
        f.write(data)
    print(f"Đã ghi {out} ({len(data)} bytes)")
    return 0


def verify_storage(check_hash: bool) -> int:
    st = get_storage()
    missing = bad = total = 0
    with SessionLocal() as db:
        for img in db.scalars(select(TradeImage).where(TradeImage.deleted_at.is_(None))):
            total += 1
            if not st.exists(img.storage_key):
                missing += 1
                print(f"THIẾU  {img.id} {img.storage_key}")
            elif check_hash and hashlib.sha256(st.get(img.storage_key)).hexdigest() != img.sha256:
                bad += 1
                print(f"SAI HASH {img.id} {img.storage_key}")
    print(f"Tổng {total} ảnh, thiếu {missing}, sai hash {bad}")
    return 1 if (missing or bad) else 0


def gc_storage() -> int:
    st = get_storage()
    n = 0
    with SessionLocal() as db:
        for img in db.scalars(select(TradeImage).where(TradeImage.deleted_at.is_not(None),
                                                       TradeImage.storage_purged_at.is_(None))):
            st.delete(img.storage_key)
            img.storage_purged_at = datetime.now(timezone.utc)
            db.commit()
            n += 1
    print(f"Đã dọn {n} object")
    return 0


def purge_sessions() -> int:
    with SessionLocal() as db:
        r = db.execute(delete(UserSession).where(UserSession.expires_at < datetime.now(timezone.utc)))
        db.commit()
    print(f"Đã xóa {r.rowcount} phiên hết hạn")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="tradejournal")
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export-user")
    e.add_argument("--email", required=True)
    e.add_argument("--out", required=True)
    e.add_argument("--no-images", action="store_true")
    v = sub.add_parser("verify-storage")
    v.add_argument("--check-hash", action="store_true")
    sub.add_parser("gc-storage")
    sub.add_parser("purge-sessions")
    a = p.parse_args(argv)
    if a.cmd == "export-user":
        return export_user(a.email, a.out, a.no_images)
    if a.cmd == "verify-storage":
        return verify_storage(a.check_hash)
    if a.cmd == "gc-storage":
        return gc_storage()
    return purge_sessions()


if __name__ == "__main__":
    sys.exit(main())
