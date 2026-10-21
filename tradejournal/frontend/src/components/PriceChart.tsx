"use client";
import Link from "next/link";
import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api, qs } from "./api";
import type { PriceSeries, Trade } from "./types";
import { ErrorBox, Loading, Notice } from "./ui";

const TF_SECONDS: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 };
type Bar = { time: number; open: number; high: number; low: number; close: number };

export function tradeToBody(t: Trade): Record<string, unknown> {
  const { id: _id, net_pnl: _n, r_multiple: _r, r_source: _s, outcome: _o, created_at: _c, updated_at: _u, image_count: _i, tags, ...rest } = t;
  return { ...rest, tags: tags.map((x) => x.name) };
}

/** Biểu đồ nến cho giao dịch. Chỉ hiển thị khi người dùng đã nhập dữ liệu giá thật; không bao giờ sinh nến giả. */
export default function PriceChart({ trade, onTradeUpdated }: { trade: Trade; onTradeUpdated?: (t: Trade) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [series, setSeries] = useState<PriceSeries[] | null>(null);
  const [selected, setSelected] = useState<string>((trade.chart_config?.series_id as string) || "");
  const [bars, setBars] = useState<Bar[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<PriceSeries[]>(`/prices/series${qs({ symbol: trade.market })}`).then((s) => {
      setSeries(s);
      if (!selected && s.length) setSelected((s.find((x) => x.timeframe === trade.timeframe) ?? s[0]).id);
    }).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.market]);

  useEffect(() => {
    if (!selected || !series) return;
    const s = series.find((x) => x.id === selected);
    const step = TF_SECONDS[(s?.timeframe || "").toUpperCase()] ?? 3600;
    const entry = Date.parse(trade.entry_time) / 1000;
    const exit = trade.exit_time ? Date.parse(trade.exit_time) / 1000 : entry;
    const start = new Date((entry - step * 120) * 1000).toISOString();
    const end = new Date((exit + step * 60) * 1000).toISOString();
    setBars(null);
    api<{ bars: Bar[] }>(`/prices/series/${selected}/bars${qs({ start, end, limit: 5000 })}`).then((r) => setBars(r.bars)).catch(setError);
  }, [selected, series, trade.entry_time, trade.exit_time]);

  useEffect(() => {
    if (!box.current || !bars || bars.length === 0) return;
    let disposed = false;
    let cleanup = () => {};
    import("lightweight-charts").then(({ createChart, CandlestickSeries, createSeriesMarkers, LineStyle }) => {
      if (disposed || !box.current) return;
      const css = getComputedStyle(document.documentElement);
      const text = css.getPropertyValue("--muted").trim() || "#888";
      const chart = createChart(box.current, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: text },
        grid: { vertLines: { color: "rgba(128,128,128,0.12)" }, horzLines: { color: "rgba(128,128,128,0.12)" } },
        timeScale: { timeVisible: true, secondsVisible: false },
      });
      const s = chart.addSeries(CandlestickSeries, { upColor: "#16a34a", downColor: "#dc2626", wickUpColor: "#16a34a", wickDownColor: "#dc2626", borderVisible: false });
      s.setData(bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })));
      const line = (price: number | null, color: string, title: string, style = LineStyle.Dashed) =>
        price !== null && s.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
      line(trade.entry_price, "#3b82f6", "Entry", LineStyle.Solid);
      line(trade.stop_loss, "#dc2626", "SL");
      line(trade.take_profit, "#16a34a", "TP");
      line(trade.exit_price, "#a855f7", "Exit");
      const snap = (t: number) => { let best = bars[0].time; for (const b of bars) { if (b.time <= t) best = b.time; else break; } return best; };
      const buy = trade.direction === "buy";
      const markers: SeriesMarker<Time>[] = [{ time: snap(Date.parse(trade.entry_time) / 1000) as UTCTimestamp, position: buy ? "belowBar" : "aboveBar", color: "#3b82f6", shape: buy ? "arrowUp" : "arrowDown", text: "Entry" }];
      if (trade.exit_time) markers.push({ time: snap(Date.parse(trade.exit_time) / 1000) as UTCTimestamp, position: buy ? "aboveBar" : "belowBar", color: "#a855f7", shape: "circle", text: "Exit" });
      createSeriesMarkers(s, markers);
      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    });
    return () => { disposed = true; cleanup(); };
  }, [bars, trade]);

  async function saveConfig() {
    try {
      const t = await api<Trade>(`/trades/${trade.id}`, { method: "PUT", body: { ...tradeToBody(trade), chart_config: { ...(trade.chart_config || {}), series_id: selected } } });
      setSaved(true);
      onTradeUpdated?.(t);
    } catch (e) { setError(e); }
  }

  if (error) return <ErrorBox error={error} />;
  if (series === null) return <Loading />;
  if (series.length === 0) {
    return (
      <Notice>
        Chưa có dữ liệu giá cho <b>{trade.market}</b>. Ứng dụng không tạo dữ liệu nến giả.
        Bạn có thể <Link href="/data#prices">nhập dữ liệu OHLC</Link> từ nguồn bạn có quyền sử dụng, hoặc lưu ảnh biểu đồ bên dưới.
      </Notice>
    );
  }
  const cur = series.find((x) => x.id === selected);
  return (
    <div>
      <div className="filters-row">
        <label className="mini">Dữ liệu giá
          <select value={selected} onChange={(e) => { setSelected(e.target.value); setSaved(false); }}>
            {series.map((s) => <option key={s.id} value={s.id}>{s.symbol} {s.timeframe} — {s.source}</option>)}
          </select>
        </label>
        <button className="btn sm ghost" onClick={saveConfig}>{saved ? "Đã lưu cấu hình" : "Lưu cấu hình biểu đồ"}</button>
      </div>
      {bars === null ? <Loading /> : bars.length === 0 ? (
        <Notice>Dữ liệu {cur?.symbol} {cur?.timeframe} không phủ thời điểm giao dịch này.</Notice>
      ) : (
        <>
          <div ref={box} className="price-chart" />
          <p className="muted small">Nguồn: {cur?.source} (do người dùng nhập). Đường: Entry (xanh dương), SL (đỏ), TP (xanh lá), Exit (tím).</p>
        </>
      )}
    </div>
  );
}
