"""Bộ quy tắc tính toán thống kê DUY NHẤT của hệ thống.

Mọi màn hình (Dashboard, Backtest, So sánh phiên bản, Báo cáo xuất) đều gọi `compute_stats`
để bảo đảm các chỉ số dùng chung một định nghĩa. Module này thuần túy (không truy cập DB)
để có thể kiểm thử bằng bộ dữ liệu chuẩn trong tests/fixtures.

Quy ước (cũng được hiển thị trên giao diện):
- Chỉ giao dịch status='closed', is_draft=False được tính. Open/Cancelled/nháp bị loại.
- Giao dịch đóng nhưng không có cả kết quả tiền lẫn R thì không phân loại được thắng/thua:
  loại khỏi mẫu số Win rate và được đếm ở `excluded_incomplete`.
- Thắng/thua/hòa xác định theo dấu của kết quả ròng (net_pnl); nếu không có net_pnl thì theo R.
  Hòa = đúng bằng 0.
- Win rate = thắng / (thắng + thua + hòa) × 100. Hòa nằm trong mẫu số, không tính là thắng.
- Gross Profit = tổng net_pnl dương; Gross Loss = tổng net_pnl âm (giá trị âm).
- Profit Factor = Gross Profit / |Gross Loss|; không có lệnh thua (Gross Loss = 0) → None (N/A).
- Expectancy (R) = Tổng R / số giao dịch có R hợp lệ. Expectancy (tiền) = Net Profit / số giao dịch có net_pnl.
- Chuỗi thắng/thua: theo thứ tự thời gian đóng lệnh; giao dịch hòa cắt đứt cả hai chuỗi.
- Equity Curve: số dư tích lũy theo các lệnh đã đóng (balance), sắp theo exit_time, rồi entry_time, rồi id.
  Không bao gồm biến động thả nổi của lệnh đang mở (không có dữ liệu tick) — drawdown là
  "drawdown theo vốn tích lũy".
- Max Drawdown (tiền) = max(đỉnh trước đó − giá trị hiện tại). Max Drawdown (%) = max((đỉnh − hiện tại)/đỉnh),
  tính độc lập (hai giá trị lớn nhất có thể xảy ra ở hai thời điểm khác nhau). Đỉnh ban đầu là vốn ban đầu.
  Nếu không có vốn ban đầu (>0) thì drawdown % = None.
"""
from __future__ import annotations

import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

ZERO = Decimal(0)
EQUITY_METHODS = ("cash", "r_fixed", "r_compound")


@dataclass
class StatTrade:
    id: uuid.UUID | str
    status: str
    entry_time: datetime
    exit_time: datetime | None
    net_pnl: Decimal | None
    r_multiple: Decimal | None
    is_draft: bool = False
    currency: str | None = None


@dataclass
class EquityPoint:
    time: datetime | None
    trade_id: str | None
    equity: Decimal
    drawdown: Decimal
    drawdown_pct: Decimal | None


@dataclass
class Stats:
    total_closed: int = 0
    wins: int = 0
    losses: int = 0
    breakevens: int = 0
    excluded_open: int = 0
    excluded_cancelled: int = 0
    excluded_draft: int = 0
    excluded_incomplete: int = 0
    win_rate: Decimal | None = None
    money_sample: int = 0
    net_profit: Decimal = ZERO
    gross_profit: Decimal = ZERO
    gross_loss: Decimal = ZERO
    profit_factor: Decimal | None = None
    average_win: Decimal | None = None
    average_loss: Decimal | None = None
    expectancy_money: Decimal | None = None
    r_sample: int = 0
    total_r: Decimal = ZERO
    expectancy_r: Decimal | None = None
    max_win_streak: int = 0
    max_loss_streak: int = 0
    equity_method: str = "cash"
    equity_unit: str = "money"  # money | R
    initial_capital: Decimal | None = None
    max_drawdown: Decimal = ZERO
    max_drawdown_pct: Decimal | None = None
    max_drawdown_r: Decimal = ZERO
    equity_curve: list[EquityPoint] = field(default_factory=list)
    currencies: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _sign(v: Decimal) -> int:
    return (v > 0) - (v < 0)


def classify(net_pnl: Decimal | None, r_multiple: Decimal | None) -> str | None:
    basis = net_pnl if net_pnl is not None else r_multiple
    if basis is None:
        return None
    s = _sign(basis)
    return "win" if s > 0 else "loss" if s < 0 else "breakeven"


def _order_key(t: StatTrade):
    far = datetime.max.replace(tzinfo=timezone.utc)
    return (t.exit_time or far, t.entry_time, str(t.id))


def _drawdown_series(values: list[Decimal], start: Decimal, pct: bool):
    """Trả về (danh sách (dd, dd_pct), max_dd, max_dd_pct). Đỉnh khởi đầu = start."""
    pct = pct and start > 0  # không có vốn ban đầu → % drawdown không xác định
    peak = start
    out = []
    max_dd = ZERO
    max_pct: Decimal | None = ZERO if pct else None
    for v in values:
        if v > peak:
            peak = v
        dd = peak - v
        dd_pct = None
        if pct and peak > 0:
            dd_pct = dd / peak * 100
            if max_pct is None or dd_pct > max_pct:
                max_pct = dd_pct
        if dd > max_dd:
            max_dd = dd
        out.append((dd, dd_pct))
    return out, max_dd, max_pct


def compute_stats(
    trades: list[StatTrade],
    *,
    initial_capital: Decimal | None = None,
    equity_method: str = "cash",
    risk_per_trade_pct: Decimal | None = None,
) -> Stats:
    if equity_method not in EQUITY_METHODS:
        raise ValueError(f"equity_method không hợp lệ: {equity_method}")
    st = Stats(equity_method=equity_method, initial_capital=initial_capital)

    valid: list[StatTrade] = []
    for t in trades:
        if t.is_draft:
            st.excluded_draft += 1
        elif t.status == "open":
            st.excluded_open += 1
        elif t.status == "cancelled":
            st.excluded_cancelled += 1
        elif t.status == "closed":
            if classify(t.net_pnl, t.r_multiple) is None:
                st.excluded_incomplete += 1
            else:
                valid.append(t)
    valid.sort(key=_order_key)

    st.currencies = sorted({t.currency for t in valid if t.currency})
    if len(st.currencies) > 1:
        st.warnings.append(
            "Bộ lọc gồm nhiều đơn vị tiền tệ (" + ", ".join(st.currencies) + "); các chỉ số tiền đang cộng gộp. "
            "Hãy lọc theo một tài khoản/đơn vị để có số liệu tiền chính xác. Chỉ số R không bị ảnh hưởng."
        )
    if st.excluded_incomplete:
        st.warnings.append(
            f"{st.excluded_incomplete} giao dịch đã đóng thiếu cả kết quả tiền và R nên không được tính."
        )

    st.total_closed = len(valid)
    win_cur = loss_cur = 0
    wins_sum = ZERO
    losses_sum = ZERO
    money_wins = money_losses = 0
    for t in valid:
        o = classify(t.net_pnl, t.r_multiple)
        if o == "win":
            st.wins += 1
            win_cur += 1
            loss_cur = 0
        elif o == "loss":
            st.losses += 1
            loss_cur += 1
            win_cur = 0
        else:
            st.breakevens += 1
            win_cur = loss_cur = 0
        st.max_win_streak = max(st.max_win_streak, win_cur)
        st.max_loss_streak = max(st.max_loss_streak, loss_cur)

        if t.net_pnl is not None:
            st.money_sample += 1
            st.net_profit += t.net_pnl
            if t.net_pnl > 0:
                st.gross_profit += t.net_pnl
                wins_sum += t.net_pnl
                money_wins += 1
            elif t.net_pnl < 0:
                st.gross_loss += t.net_pnl
                losses_sum += t.net_pnl
                money_losses += 1
        if t.r_multiple is not None:
            st.r_sample += 1
            st.total_r += t.r_multiple

    if st.total_closed:
        st.win_rate = Decimal(st.wins) / Decimal(st.total_closed) * 100
    if st.gross_loss != 0:
        st.profit_factor = st.gross_profit / abs(st.gross_loss)
    if money_wins:
        st.average_win = wins_sum / money_wins
    if money_losses:
        st.average_loss = losses_sum / money_losses
    if st.money_sample:
        st.expectancy_money = st.net_profit / st.money_sample
    if st.r_sample:
        st.expectancy_r = st.total_r / st.r_sample

    # ---- Equity curve ----
    # Drawdown theo R luôn tính (bắt đầu từ 0R) để so sánh chiến lược không phụ thuộc vốn.
    r_vals: list[Decimal] = []
    acc = ZERO
    for t in valid:
        if t.r_multiple is not None:
            acc += t.r_multiple
            r_vals.append(acc)
    _, st.max_drawdown_r, _ = _drawdown_series(r_vals, ZERO, pct=False)

    if equity_method == "cash":
        start = initial_capital if initial_capital is not None else ZERO
        series = [t for t in valid if t.net_pnl is not None]
        values: list[Decimal] = []
        eq = start
        for t in series:
            eq += t.net_pnl  # type: ignore[operator]
            values.append(eq)
        st.equity_unit = "money"
    else:
        if initial_capital is None or initial_capital <= 0 or not risk_per_trade_pct or risk_per_trade_pct <= 0:
            raise ValueError("Phương pháp equity theo R cần vốn ban đầu > 0 và % rủi ro mỗi lệnh > 0")
        start = initial_capital
        frac = risk_per_trade_pct / 100
        series = [t for t in valid if t.r_multiple is not None]
        values = []
        eq = start
        for t in series:
            if equity_method == "r_fixed":
                eq += t.r_multiple * start * frac  # type: ignore[operator]
            else:
                eq = eq * (1 + t.r_multiple * frac)  # type: ignore[operator]
            values.append(eq)
        st.equity_unit = "money"

    dds, st.max_drawdown, st.max_drawdown_pct = _drawdown_series(values, start, pct=True)
    st.equity_curve.append(EquityPoint(None, None, start, ZERO, ZERO if start > 0 else None))
    for t, v, (dd, ddp) in zip(series, values, dds):
        st.equity_curve.append(EquityPoint(t.exit_time, str(t.id), v, dd, ddp))
    return st


def pnl_by_period(trades: list[StatTrade], period: str, tz: str) -> list[dict]:
    """Lợi nhuận ròng và tổng R theo ngày/tuần/tháng (theo múi giờ người dùng, theo thời điểm đóng lệnh)."""
    zone = ZoneInfo(tz)
    buckets: OrderedDict[date, dict] = OrderedDict()
    rows = [t for t in trades if t.status == "closed" and not t.is_draft and t.exit_time is not None
            and classify(t.net_pnl, t.r_multiple) is not None]
    rows.sort(key=_order_key)
    for t in rows:
        d = t.exit_time.astimezone(zone).date()  # type: ignore[union-attr]
        if period == "week":
            d = d - timedelta(days=d.weekday())
        elif period == "month":
            d = d.replace(day=1)
        b = buckets.setdefault(d, {"period": d.isoformat(), "net_pnl": ZERO, "total_r": ZERO, "trades": 0})
        b["trades"] += 1
        if t.net_pnl is not None:
            b["net_pnl"] += t.net_pnl
        if t.r_multiple is not None:
            b["total_r"] += t.r_multiple
    return list(buckets.values())


def q(v: Decimal | None, places: int = 2) -> float | None:
    if v is None:
        return None
    return float(v.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def stats_to_dict(st: Stats) -> dict:
    return {
        "total_closed": st.total_closed,
        "wins": st.wins,
        "losses": st.losses,
        "breakevens": st.breakevens,
        "excluded": {
            "open": st.excluded_open,
            "cancelled": st.excluded_cancelled,
            "draft": st.excluded_draft,
            "incomplete": st.excluded_incomplete,
        },
        "win_rate": q(st.win_rate),
        "money_sample": st.money_sample,
        "net_profit": q(st.net_profit),
        "gross_profit": q(st.gross_profit),
        "gross_loss": q(st.gross_loss),
        "profit_factor": q(st.profit_factor),
        "average_win": q(st.average_win),
        "average_loss": q(st.average_loss),
        "expectancy_money": q(st.expectancy_money),
        "r_sample": st.r_sample,
        "total_r": q(st.total_r, 4),
        "expectancy_r": q(st.expectancy_r, 4),
        "max_win_streak": st.max_win_streak,
        "max_loss_streak": st.max_loss_streak,
        "equity_method": st.equity_method,
        "initial_capital": q(st.initial_capital),
        "max_drawdown": q(st.max_drawdown),
        "max_drawdown_pct": q(st.max_drawdown_pct),
        "max_drawdown_r": q(st.max_drawdown_r, 4),
        "currencies": st.currencies,
        "warnings": st.warnings,
        "equity_curve": [
            {
                "time": p.time.isoformat() if p.time else None,
                "trade_id": p.trade_id,
                "equity": q(p.equity),
                "drawdown": q(p.drawdown),
                "drawdown_pct": q(p.drawdown_pct),
            }
            for p in st.equity_curve
        ],
    }
