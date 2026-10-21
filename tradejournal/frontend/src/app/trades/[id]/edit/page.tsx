"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import TradeForm from "@/components/TradeForm";
import type { BtSession, Trade } from "@/components/types";
import { ErrorBox, Loading } from "@/components/ui";

export default function EditTradePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<Trade | null>(null);
  const [session, setSession] = useState<BtSession | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api<Trade>(`/trades/${id}`).then(async (tr) => {
      setSession(tr.backtest_session_id ? await api<BtSession>(`/backtest-sessions/${tr.backtest_session_id}`) : null);
      setT(tr);
    }).catch(setError);
  }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!t || session === undefined) return <Loading />;
  return (
    <div>
      <header className="page-head"><h1>Sửa {t.code}</h1></header>
      <TradeForm initial={t} tradeType={t.trade_type} session={session} onSaved={(x) => router.push(`/trades/${x.id}`)} />
    </div>
  );
}
