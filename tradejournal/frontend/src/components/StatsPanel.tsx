"use client";
import { money, pct, r, signedMoney, tone } from "./format";
import type { Stats } from "./types";
import { Notice, Stat } from "./ui";

export default function StatsPanel({ s, rOnly = false }: { s: Stats; rOnly?: boolean }) {
  const ex = s.excluded;
  const excluded = ex.open + ex.cancelled + ex.draft + ex.incomplete;
  return (
    <>
      {s.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
      <div className="stats">
        <Stat label="Giao dịch đã đóng" value={s.total_closed}
          sub={`${s.wins} thắng · ${s.losses} thua · ${s.breakevens} hòa`} />
        <Stat label="Win rate" value={pct(s.win_rate)} sub="Hòa tính vào mẫu số, không tính là thắng"
          title="Win rate = Thắng / (Thắng + Thua + Hòa) × 100%" />
        {!rOnly && <Stat label="Net Profit" value={signedMoney(s.net_profit)} toneClass={tone(s.net_profit)}
          sub={`${s.money_sample} lệnh có kết quả tiền${s.currencies.length ? " · " + s.currencies.join(", ") : ""}`} />}
        {!rOnly && <Stat label="Gross Profit / Gross Loss" value={<><span className="pos">{money(s.gross_profit)}</span> / <span className="neg">{money(s.gross_loss)}</span></>} />}
        {!rOnly && <Stat label="Profit Factor" value={s.profit_factor === null ? "N/A" : s.profit_factor.toFixed(2)}
          sub={s.profit_factor === null ? (s.total_closed ? "Không có lệnh thua" : "Chưa có dữ liệu") : "Gross Profit / |Gross Loss|"} />}
        <Stat label="Expectancy (R)" value={r(s.expectancy_r)} toneClass={tone(s.expectancy_r)}
          sub={`Tổng R / ${s.r_sample} lệnh có R hợp lệ`} />
        <Stat label="Tổng R" value={r(s.total_r)} toneClass={tone(s.total_r)} />
        {!rOnly && <Stat label="Average Win / Loss" value={<><span className="pos">{money(s.average_win)}</span> / <span className="neg">{money(s.average_loss)}</span></>}
          sub={`Expectancy tiền: ${money(s.expectancy_money)}`} />}
        <Stat label="Max Drawdown" value={money(s.max_drawdown)}
          sub={`${pct(s.max_drawdown_pct)} · ${r(s.max_drawdown_r ? -s.max_drawdown_r : 0)}${s.max_drawdown_pct === null ? " (thiếu vốn ban đầu)" : ""}`}
          title="Tính từ đỉnh vốn trước đó xuống đáy tiếp theo, theo vốn tích lũy của lệnh đã đóng" />
        <Stat label="Chuỗi dài nhất" value={<><span className="pos">{s.max_win_streak}W</span> / <span className="neg">{s.max_loss_streak}L</span></>}
          sub="Lệnh hòa cắt chuỗi" />
      </div>
      {excluded > 0 && (
        <p className="muted small">
          Không tính: {ex.open} đang mở, {ex.cancelled} đã hủy, {ex.draft} nháp, {ex.incomplete} thiếu kết quả.
        </p>
      )}
    </>
  );
}
