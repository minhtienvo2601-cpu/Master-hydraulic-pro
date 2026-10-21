"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { dt, LABEL, money, num, r, signedMoney, tone } from "@/components/format";
import ImageGallery from "@/components/ImageGallery";
import PriceChart from "@/components/PriceChart";
import type { Account, BtSession, Trade } from "@/components/types";
import { Badge, ErrorBox, Loading } from "@/components/ui";

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const router = useRouter();
  const [t, setT] = useState<Trade | null>(null);
  const [session, setSession] = useState<BtSession | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api<Trade>(`/trades/${id}`).then(async (tr) => {
      setT(tr);
      if (tr.backtest_session_id) setSession(await api<BtSession>(`/backtest-sessions/${tr.backtest_session_id}`));
      if (tr.account_id) setAccount((await api<Account[]>("/accounts")).find((a) => a.id === tr.account_id) ?? null);
    }).catch(setError);
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (!t) return <Loading />;
  const tz = session ? session.data_timezone : user!.timezone;

  async function del() {
    if (!t || !confirm(`Xóa giao dịch ${t.code}${t.image_count ? ` và ${t.image_count} ảnh` : ""}? Không thể hoàn tác.`)) return;
    try {
      await api(`/trades/${t.id}`, { method: "DELETE" });
      router.push(session ? `/backtest/${session.id}` : "/trades");
    } catch (e) { setError(e); }
  }

  const row = (label: string, value: ReactNode) => <div className="kv"><span>{label}</span><b>{value || "—"}</b></div>;
  return (
    <div>
      <header className="page-head">
        <div>
          <div className="muted small">{t.trade_type === "live" ? "Live Trading" : <Link href={`/backtest/${session?.id}`}>Backtest · {session?.name}</Link>}</div>
          <h1>{t.code} <Badge kind={t.direction}>{LABEL.direction[t.direction]}</Badge> {t.is_draft && <Badge kind="warn">nháp</Badge>}</h1>
        </div>
        <div className="row-actions">
          <Link href={`/trades/${t.id}/edit`} className="btn">Sửa</Link>
          <button className="btn danger" onClick={del}>Xóa</button>
        </div>
      </header>
      <div className="stats">
        <div className="stat"><div className="stat-label">Kết quả ròng</div><div className={`stat-value ${tone(t.net_pnl)}`}>{signedMoney(t.net_pnl)}</div><div className="stat-sub">{account?.currency}</div></div>
        <div className="stat"><div className="stat-label">Kết quả R</div><div className={`stat-value ${tone(t.r_multiple)}`}>{r(t.r_multiple)}</div><div className="stat-sub">{LABEL.rSource[t.r_source]}</div></div>
        <div className="stat"><div className="stat-label">Trạng thái</div><div className="stat-value">{LABEL.status[t.status]}</div><div className="stat-sub">{t.outcome ? LABEL.outcome[t.outcome] : "Chưa tính vào thống kê"}</div></div>
      </div>
      <div className="two-col">
        <section className="panel">
          <h2>Thông tin lệnh</h2>
          {row("Tài khoản", account?.name)}
          {row("Thị trường / khung", `${t.market} ${t.timeframe}`)}
          {row(`Vào lệnh (${tz})`, dt(t.entry_time, tz))}
          {row(`Thoát lệnh (${tz})`, dt(t.exit_time, tz))}
          {row("Phiên giao dịch", t.trading_session)}
          {row("Giá vào", num(t.entry_price))}
          {row("Stop Loss ban đầu", num(t.stop_loss))}
          {row("Take Profit dự kiến", num(t.take_profit))}
          {row("Giá thoát", num(t.exit_price))}
          {row("Khối lượng", num(t.volume))}
          {row("Rủi ro dự kiến", t.risk_amount !== null ? money(t.risk_amount) : "")}
          {row("Kết quả trước chi phí", t.gross_pnl !== null ? signedMoney(t.gross_pnl) : "")}
          {row("Commission / Swap / Phí khác", `${money(t.commission)} / ${money(t.swap)} / ${money(t.other_fees)}`)}
          {t.r_manual !== null && row("R nhập tay", r(t.r_manual))}
          {t.chart_link && row("Liên kết biểu đồ", <a href={t.chart_link} target="_blank" rel="noopener noreferrer">Mở ↗</a>)}
          {t.tags.length > 0 && row("Nhãn", t.tags.map((x) => <Badge key={x.id}>{x.name}</Badge>))}
        </section>
        <section className="panel">
          <h2>Phân tích</h2>
          {row("Xu hướng", t.trend)}
          {row("Setup", t.setup)}
          {row("Điều kiện thị trường", t.market_condition)}
          {row("Tuân thủ kế hoạch", LABEL.compliance[t.plan_compliance])}
          {row("Cảm xúc", t.emotion)}
          {[["Vùng giá quan trọng", t.key_levels], ["Điều kiện xác nhận", t.confirmation], ["Lý do vào", t.entry_reason], ["Lý do thoát", t.exit_reason], ["Lỗi giao dịch", t.mistakes], ["Bài học", t.lessons], ["Ghi chú", t.notes]]
            .filter(([, v]) => v).map(([k, v]) => <div key={k} className="note"><span className="muted small">{k}</span><p>{v}</p></div>)}
        </section>
      </div>
      <section className="panel">
        <h2>Biểu đồ giá</h2>
        <PriceChart trade={t} onTradeUpdated={setT} />
      </section>
      <section className="panel">
        <h2>Hình ảnh</h2>
        <ImageGallery owner={{ trade: t.id }} />
      </section>
    </div>
  );
}
