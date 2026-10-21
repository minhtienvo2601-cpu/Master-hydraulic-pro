"""Tính các trường dẫn xuất của một giao dịch. Backend luôn tính lại khi tạo/sửa/nhập CSV;
giá trị client gửi lên cho net_pnl / r_multiple / outcome bị bỏ qua."""
from decimal import Decimal

from .stats import classify

ZERO = Decimal(0)


def net_pnl(gross: Decimal | None, commission: Decimal, swap: Decimal, other_fees: Decimal) -> Decimal | None:
    """Kết quả ròng = Kết quả trước chi phí − commission − phí khác + swap.

    commission và other_fees là chi phí (số không âm). swap có dấu: dương = được cộng, âm = bị trừ.
    Không tự suy diễn chi phí: trường trống được coi là 0 (đã ghi nhận là không có chi phí).
    """
    if gross is None:
        return None
    return gross - (commission or ZERO) - (other_fees or ZERO) + (swap or ZERO)


def price_r(direction: str, entry: Decimal, stop: Decimal | None, exit_: Decimal | None) -> Decimal | None:
    """R theo giá (không gồm chi phí): (exit − entry) / |entry − SL| theo hướng lệnh. Chỉ dùng cho Backtest."""
    if stop is None or exit_ is None:
        return None
    risk = abs(entry - stop)
    if risk == 0:
        return None
    move = (exit_ - entry) if direction == "buy" else (entry - exit_)
    return move / risk


def derive(t) -> None:
    """Gán net_pnl, r_multiple, r_source, outcome cho đối tượng Trade (hoặc tương đương)."""
    t.net_pnl = net_pnl(t.gross_pnl, t.commission, t.swap, t.other_fees)
    r = None
    src = "none"
    if t.status == "closed" and not t.is_draft:
        if t.risk_amount is not None and t.risk_amount > 0 and t.net_pnl is not None:
            r, src = t.net_pnl / t.risk_amount, "computed"
        elif t.r_manual is not None:
            r, src = t.r_manual, "manual"
        elif t.trade_type == "backtest":
            pr = price_r(t.direction, t.entry_price, t.stop_loss, t.exit_price)
            if pr is not None:
                r, src = pr, "price"
    t.r_multiple = r.quantize(Decimal("0.0001")) if r is not None else None
    t.r_source = src
    t.outcome = classify(t.net_pnl, t.r_multiple) if (t.status == "closed" and not t.is_draft) else None
