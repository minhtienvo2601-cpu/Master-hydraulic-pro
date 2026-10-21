"""Kiểm thử công thức thống kê với bộ dữ liệu chuẩn (kết quả kỳ vọng đã xác nhận trước)."""
import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.stats import StatTrade, classify, compute_stats, pnl_by_period, stats_to_dict
from app.trade_calc import derive, net_pnl, price_r

GOLDEN = json.loads((Path(__file__).parent / "fixtures" / "golden_live.json").read_text())
D = lambda v: Decimal(v) if v is not None else None  # noqa: E731


def golden_stat_trades() -> list[StatTrade]:
    out = []
    for g in GOLDEN["trades"]:
        t = SimpleNamespace(trade_type="live", status=g["status"], is_draft=False, direction=g["direction"],
                            entry_price=D(g["entry_price"]), stop_loss=D(g.get("stop_loss")),
                            exit_price=D(g.get("exit_price")), gross_pnl=D(g["gross_pnl"]),
                            commission=D(g["commission"]), swap=D(g["swap"]), other_fees=D(g["other_fees"]),
                            risk_amount=D(g["risk_amount"]), r_manual=None)
        derive(t)
        out.append(StatTrade(id=g["code"], status=g["status"],
                             entry_time=datetime.fromisoformat(g["entry_time"]),
                             exit_time=datetime.fromisoformat(g["exit_time"]) if g["exit_time"] else None,
                             net_pnl=t.net_pnl, r_multiple=t.r_multiple, currency="USD"))
    return out


def test_golden_per_trade_derivations():
    exp = GOLDEN["expected"]
    by = {t.id: t for t in golden_stat_trades()}
    for code, net in exp["net_by_code"].items():
        assert by[code].net_pnl == Decimal(str(net)), code
    for code, r in exp["r_by_code"].items():
        assert (by[code].r_multiple is None) if r is None else by[code].r_multiple == Decimal(str(r)), code


def test_golden_summary():
    exp = GOLDEN["expected"]
    st = compute_stats(golden_stat_trades(), initial_capital=Decimal(GOLDEN["initial_capital"]))
    d = stats_to_dict(st)
    for k in ("total_closed", "wins", "losses", "breakevens", "excluded", "win_rate", "money_sample", "net_profit",
              "gross_profit", "gross_loss", "profit_factor", "average_win", "average_loss", "expectancy_money",
              "r_sample", "total_r", "expectancy_r", "max_win_streak", "max_loss_streak", "initial_capital",
              "max_drawdown", "max_drawdown_pct", "max_drawdown_r"):
        assert d[k] == exp[k], k
    assert [p["trade_id"] for p in d["equity_curve"][1:]] == exp["equity_order"]
    assert d["equity_curve"][-1]["equity"] == exp["final_equity"]
    assert d["equity_curve"][0]["equity"] == exp["initial_capital"]


def test_breakeven_in_denominator_not_win():
    t = [StatTrade(1, "closed", datetime(2024, 1, 1, tzinfo=timezone.utc), datetime(2024, 1, 1, 1, tzinfo=timezone.utc), Decimal(10), None),
         StatTrade(2, "closed", datetime(2024, 1, 2, tzinfo=timezone.utc), datetime(2024, 1, 2, 1, tzinfo=timezone.utc), Decimal(0), None)]
    st = compute_stats(t)
    assert st.wins == 1 and st.breakevens == 1 and st.win_rate == Decimal(50)


def test_no_losing_trades_profit_factor_na():
    t = [StatTrade(i, "closed", datetime(2024, 1, i, tzinfo=timezone.utc), datetime(2024, 1, i, 1, tzinfo=timezone.utc), Decimal(50), Decimal(1))
         for i in (1, 2)]
    d = stats_to_dict(compute_stats(t))
    assert d["profit_factor"] is None
    assert d["average_loss"] is None
    assert d["gross_loss"] == 0
    assert d["win_rate"] == 100


def test_empty_dataset():
    d = stats_to_dict(compute_stats([]))
    assert d["total_closed"] == 0 and d["win_rate"] is None and d["expectancy_r"] is None
    assert d["profit_factor"] is None and d["max_drawdown"] == 0


def test_incomplete_and_draft_excluded():
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    t = [StatTrade("a", "closed", base, base, None, None),
         StatTrade("b", "closed", base, base, Decimal(10), None, is_draft=True),
         StatTrade("c", "closed", base, base, Decimal(-10), None)]
    st = compute_stats(t)
    assert st.total_closed == 1 and st.excluded_incomplete == 1 and st.excluded_draft == 1
    assert st.warnings  # cảnh báo dữ liệu thiếu


def test_no_initial_capital_gives_no_pct_drawdown():
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    t = [StatTrade("a", "closed", base, base, Decimal(100), None),
         StatTrade("b", "closed", base, base.replace(hour=1), Decimal(-40), None)]
    st = compute_stats(t)
    assert st.max_drawdown == Decimal(40) and st.max_drawdown_pct is None


def test_mixed_currency_warning():
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    t = [StatTrade("a", "closed", base, base, Decimal(1), None, currency="USD"),
         StatTrade("b", "closed", base, base, Decimal(1), None, currency="EUR")]
    assert any("đơn vị tiền tệ" in w for w in compute_stats(t).warnings)


def _r_series():
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return [StatTrade(i, "closed", base, base.replace(day=i + 1), None, Decimal(r)) for i, r in enumerate(["2", "-1", "-1", "3"])]


def test_backtest_equity_r_fixed():
    st = compute_stats(_r_series(), initial_capital=Decimal(10000), equity_method="r_fixed", risk_per_trade_pct=Decimal(1))
    assert [p.equity for p in st.equity_curve] == [10000, 10200, 10100, 10000, 10300]
    assert st.max_drawdown == 200
    assert stats_to_dict(st)["max_drawdown_pct"] == 1.96
    assert st.max_drawdown_r == 2


def test_backtest_equity_r_compound():
    st = compute_stats(_r_series(), initial_capital=Decimal(10000), equity_method="r_compound", risk_per_trade_pct=Decimal(1))
    assert st.equity_curve[-1].equity == Decimal("10296.930600")
    assert st.max_drawdown == Decimal("202.980000")
    assert stats_to_dict(st)["max_drawdown_pct"] == 1.99


def test_r_method_requires_capital():
    with pytest.raises(ValueError):
        compute_stats(_r_series(), equity_method="r_fixed")


def test_net_pnl_and_costs():
    assert net_pnl(Decimal(100), Decimal(7), Decimal(-3), Decimal(2)) == Decimal(88)
    assert net_pnl(None, Decimal(7), Decimal(0), Decimal(0)) is None


def test_price_r_buy_sell():
    assert price_r("buy", Decimal(2000), Decimal(1990), Decimal(2030)) == 3
    assert price_r("sell", Decimal(2000), Decimal(2010), Decimal(2015)) == Decimal("-1.5")
    assert price_r("buy", Decimal(2000), None, Decimal(2030)) is None


def _bt(**kw):
    base = dict(trade_type="backtest", status="closed", is_draft=False, direction="buy", entry_price=Decimal(2000),
                stop_loss=Decimal(1990), exit_price=Decimal(2030), gross_pnl=None, commission=Decimal(0),
                swap=Decimal(0), other_fees=Decimal(0), risk_amount=None, r_manual=None)
    base.update(kw)
    t = SimpleNamespace(**base)
    derive(t)
    return t


def test_r_priority_rules():
    assert (_bt().r_multiple, _bt().r_source) == (Decimal(3), "price")
    t = _bt(r_manual=Decimal("2.5"))
    assert (t.r_multiple, t.r_source) == (Decimal("2.5"), "manual")
    t = _bt(r_manual=Decimal("2.5"), gross_pnl=Decimal(150), risk_amount=Decimal(100), commission=Decimal(10))
    assert (t.r_multiple, t.r_source, t.outcome) == (Decimal("1.4"), "computed", "win")
    # Live: không suy R từ giá khi thiếu rủi ro tiền
    t = _bt(trade_type="live", gross_pnl=Decimal(150))
    assert t.r_multiple is None and t.r_source == "none"
    # Lệnh mở: không có R / outcome
    t = _bt(status="open", exit_price=None)
    assert t.r_multiple is None and t.outcome is None


def test_classify():
    assert classify(Decimal(0), None) == "breakeven"
    assert classify(None, Decimal("-0.1")) == "loss"
    assert classify(None, None) is None
    # tiền ưu tiên hơn R khi có cả hai
    assert classify(Decimal(-1), Decimal(1)) == "loss"


def test_pnl_by_period_uses_user_timezone():
    # 2024-01-31 20:00Z = 2024-02-01 03:00 giờ Việt Nam
    t = [StatTrade("a", "closed", datetime(2024, 1, 31, tzinfo=timezone.utc), datetime(2024, 1, 31, 20, tzinfo=timezone.utc), Decimal(10), Decimal(1))]
    assert pnl_by_period(t, "month", "Asia/Ho_Chi_Minh")[0]["period"] == "2024-02-01"
    assert pnl_by_period(t, "month", "UTC")[0]["period"] == "2024-01-01"
