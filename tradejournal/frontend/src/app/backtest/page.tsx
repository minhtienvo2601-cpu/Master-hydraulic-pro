"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { d } from "@/components/format";
import type { BtSession } from "@/components/types";
import { Badge, Empty, ErrorBox, Loading } from "@/components/ui";

export default function BacktestList() {
  const { user } = useUser();
  const [items, setItems] = useState<BtSession[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { api<BtSession[]>("/backtest-sessions").then(setItems).catch(setError); }, []);
  return (
    <div>
      <header className="page-head">
        <h1>Backtest Journal</h1>
        <Link href="/backtest/new" className="btn primary">+ Phiên mới</Link>
      </header>
      <ErrorBox error={error} />
      {items === null ? <Loading /> : items.length === 0 ? (
        <Empty title="Chưa có phiên backtest">Tạo <Link href="/strategies">chiến lược</Link> trước, rồi <Link href="/backtest/new">tạo phiên</Link>.</Empty>
      ) : (
        <div className="cards">
          {items.map((s) => (
            <Link key={s.id} href={`/backtest/${s.id}`} className="card">
              <div className="card-head"><strong>{s.name}</strong>{s.is_completed ? <Badge kind="ok">Hoàn thành</Badge> : <Badge>Đang test</Badge>}</div>
              <div className="muted small">{s.strategy_label} · {s.market} {s.timeframe}</div>
              <div className="progress" aria-label={`Tiến độ ${s.progress?.completion_pct}%`}><div style={{ width: `${s.progress?.completion_pct ?? 0}%` }} /></div>
              <div className="small">{s.progress?.recorded}/{s.progress?.target} giao dịch ({s.progress?.completion_pct}%)
                {s.progress?.incomplete ? <> · <span className="warn-text">{s.progress.incomplete} chưa hoàn tất</span></> : null}</div>
              <div className="muted small">Kiểm thử gần nhất: {d(s.progress?.last_tested_at, user?.timezone)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
