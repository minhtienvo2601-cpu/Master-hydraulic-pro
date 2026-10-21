import hashlib
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..csv_io import build_user_archive, parse_trades_csv, sessions_csv, strategies_csv, stats_report, trades_csv
from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import Account, BacktestSession, ImportJob, StrategyVersion, Trade, User
from ..queries import TradeFilter, apply_filter, trade_filter
from ..schemas import ImportJobOut, TradeIn
from ..storage import get_storage
from ..trade_calc import derive
from .trades import gen_code, set_tags

router = APIRouter(tags=["import-export"])


def _csv_response(text: str, name: str) -> Response:
    return Response("﻿" + text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/import/trades/preview", response_model=ImportJobOut, status_code=201)
async def import_preview(request: Request, file: UploadFile = File(...),
                         trade_type: str = Form(""), account_id: str = Form(""),
                         backtest_session_id: str = Form(""), strategy_version_id: str = Form(""),
                         timezone_name: str = Form("", alias="timezone"),
                         user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Bước 1: tải CSV lên, kiểm tra từng dòng, đánh dấu dòng trùng. Chưa ghi giao dịch nào."""
    s = get_settings()
    content = await file.read(s.max_csv_mb * 1024 * 1024 + 1)
    if len(content) > s.max_csv_mb * 1024 * 1024:
        raise HTTPException(413, f"Tệp CSV vượt quá {s.max_csv_mb} MB")
    try:
        content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "Tệp CSV phải mã hóa UTF-8")
    opts = {"trade_type": trade_type or None, "timezone": timezone_name or None}
    for key, val, model, label in (("account_id", account_id, Account, "Tài khoản"),
                                   ("backtest_session_id", backtest_session_id, BacktestSession, "Phiên backtest"),
                                   ("strategy_version_id", strategy_version_id, StrategyVersion, "Phiên bản")):
        if val:
            try:
                opts[key] = str(owned(db, model, uuid.UUID(val), user, label).id)
            except ValueError:
                raise HTTPException(422, f"{label} không hợp lệ")
    if opts["timezone"]:
        from ..schemas import valid_tz
        try:
            valid_tz(opts["timezone"])
        except ValueError as e:
            raise HTTPException(422, str(e))
    parsed = parse_trades_csv(db, user, content, opts, s.max_csv_rows)
    if parsed["fatal"]:
        raise HTTPException(422, parsed["fatal"])
    job = ImportJob(user_id=user.id, filename=(file.filename or "")[:255],
                    file_sha256=hashlib.sha256(content).hexdigest(), options=opts,
                    total_rows=parsed["total"], valid_rows=len(parsed["rows"]),
                    duplicate_rows=parsed["duplicates"],
                    error_rows=len([e for e in parsed["errors"] if not e.get("duplicate")]),
                    errors=parsed["errors"][:1000], payload=parsed["rows"])
    db.add(job)
    db.flush()
    audit(db, request, user.id, "import.preview", "import_job", job.id, rows=parsed["total"])
    db.commit()
    return job


@router.post("/import/jobs/{job_id}/commit", response_model=ImportJobOut)
def import_commit(job_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Bước 2: ghi các dòng hợp lệ trong một transaction. Gọi lại nhiều lần không nhập lặp."""
    job = owned(db, ImportJob, job_id, user, "Phiên nhập")
    if job.status == "committed":
        return job
    rows = job.payload or []
    imported = skipped = 0
    try:
        for row in rows:
            line = row.pop("_line", None)
            h = row.pop("import_hash")
            if db.scalar(select(Trade.id).where(Trade.user_id == user.id, Trade.import_hash == h)):
                skipped += 1
                continue
            body = TradeIn.model_validate(row)
            t = Trade(user_id=user.id, import_hash=h, import_job_id=job.id,
                      code=body.code or gen_code(body.trade_type, body.entry_time))
            for f in TradeIn.model_fields:
                if f not in ("tags", "row_version", "code"):
                    setattr(t, f, getattr(body, f))
            derive(t)
            try:
                with db.begin_nested():
                    db.add(t)
                    db.flush()
            except IntegrityError:
                skipped += 1
                job.errors = [*job.errors, {"line": line, "duplicate": True, "errors": ["Trùng mã giao dịch khi ghi"]}]
                continue
            set_tags(db, user, t, body.tags)
            imported += 1
        job.status = "committed"
        job.imported_rows = imported
        job.duplicate_rows += skipped
        job.committed_at = datetime.now(timezone.utc)
        job.payload = None
        audit(db, request, user.id, "import.commit", "import_job", job.id, imported=imported, skipped=skipped)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return job


@router.get("/import/jobs", response_model=list[ImportJobOut])
def list_jobs(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(ImportJob).where(ImportJob.user_id == user.id)
                      .order_by(ImportJob.created_at.desc()).limit(50)).all()


@router.get("/export/trades.csv")
def export_trades(request: Request, f: TradeFilter = Depends(trade_filter),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    trades = list(db.scalars(apply_filter(select(Trade), f, user).order_by(Trade.entry_time, Trade.id)))
    audit(db, request, user.id, "export.trades_csv", rows=len(trades))
    db.commit()
    return _csv_response(trades_csv(db, user, trades), f"tradejournal-trades-{date.today()}.csv")


@router.get("/export/strategies.csv")
def export_strategies(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _csv_response(strategies_csv(db, user), f"tradejournal-strategies-{date.today()}.csv")


@router.get("/export/backtest-sessions.csv")
def export_sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _csv_response(sessions_csv(db, user), f"tradejournal-backtest-sessions-{date.today()}.csv")


@router.get("/export/stats.json")
def export_stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return stats_report(db, user)


@router.get("/export/archive.zip")
def export_archive(request: Request, include_images: bool = True,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = build_user_archive(db, user, get_storage(), include_images=include_images)
    audit(db, request, user.id, "export.archive", size=len(data))
    db.commit()
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="tradejournal-export-{date.today()}.zip"'})
