"use client";
import { useRouter } from "next/navigation";
import SessionForm from "@/components/SessionForm";
import { Notice } from "@/components/ui";

export default function NewSession() {
  const router = useRouter();
  return (
    <div>
      <header className="page-head"><h1>Phiên backtest mới</h1></header>
      <Notice>Ví dụ: “XAUUSD H4 Trend Pullback V1” — xu hướng H4, tìm vùng hồi H1, vào lệnh khi có xác nhận hành động giá, rủi ro giả định 0,5%/lệnh, mục tiêu 200 giao dịch. Đây chỉ là ví dụ cấu hình, không phải khuyến nghị giao dịch.</Notice>
      <SessionForm onSaved={(s) => router.push(`/backtest/${s.id}`)} />
    </div>
  );
}
