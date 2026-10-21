"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { EquityChart, PeriodChart } from "@/components/Charts";
import FilterBar, { Filters } from "@/components/FilterBar";
import StatsPanel from "@/components/StatsPanel";
import type { Dashboard, TradeType } from "@/components/types";
import { Empty, ErrorBox, Loading } from "@/components/ui";

export default function DashboardPage() {
  const { user } = useUser();
  const [type, setType] = useState<TradeType>("live");
  const [filters, setFilters] = useState<Filters>({});
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Dashboard>(`/dashboard${qs({ ...filters, trade_type: type, period })}`));
      setError(null);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [filters, type, period]);
  useEffect(() => { load(); }, [load]);

  const s = data?.stats;
  const rOnly = type === "backtest" && !!s && s.money_sample === 0;
  return (
    <div>
      <header className="page-head">
        <h1>Dashboard</h1>
        <div className="seg big" role="tablist" aria-label="Loại dữ liệu">
          <button role="tab" aria-selected={type === "live"} className={type === "live" ? "on" : ""} onClick={() => { setType("live"); setFilters({}); }}>Live Trading</button>
          <button role="tab" aria-selected={type === "backtest"} className={type === "backtest" ? "on" : ""} onClick={() => { setType("backtest"); setFilters({}); }}>Backtest</button>
        </div>
      </header>
      <p className="muted small">
        {type === "live" ? "Chỉ gồm giao dịch thực tế — dữ liệu backtest không bao giờ được cộng vào." : "Chỉ gồm giao dịch backtest — tách biệt hoàn toàn với Live."}
        {" "}Lọc ngày theo thời điểm đóng lệnh, múi giờ {user?.timezone}.
      </p>
      <FilterBar value={filters} onChange={setFilters} tradeType={type} extended />
      <ErrorBox error={error} onRetry={load} />
      {loading && !data ? <Loading /> : s && (
        s.total_closed === 0 && s.excluded.open === 0 ? (
          <Empty title="Chưa có giao dịch nào khớp bộ lọc">
            {type === "live" ? <Link href="/trades/new">+ Ghi giao dịch Live đầu tiên</Link> : <Link href="/backtest">Tạo phiên backtest</Link>}
          </Empty>
        ) : (
          <div className={loading ? "dim" : ""}>
            <StatsPanel s={s} rOnly={rOnly} />
            <section className="panel">
              <div className="panel-head"><h2>Equity Curve</h2>
                <span className="muted small">{s.initial_capital !== null ? `Vốn ban đầu ${s.initial_capital.toLocaleString("vi-VN")}` : "Chưa có vốn ban đầu — hiển thị lãi/lỗ tích lũy từ 0"}</span>
              </div>
              <EquityChart points={s.equity_curve} tz={data!.timezone} />
            </section>
            <section className="panel">
              <div className="panel-head"><h2>{rOnly ? "Tổng R theo thời gian" : "Lợi nhuận ròng theo thời gian"}</h2>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Chu kỳ">
                  <option value="day">Ngày</option><option value="week">Tuần</option><option value="month">Tháng</option>
                </select>
              </div>
              <PeriodChart rows={data!.by_period} metric={rOnly ? "total_r" : "net_pnl"} />
            </section>
            <details className="panel">
              <summary>Quy ước tính toán</summary>
              <ul className="small">{Object.values(data!.conventions).map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          </div>
        )
      )}
    </div>
  );
}
