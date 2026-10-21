from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, owned
from ..models import Account, BacktestSession, Trade, User
from ..queries import TradeFilter, load_stat_trades, trade_filter
from ..stats import compute_stats, pnl_by_period, q, stats_to_dict

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def live_initial_capital(db: Session, user: User, f: TradeFilter) -> Decimal | None:
    """Vốn ban đầu cho Live = tổng số dư ban đầu của các tài khoản trong phạm vi lọc.
    Nếu có tài khoản thiếu số dư ban đầu → None (drawdown % hiển thị N/A thay vì số giả)."""
    if f.account_id:
        ids = [f.account_id]
    else:
        ids = list(db.scalars(select(Trade.account_id).where(Trade.user_id == user.id, Trade.trade_type == "live",
                                                             Trade.account_id.is_not(None)).distinct()))
    if not ids:
        return None
    balances = list(db.scalars(select(Account.initial_balance).where(Account.id.in_(ids), Account.user_id == user.id)))
    if not balances or any(b is None for b in balances):
        return None
    return sum(balances, Decimal(0))


@router.get("")
def dashboard(f: TradeFilter = Depends(trade_filter),
              period: str = Query("month", pattern="^(day|week|month)$"),
              equity_method: str | None = Query(None, pattern="^(cash|r_fixed|r_compound)$"),
              initial_capital: Decimal | None = Query(None, gt=0),
              risk_per_trade_pct: Decimal | None = Query(None, gt=0, le=100),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Toàn bộ chỉ số dashboard tính trong MỘT lần từ cùng tập giao dịch đã lọc → luôn đồng bộ.
    Live và Backtest không bao giờ cộng chung: trade_type mặc định là live."""
    f.trade_type = f.trade_type or "live"
    if f.account_id:
        owned(db, Account, f.account_id, user, "Tài khoản")
    trades = load_stat_trades(db, user, f)
    method = equity_method or "cash"
    cap = initial_capital
    risk = risk_per_trade_pct
    if f.trade_type == "live":
        method = "cash"
        cap = cap if cap is not None else live_initial_capital(db, user, f)
    elif f.backtest_session_id and equity_method is None:
        s = owned(db, BacktestSession, f.backtest_session_id, user, "Phiên backtest")
        method, cap, risk = s.equity_method, s.initial_capital, s.risk_per_trade_pct
    try:
        st = compute_stats(trades, initial_capital=cap, equity_method=method, risk_per_trade_pct=risk)
    except ValueError as e:
        raise HTTPException(422, str(e))
    periods = [{**p, "net_pnl": q(p["net_pnl"]), "total_r": q(p["total_r"], 4)}
               for p in pnl_by_period(trades, period, user.timezone)]
    return {"trade_type": f.trade_type, "timezone": user.timezone, "stats": stats_to_dict(st),
            "by_period": periods, "period": period,
            "conventions": {
                "date_basis": "Bộ lọc ngày của thống kê áp dụng theo thời điểm đóng lệnh, múi giờ người dùng.",
                "win_rate": "Win rate = Thắng / (Thắng + Thua + Hòa). Hòa tính vào mẫu số nhưng không là thắng.",
                "profit_factor": "Gross Profit / |Gross Loss| theo kết quả ròng; N/A khi không có lệnh thua.",
                "drawdown": "Drawdown theo vốn tích lũy từ các lệnh đã đóng; không gồm biến động lệnh đang mở.",
                "excluded": "Lệnh Open, Cancelled, nháp và lệnh thiếu cả kết quả tiền lẫn R không được tính.",
            }}
