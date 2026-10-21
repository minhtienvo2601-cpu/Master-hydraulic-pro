"""Dữ liệu giá OHLC cho biểu đồ tương tác.

MVP chưa tích hợp nhà cung cấp dữ liệu giá. Người dùng tự nhập CSV OHLC từ nguồn họ có quyền sử dụng
(ví dụ xuất từ MT5 của chính họ). Ứng dụng KHÔNG sinh dữ liệu nến giả; nếu không có dữ liệu,
giao diện chỉ hiển thị ảnh và thông báo chưa có nguồn giá. Mọi series đều ghi rõ nguồn.
"""
import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..csv_io import _dt, _num
from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import PriceBar, PriceSeries, User
from ..schemas import valid_tz

router = APIRouter(prefix="/prices", tags=["prices"])
MAX_BARS_RESPONSE = 5000


def _series_out(s: PriceSeries) -> dict:
    return {"id": str(s.id), "symbol": s.symbol, "timeframe": s.timeframe, "source": s.source,
            "bar_count": s.bar_count, "first_ts": s.first_ts.isoformat() if s.first_ts else None,
            "last_ts": s.last_ts.isoformat() if s.last_ts else None}


@router.get("/series")
def list_series(symbol: str | None = None, timeframe: str | None = None,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(PriceSeries).where(PriceSeries.user_id == user.id)
    if symbol:
        stmt = stmt.where(PriceSeries.symbol == symbol.upper())
    if timeframe:
        stmt = stmt.where(PriceSeries.timeframe == timeframe)
    return [_series_out(s) for s in db.scalars(stmt.order_by(PriceSeries.symbol, PriceSeries.timeframe))]


@router.post("/series/import", status_code=201)
async def import_series(request: Request, file: UploadFile = File(...), symbol: str = Form(...),
                        timeframe: str = Form(...), source: str = Form(...), timezone_name: str = Form("UTC", alias="timezone"),
                        user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Nhập nến OHLC. Cột: time, open, high, low, close[, volume]. Nến trùng thời điểm sẽ được ghi đè."""
    s = get_settings()
    if not source.strip():
        raise HTTPException(422, "Phải ghi rõ nguồn dữ liệu giá")
    try:
        valid_tz(timezone_name)
    except ValueError as e:
        raise HTTPException(422, str(e))
    content = await file.read(s.max_csv_mb * 4 * 1024 * 1024 + 1)
    if len(content) > s.max_csv_mb * 4 * 1024 * 1024:
        raise HTTPException(413, "Tệp quá lớn")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "Tệp CSV phải mã hóa UTF-8")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    reader.fieldnames = [h.strip().lower().strip("<>") for h in (reader.fieldnames or [])]
    need = {"open", "high", "low", "close"}
    if not need <= set(reader.fieldnames) or not {"time", "date"} & set(reader.fieldnames):
        raise HTTPException(422, "CSV cần các cột: time (hoặc date + time như MT5), open, high, low, close")
    split_dt = "date" in reader.fieldnames  # MT5 xuất <DATE> và <TIME> thành 2 cột
    bars: dict[datetime, dict] = {}
    errors = []
    for i, r in enumerate(reader, start=2):
        try:
            ts = _dt(f"{r['date']} {r.get('time') or ''}".strip() if split_dt else r["time"], timezone_name)
            o, h, l, c = (_num(r[k]) for k in ("open", "high", "low", "close"))
            if None in (ts, o, h, l, c):
                raise ValueError("thiếu giá trị")
            if h < max(o, c) or l > min(o, c) or l > h:
                raise ValueError("OHLC không nhất quán (high/low)")
            bars[ts.astimezone(timezone.utc)] = {"open": o, "high": h, "low": l, "close": c,
                                                 "volume": _num(r.get("volume", "") or "")}
        except (ValueError, KeyError) as e:
            errors.append({"line": i, "error": str(e)})
        if len(errors) > 200:
            break
    if errors:
        raise HTTPException(422, {"message": "Dữ liệu giá có lỗi, không nhập dòng nào", "errors": errors[:200]})
    if not bars:
        raise HTTPException(422, "Không có nến nào")
    series = db.scalar(select(PriceSeries).where(PriceSeries.user_id == user.id, PriceSeries.symbol == symbol.upper(),
                                                 PriceSeries.timeframe == timeframe, PriceSeries.source == source.strip()))
    if series is None:
        series = PriceSeries(user_id=user.id, symbol=symbol.upper(), timeframe=timeframe, source=source.strip())
        db.add(series)
        db.flush()
    db.execute(delete(PriceBar).where(PriceBar.series_id == series.id, PriceBar.ts.in_(list(bars))))
    db.add_all(PriceBar(series_id=series.id, ts=ts, **v) for ts, v in bars.items())
    db.flush()
    series.bar_count, series.first_ts, series.last_ts = db.execute(
        select(func.count(), func.min(PriceBar.ts), func.max(PriceBar.ts)).where(PriceBar.series_id == series.id)).one()
    audit(db, request, user.id, "prices.import", "price_series", series.id, bars=len(bars))
    db.commit()
    return _series_out(series)


@router.get("/series/{series_id}/bars")
def get_bars(series_id: uuid.UUID, start: datetime | None = None, end: datetime | None = None,
             limit: int = Query(1000, ge=1, le=MAX_BARS_RESPONSE),
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    series = owned(db, PriceSeries, series_id, user, "Dữ liệu giá")
    stmt = select(PriceBar).where(PriceBar.series_id == series.id)
    if start:
        stmt = stmt.where(PriceBar.ts >= start)
    if end:
        stmt = stmt.where(PriceBar.ts <= end)
    rows = db.scalars(stmt.order_by(PriceBar.ts).limit(limit)).all()
    return {"series": _series_out(series),
            "bars": [{"time": int(b.ts.timestamp()), "open": float(b.open), "high": float(b.high),
                      "low": float(b.low), "close": float(b.close)} for b in rows]}


@router.delete("/series/{series_id}", status_code=204)
def delete_series(series_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    series = owned(db, PriceSeries, series_id, user, "Dữ liệu giá")
    db.execute(delete(PriceBar).where(PriceBar.series_id == series.id))
    db.delete(series)
    audit(db, request, user.id, "prices.delete", "price_series", series_id)
    db.commit()
