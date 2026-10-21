"use client";
import { useRouter } from "next/navigation";
import TradeForm from "@/components/TradeForm";

export default function NewTradePage() {
  const router = useRouter();
  return (
    <div>
      <header className="page-head"><h1>Giao dịch Live mới</h1></header>
      <TradeForm tradeType="live" onSaved={(t) => router.push(`/trades/${t.id}`)} />
    </div>
  );
}
