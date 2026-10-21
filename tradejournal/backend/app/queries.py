"""Bộ lọc giao dịch dùng chung cho danh sách, dashboard, so sánh và xuất dữ liệu."""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Query
from sqlalchemy import Select, and_, select
from sqlalchemy.orm import Session

from .models import Account, StrategyVersion, Tag, Trade, TradeTag, User
from .stats import StatTrade


@dataclass
class TradeFilter:
    trade_type: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    account_id: uuid.UUID | None = None
    market: str | None = None
    strategy_id: uuid.UUID | None = None
    strategy_version_id: uuid.UUID | None = None
    backtest_session_id: uuid.UUID | None = None
    timeframe: str | None = None
    direction: str | None = None
    status: str | None = None
    setup: str | None = None
    trading_session: str | None = None
    market_condition: str | None = None
    plan_compliance: str | None = None
    outcome: str | None = None
    r_min: Decimal | None = None
    r_max: Decimal | None = None
    q: str | None = None
    tag: str | None = None


def trade_filter(
    trade_type: str | None = Query(None, pattern="^(live|backtest)$"),
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: uuid.UUID | None = None,
    market: str | None = None,
    strategy_id: uuid.UUID | None = None,
    strategy_version_id: uuid.UUID | None = None,
    backtest_session_id: uuid.UUID | None = None,
    timeframe: str | None = None,
    direction: str | None = Query(None, pattern="^(buy|sell)$"),
    status: str | None = Query(None, pattern="^(open|closed|cancelled)$"),
    setup: str | None = None,
    trading_session: str | None = None,
    market_condition: str | None = None,
    plan_compliance: str | None = Query(None, pattern="^(followed|partial|violated)$"),
    outcome: str | None = Query(None, pattern="^(win|loss|breakeven)$"),
    r_min: Decimal | None = None,
    r_max: Decimal | None = None,
    q: str | None = Query(None, max_length=64),
    tag: str | None = None,
) -> TradeFilter:
    if date_from and date_to and date_to < date_from:
        raise HTTPException(422, "Khoảng ngày không hợp lệ")
    return TradeFilter(**{k: v for k, v in locals().items()})


def _day_bounds(d: date, tz: str, end: bool) -> datetime:
    zone = ZoneInfo(tz)
    local = datetime.combine(d + timedelta(days=1) if end else d, time.min, tzinfo=zone)
    return local


def apply_filter(stmt: Select, f: TradeFilter, user: User, date_column=Trade.entry_time) -> Select:
    """Luôn ràng buộc user_id trước tiên (cách ly dữ liệu). Ngày lọc hiểu theo múi giờ người dùng."""
    conds = [Trade.user_id == user.id]
    if f.trade_type:
        conds.append(Trade.trade_type == f.trade_type)
    if f.date_from:
        conds.append(date_column >= _day_bounds(f.date_from, user.timezone, False))
    if f.date_to:
        conds.append(date_column < _day_bounds(f.date_to, user.timezone, True))
    for col, val in (
        (Trade.account_id, f.account_id),
        (Trade.strategy_version_id, f.strategy_version_id),
        (Trade.backtest_session_id, f.backtest_session_id),
        (Trade.timeframe, f.timeframe),
        (Trade.direction, f.direction),
        (Trade.status, f.status),
        (Trade.setup, f.setup),
        (Trade.trading_session, f.trading_session),
        (Trade.market_condition, f.market_condition),
        (Trade.plan_compliance, f.plan_compliance),
        (Trade.outcome, f.outcome),
    ):
        if val:
            conds.append(col == val)
    if f.market:
        conds.append(Trade.market == f.market.upper())
    if f.strategy_id:
        conds.append(Trade.strategy_version_id.in_(
            select(StrategyVersion.id).where(StrategyVersion.strategy_id == f.strategy_id,
                                             StrategyVersion.user_id == user.id)))
    if f.r_min is not None:
        conds.append(Trade.r_multiple >= f.r_min)
    if f.r_max is not None:
        conds.append(Trade.r_multiple <= f.r_max)
    if f.q:
        esc = f.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conds.append(Trade.code.ilike(f"%{esc}%", escape="\\"))
    if f.tag:
        conds.append(Trade.id.in_(select(TradeTag.trade_id).join(Tag, Tag.id == TradeTag.tag_id)
                                  .where(Tag.user_id == user.id, Tag.name == f.tag)))
    return stmt.where(and_(*conds))


def load_stat_trades(db: Session, user: User, f: TradeFilter | None = None, *, trade_type: str | None = None,
                     strategy_version_ids: list[uuid.UUID] | None = None) -> list[StatTrade]:
    """Chỉ lấy các cột cần cho thống kê (không tải toàn bộ bản ghi). Ngày lọc áp vào thời điểm đóng lệnh."""
    f = f or TradeFilter()
    if trade_type:
        f.trade_type = trade_type
    stmt = (select(Trade.id, Trade.status, Trade.entry_time, Trade.exit_time, Trade.net_pnl, Trade.r_multiple,
                   Trade.is_draft, Trade.trade_type, Account.currency)
            .outerjoin(Account, Account.id == Trade.account_id))
    stmt = apply_filter(stmt, f, user, date_column=Trade.exit_time)
    if strategy_version_ids is not None:
        stmt = stmt.where(Trade.strategy_version_id.in_(strategy_version_ids))
    rows = db.execute(stmt).all()
    return [StatTrade(id=r.id, status=r.status, entry_time=r.entry_time, exit_time=r.exit_time, net_pnl=r.net_pnl,
                      r_multiple=r.r_multiple, is_draft=r.is_draft,
                      currency=r.currency if r.trade_type == "live" else None) for r in rows]
