"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { d, money } from "./format";
import type { EquityPoint, PeriodRow } from "./types";
import { Empty } from "./ui";

export function EquityChart({ points, tz }: { points: EquityPoint[]; tz: string }) {
  if (points.length <= 1) return <Empty title="Chưa có giao dịch đã đóng để vẽ Equity Curve" />;
  const data = points.map((p, i) => ({ i, label: p.time ? d(p.time, tz) : "Bắt đầu", equity: p.equity, dd: p.drawdown_pct }));
  return (
    <div className="chart" aria-label="Biểu đồ Equity Curve">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="i" tickFormatter={(i) => data[i]?.label ?? ""} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={32} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted)" }} width={70} tickFormatter={(v) => money(v, 0)} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8 }}
            labelFormatter={(i) => `#${i} · ${data[Number(i)]?.label}`}
            formatter={(v: number, name) => [money(v), name === "equity" ? "Equity" : name]}
          />
          <Line type="monotone" dataKey="equity" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeriodChart({ rows, metric }: { rows: PeriodRow[]; metric: "net_pnl" | "total_r" }) {
  if (!rows.length) return <Empty title="Chưa có dữ liệu theo thời gian" />;
  return (
    <div className="chart" aria-label="Biểu đồ lợi nhuận theo thời gian">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} width={70} tickFormatter={(v) => (metric === "total_r" ? `${v}R` : money(v, 0))} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            cursor={{ fill: "var(--grid)" }}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8 }}
            formatter={(v: number) => [metric === "total_r" ? `${v}R` : money(v), metric === "total_r" ? "Tổng R" : "Lợi nhuận ròng"]}
          />
          <Bar dataKey={metric} isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={i} fill={r[metric] >= 0 ? "var(--pos)" : "var(--neg)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
