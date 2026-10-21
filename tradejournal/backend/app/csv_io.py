"""Nhập/xuất CSV giao dịch. Định dạng cột xem docs/CSV_FORMAT.md. Tệp xuất ra có thể nhập lại nguyên vẹn."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Account, BacktestSession, Strategy, StrategyVersion, Trade, TradeImage, User
from .schemas import TradeIn
from .stats import compute_stats, stats_to_dict
from .queries import load_stat_trades

TRADE_COLUMNS = [
    "code", "trade_type", "account", "backtest_session", "strategy", "strategy_version", "market", "direction",
    "status", "entry_time", "exit_time", "timeframe", "trading_session", "entry_price", "stop_loss",
    "take_profit", "exit_price", "volume", "risk_amount", "gross_pnl", "commission", "swap", "other_fees",
    "r_manual", "net_pnl", "r_multiple", "r_source", "outcome", "setup", "trend", "key_levels", "confirmation",
    "market_condition", "entry_reason", "exit_reason", "plan_compliance", "mistakes", "emotion", "lessons",
    "notes", "chart_link", "tags", "is_draft", "id",
]
# Cột chỉ để xuất (backend luôn tự tính lại khi nhập)
DERIVED = {"net_pnl", "r_multiple", "r_source", "outcome", "id"}
REQUIRED = {"market", "direction", "entry_time", "entry_price"}
NUMERIC = ["entry_price", "stop_loss", "take_profit", "exit_price", "volume", "risk_amount", "gross_pnl",
           "commission", "swap", "other_fees", "r_manual"]
TEXT = ["timeframe", "trading_session", "setup", "trend", "key_levels", "confirmation", "market_condition",
        "entry_reason", "exit_reason", "mistakes", "emotion", "lessons", "notes", "chart_link"]
DIRECTION_ALIASES = {"buy": "buy", "long": "buy", "mua": "buy", "sell": "sell", "short": "sell", "ban": "sell", "bán": "sell"}


def _num(v: str) -> Decimal | None:
    v = (v or "").strip().replace(" ", "")
    if v == "":
        return None
    if "," in v and "." not in v:
        v = v.replace(",", ".")
    try:
        d = Decimal(v)
    except InvalidOperation:
        raise ValueError(f"'{v}' không phải số hợp lệ")
    if not d.is_finite():
        raise ValueError(f"'{v}' không phải số hợp lệ")
    return d


def _dt(v: str, tz: str) -> datetime | None:
    v = (v or "").strip()
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00").replace("/", "-"))
    except ValueError:
        for fmt in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%d-%m-%Y %H:%M", "%d-%m-%Y %H:%M:%S"):
            try:
                d = datetime.strptime(v.replace("/", "-"), fmt)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"Thời gian '{v}' không đúng định dạng (dùng ISO 8601, ví dụ 2024-03-01 14:30)")
    if d.tzinfo is None:
        d = d.replace(tzinfo=ZoneInfo(tz))
    return d


def import_hash(row: dict) -> str:
    """Khóa chống trùng khi nhập CSV nhiều lần: các trường xác định một giao dịch."""
    parts = [row["trade_type"], str(row.get("account_id") or ""), str(row.get("backtest_session_id") or ""),
             row["market"], row["direction"], row["entry_time"], _norm(row["entry_price"]),
             _norm(row.get("volume")), row.get("exit_time") or "", _norm(row.get("exit_price"))]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _norm(v) -> str:
    if v in (None, ""):
        return ""
    return format(Decimal(str(v)).normalize(), "f")


class Resolver:
    def __init__(self, db: Session, user: User) -> None:
        self.accounts = {a.name.lower(): a.id for a in db.scalars(select(Account).where(Account.user_id == user.id))}
        self.sessions = {s.name.lower(): s for s in db.scalars(select(BacktestSession).where(BacktestSession.user_id == user.id))}
        self.versions = {}
        for v, sname in db.execute(select(StrategyVersion, Strategy.name).join(Strategy)
                                   .where(StrategyVersion.user_id == user.id)):
            self.versions[(sname.lower(), str(v.version_no))] = v.id
            self.versions[(sname.lower(), v.label.lower())] = v.id


def parse_trades_csv(db: Session, user: User, content: bytes, options: dict, max_rows: int) -> dict:
    """Phân tích + kiểm tra từng dòng. Không ghi DB. Trả về các dòng hợp lệ đã chuẩn hóa và lỗi theo dòng."""
    text = content.decode("utf-8-sig")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = REQUIRED - set(headers)
    if missing:
        return {"fatal": f"Thiếu cột bắt buộc: {', '.join(sorted(missing))}", "rows": [], "errors": [], "total": 0}
    reader.fieldnames = headers
    tz = options.get("timezone") or user.timezone
    res = Resolver(db, user)
    existing_hashes = set(db.scalars(select(Trade.import_hash).where(Trade.user_id == user.id,
                                                                     Trade.import_hash.is_not(None))))
    existing_codes = set(db.scalars(select(Trade.code).where(Trade.user_id == user.id)))
    rows, errors, seen, seen_codes = [], [], set(), set()
    total = dup = 0
    for i, raw in enumerate(reader, start=2):  # dòng 1 là tiêu đề
        if total >= max_rows:
            errors.append({"line": i, "errors": [f"Vượt quá giới hạn {max_rows} dòng mỗi lần nhập"]})
            break
        raw = {k: (v or "").strip() for k, v in raw.items() if k}
        if not any(raw.values()):
            continue
        total += 1
        errs: list[str] = []
        try:
            row = _build_row(raw, options, tz, res, errs)
        except ValueError as e:
            errs.append(str(e))
            row = None
        if row is not None and not errs:
            try:
                TradeIn.model_validate(row)
            except ValidationError as e:
                for err in e.errors():
                    loc = ".".join(str(x) for x in err["loc"]) or "dòng"
                    errs.append(f"{loc}: {err['msg'].removeprefix('Value error, ')}")
        if errs:
            errors.append({"line": i, "errors": errs})
            continue
        h = import_hash(row)
        code = row.get("code")
        if h in existing_hashes or h in seen or (code and (code in existing_codes or code in seen_codes)):
            dup += 1
            errors.append({"line": i, "duplicate": True, "errors": ["Trùng giao dịch đã có (sẽ bỏ qua)"]})
            continue
        seen.add(h)
        if code:
            seen_codes.add(code)
        row["import_hash"] = h
        row["_line"] = i
        rows.append(row)
    return {"fatal": None, "rows": rows, "errors": errors, "total": total, "duplicates": dup}


def _build_row(raw: dict, options: dict, tz: str, res: Resolver, errs: list[str]) -> dict:
    ttype = (raw.get("trade_type") or options.get("trade_type") or "").lower()
    if ttype not in ("live", "backtest"):
        raise ValueError("trade_type phải là live hoặc backtest (cột hoặc tùy chọn nhập)")
    row: dict = {"trade_type": ttype, "code": raw.get("code") or None, "market": raw.get("market", "").upper()}
    d = DIRECTION_ALIASES.get(raw.get("direction", "").lower())
    if not d:
        errs.append("direction phải là buy/sell")
    row["direction"] = d or "buy"
    st = (raw.get("status") or "closed").lower()
    if st not in ("open", "closed", "cancelled"):
        errs.append("status phải là open/closed/cancelled")
    row["status"] = st
    for col in ("entry_time", "exit_time"):
        try:
            v = _dt(raw.get(col, ""), tz)
            row[col] = v.isoformat() if v else None
        except ValueError as e:
            errs.append(f"{col}: {e}")
    for col in NUMERIC:
        try:
            v = _num(raw.get(col, ""))
            row[col] = str(v) if v is not None else None
        except ValueError as e:
            errs.append(f"{col}: {e}")
    for col in ("commission", "swap", "other_fees"):
        if row.get(col) is None:
            row[col] = "0"
    for col in TEXT:
        row[col] = _unsafe_cell(raw.get(col, ""))
    pc = raw.get("plan_compliance", "").lower()
    row["plan_compliance"] = pc
    row["tags"] = [t.strip() for t in raw.get("tags", "").replace(",", ";").split(";") if t.strip()]
    row["is_draft"] = raw.get("is_draft", "").lower() in ("1", "true", "yes", "x")

    # Tham chiếu theo tên (không tự tạo mới để tránh rác dữ liệu)
    acc = raw.get("account")
    if acc:
        row["account_id"] = res.accounts.get(acc.lower())
        if row["account_id"] is None:
            errs.append(f"Không tìm thấy tài khoản '{acc}'")
    else:
        row["account_id"] = options.get("account_id") if ttype == "live" else None
    sess = raw.get("backtest_session")
    if sess:
        s = res.sessions.get(sess.lower())
        if s is None:
            errs.append(f"Không tìm thấy phiên backtest '{sess}'")
        row["backtest_session_id"] = s.id if s else None
    else:
        row["backtest_session_id"] = options.get("backtest_session_id") if ttype == "backtest" else None
    if row["backtest_session_id"]:
        s = next((x for x in res.sessions.values() if str(x.id) == str(row["backtest_session_id"])), None)
        if s is None:
            errs.append("Phiên backtest không hợp lệ")
        else:
            row["strategy_version_id"] = s.strategy_version_id
    strat, ver = raw.get("strategy"), raw.get("strategy_version")
    if strat and ver:
        vid = res.versions.get((strat.lower(), ver.lower().lstrip("v")) ) or res.versions.get((strat.lower(), ver.lower()))
        if vid is None:
            errs.append(f"Không tìm thấy chiến lược '{strat}' phiên bản '{ver}'")
        elif row.get("strategy_version_id") and row["strategy_version_id"] != vid:
            errs.append("Phiên bản chiến lược không khớp với phiên backtest")
        row["strategy_version_id"] = row.get("strategy_version_id") or vid
    elif not row.get("strategy_version_id"):
        row["strategy_version_id"] = options.get("strategy_version_id")
    for k in ("account_id", "backtest_session_id", "strategy_version_id"):
        if row.get(k) is not None:
            row[k] = str(row[k])
    return row


# ---------------- Xuất ----------------
def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, Decimal):
        return format(v.normalize(), "f")
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def _safe_cell(s: str) -> str:
    """Chống CSV/formula injection khi mở bằng Excel."""
    return "'" + s if s and s[0] in "=+-@\t\r" and not _is_number(s) else s


def _unsafe_cell(s: str) -> str:
    """Bỏ dấu nháy đơn do _safe_cell thêm vào khi xuất, để nhập lại giữ nguyên nội dung."""
    return s[1:] if len(s) > 1 and s[0] == "'" and s[1] in "=+-@\t\r" else s


def _is_number(s: str) -> bool:
    try:
        Decimal(s)
        return True
    except InvalidOperation:
        return False


def trades_csv(db: Session, user: User, trades: list[Trade]) -> str:
    accounts = {a.id: a.name for a in db.scalars(select(Account).where(Account.user_id == user.id))}
    sessions = {s.id: s.name for s in db.scalars(select(BacktestSession).where(BacktestSession.user_id == user.id))}
    versions = {v.id: (sname, v.version_no) for v, sname in db.execute(
        select(StrategyVersion, Strategy.name).join(Strategy).where(StrategyVersion.user_id == user.id))}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(TRADE_COLUMNS)
    for t in trades:
        sv = versions.get(t.strategy_version_id)
        vals = {
            "account": accounts.get(t.account_id, ""), "backtest_session": sessions.get(t.backtest_session_id, ""),
            "strategy": sv[0] if sv else "", "strategy_version": str(sv[1]) if sv else "",
            "tags": ";".join(tag.name for tag in t.tags),
        }
        w.writerow([_safe_cell(vals[c]) if c in vals else _safe_cell(_fmt(getattr(t, c))) for c in TRADE_COLUMNS])
    return buf.getvalue()


def strategies_csv(db: Session, user: User) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["strategy", "strategy_description", "version_no", "label", "status", "confirmed_at",
                "entry_rules", "exit_rules", "risk_rules", "notes", "version_id", "parent_version_id"])
    for v, s in db.execute(select(StrategyVersion, Strategy).join(Strategy).where(StrategyVersion.user_id == user.id)
                           .order_by(Strategy.name, StrategyVersion.version_no)):
        w.writerow([_safe_cell(x) for x in (s.name, s.description, str(v.version_no), v.label, v.status,
                                            _fmt(v.confirmed_at), v.entry_rules, v.exit_rules, v.risk_rules,
                                            v.notes, str(v.id), _fmt(v.parent_version_id))])
    return buf.getvalue()


def sessions_csv(db: Session, user: User) -> str:
    cols = ["name", "market", "timeframe", "data_start", "data_end", "data_timezone", "entry_rules", "exit_rules",
            "risk_rules", "target_trades", "initial_capital", "equity_method", "risk_per_trade_pct",
            "summary_notes", "is_completed", "created_at", "id", "strategy_version_id"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for s in db.scalars(select(BacktestSession).where(BacktestSession.user_id == user.id).order_by(BacktestSession.created_at)):
        w.writerow([_safe_cell(_fmt(getattr(s, c))) for c in cols])
    return buf.getvalue()


def accounts_csv(db: Session, user: User) -> str:
    cols = ["name", "broker", "currency", "initial_balance", "is_archived", "id"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for a in db.scalars(select(Account).where(Account.user_id == user.id).order_by(Account.name)):
        w.writerow([_safe_cell(_fmt(getattr(a, c))) for c in cols])
    return buf.getvalue()


def stats_report(db: Session, user: User) -> dict:
    out = {}
    for tt in ("live", "backtest"):
        d = stats_to_dict(compute_stats(load_stat_trades(db, user, trade_type=tt)))
        out[tt] = d
    return out


def build_user_archive(db: Session, user: User, storage, include_images: bool = True) -> bytes:
    """ZIP chứa toàn bộ dữ liệu cá nhân + ảnh + manifest. Dùng chung cho API và CLI (xuất khi tài khoản đã ngưng)."""
    trades = list(db.scalars(select(Trade).where(Trade.user_id == user.id).order_by(Trade.entry_time)))
    codes = {t.id: t.code for t in trades}
    images = list(db.scalars(select(TradeImage).where(TradeImage.user_id == user.id, TradeImage.deleted_at.is_(None))
                             .order_by(TradeImage.created_at)))
    mem = io.BytesIO()
    manifest = {"format": "tradejournal-export", "version": 1, "exported_at": datetime.now().astimezone().isoformat(),
                "user": {"email": user.email, "display_name": user.display_name, "timezone": user.timezone},
                "counts": {"trades": len(trades), "images": len(images)}, "images": [], "missing_images": []}
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("trades.csv", "﻿" + trades_csv(db, user, trades))
        z.writestr("strategies.csv", "﻿" + strategies_csv(db, user))
        z.writestr("backtest_sessions.csv", "﻿" + sessions_csv(db, user))
        z.writestr("accounts.csv", "﻿" + accounts_csv(db, user))
        z.writestr("stats_report.json", json.dumps(stats_report(db, user), ensure_ascii=False, indent=2))
        for img in images:
            ext = img.storage_key.rsplit(".", 1)[-1]
            path = f"images/{img.id}.{ext}"
            entry = {"image_id": str(img.id), "file": path if include_images else None,
                     "trade_id": str(img.trade_id) if img.trade_id else None,
                     "trade_code": codes.get(img.trade_id), "backtest_session_id":
                     str(img.backtest_session_id) if img.backtest_session_id else None,
                     "kind": img.kind, "caption": img.caption, "sha256": img.sha256,
                     "content_type": img.content_type, "original_filename": img.original_filename}
            if include_images:
                try:
                    z.writestr(path, storage.get(img.storage_key))
                except Exception:  # noqa: BLE001
                    manifest["missing_images"].append(str(img.id))
                    entry["file"] = None
            manifest["images"].append(entry)
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return mem.getvalue()
