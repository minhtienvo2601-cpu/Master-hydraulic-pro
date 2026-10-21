"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/components/api";
import { EquityChart } from "@/components/Charts";
import FilterBar, { Filters } from "@/components/FilterBar";
import { d, LABEL } from "@/components/format";
import ImageGallery from "@/components/ImageGallery";
import SessionForm from "@/components/SessionForm";
import StatsPanel from "@/components/StatsPanel";
import TradeForm from "@/components/TradeForm";
import TradeTable from "@/components/TradeTable";
import type { BtSession, Stats, Trade, TradePage } from "@/components/types";
import { Badge, Empty, ErrorBox, Loading, Notice, Pager } from "@/components/ui";

type Tab = "record" | "trades" | "stats" | "rules" | "images";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<BtSession | null>(null);
  const [tab, setTab] = useState<Tab>("record");
  const [filters, setFilters] = useState<Filters>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ sort: string; order: "asc" | "desc" }>({ sort: "entry_time", order: "desc" });
  const [trades, setTrades] = useState<TradePage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastSaved, setLastSaved] = useState<Trade | null>(null);
  const [formKey, setFormKey] = useState(0);

  const loadSession = useCallback(() => api<BtSession>(`/backtest-sessions/${id}`).then(setS).catch(setError), [id]);
  const loadData = useCallback(async () => {
    try {
      const f = { ...filters, backtest_session_id: id, trade_type: "backtest" };
      const [st, tp] = await Promise.all([
        api<Stats>(`/backtest-sessions/${id}/stats${qs(filters)}`),
        api<TradePage>(`/trades${qs({ ...f, page, page_size: 25, ...sort })}`),
      ]);
      setStats(st); setTrades(tp);
    } catch (e) { setError(e); }
  }, [id, filters, page, sort]);
  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { loadData(); }, [loadData]);

  if (error && !s) return <ErrorBox error={error} />;
  if (!s) return <Loading />;
  const p = s.progress!;

  async function del(t: Trade) {
    if (!confirm(`Xóa giao dịch ${t.code}?`)) return;
    try { await api(`/trades/${t.id}`, { method: "DELETE" }); await Promise.all([loadData(), loadSession()]); } catch (e) { setError(e); }
  }
  async function deleteSession() {
    if (!confirm("Xóa phiên backtest này? Chỉ xóa được khi phiên không còn giao dịch/ảnh.")) return;
    try { await api(`/backtest-sessions/${s!.id}`, { method: "DELETE" }); router.push("/backtest"); } catch (e) { setError(e); }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="muted small">{s.strategy_label} · {s.market} {s.timeframe} · dữ liệu {d(s.data_start)} – {d(s.data_end)} ({s.data_timezone})</div>
          <h1>{s.name} {s.is_completed && <Badge kind="ok">Hoàn thành</Badge>}</h1>
        </div>
      </header>
      <div className="progress-box">
        <div className="progress big"><div style={{ width: `${p.completion_pct}%` }} /></div>
        <div className="progress-meta">
          <span><b>{p.recorded}</b>/{p.target} giao dịch · <b>{p.completion_pct}%</b></span>
          <span>Chưa hoàn tất: <b className={p.incomplete ? "warn-text" : ""}>{p.incomplete}</b></span>
          <span>Kiểm thử gần nhất: {d(p.last_tested_at)}</span>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="tabs" role="tablist">
        {([["record", "Ghi giao dịch"], ["trades", "Danh sách"], ["stats", "Thống kê"], ["rules", "Quy tắc & tổng kết"], ["images", "Ảnh phiên"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "record" && (
        <section className="panel">
          {lastSaved && <Notice kind="ok">Đã lưu {lastSaved.code} ({lastSaved.r_multiple !== null ? `${lastSaved.r_multiple}R` : "chưa có R"}). Dữ liệu đã nằm trên máy chủ — có thể tiếp tục trên thiết bị khác.</Notice>}
          <TradeForm key={formKey} tradeType="backtest" session={s} compact onSaved={(t) => { setLastSaved(t); setFormKey((k) => k + 1); loadData(); loadSession(); }} />
          <p className="muted small">Mẹo: chỉ cần Entry, SL và giá thoát giả định — R được tính theo giá. Có thể nhập R trực tiếp hoặc kết quả tiền nếu muốn. Mở “Sửa” giao dịch để thêm phân tích chi tiết và ảnh.</p>
        </section>
      )}

      {(tab === "trades" || tab === "stats") && <FilterBar value={filters} onChange={(f) => { setFilters(f); setPage(1); }} tradeType="backtest" hide={["backtest_session_id", "strategy_id", "strategy_version_id", "account_id"]} extended />}

      {tab === "trades" && (trades === null ? <Loading /> : trades.items.length === 0 ? <Empty title="Chưa có giao dịch khớp bộ lọc" /> : (
        <>
          <TradeTable items={trades.items} tz={s.data_timezone} sort={sort} onSort={setSort} onDelete={del} />
          <Pager page={trades.page} pageSize={trades.page_size} total={trades.total} onPage={setPage} />
        </>
      ))}

      {tab === "stats" && (stats === null ? <Loading /> : (
        <>
          <StatsPanel s={stats} rOnly={stats.money_sample === 0} />
          <section className="panel">
            <div className="panel-head"><h2>Equity Curve</h2><span className="muted small">{LABEL.equity[s.equity_method]}</span></div>
            <EquityChart points={stats.equity_curve} tz={s.data_timezone} />
            <p className="muted small">Drawdown tính theo vốn tích lũy của lệnh đã đóng; không gồm biến động thả nổi của lệnh đang mở. Thay đổi quy ước vốn ở tab “Quy tắc & tổng kết”.</p>
          </section>
        </>
      ))}

      {tab === "rules" && (
        <section className="panel">
          <SessionForm initial={s} onSaved={() => { loadSession(); loadData(); }} />
          <hr />
          <button className="btn danger sm" onClick={deleteSession}>Xóa phiên</button>
        </section>
      )}

      {tab === "images" && <section className="panel"><ImageGallery owner={{ session: s.id }} /></section>}
    </div>
  );
}
