"use client";
import { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import { LABEL } from "./format";
import type { BtSession, Strategy } from "./types";
import { ErrorBox, Field } from "./ui";

export default function SessionForm({ initial, onSaved }: { initial?: BtSession | null; onSaved: (s: BtSession) => void }) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [f, setF] = useState<Record<string, string | boolean>>(() => ({
    name: initial?.name ?? "", strategy_version_id: initial?.strategy_version_id ?? "", market: initial?.market ?? "",
    timeframe: initial?.timeframe ?? "", data_start: initial?.data_start ?? "", data_end: initial?.data_end ?? "",
    data_timezone: initial?.data_timezone ?? "UTC", entry_rules: initial?.entry_rules ?? "", exit_rules: initial?.exit_rules ?? "",
    risk_rules: initial?.risk_rules ?? "", target_trades: String(initial?.target_trades ?? 100),
    initial_capital: initial?.initial_capital != null ? String(initial.initial_capital) : "",
    equity_method: initial?.equity_method ?? "cash",
    risk_per_trade_pct: initial?.risk_per_trade_pct != null ? String(initial.risk_per_trade_pct) : "",
    summary_notes: initial?.summary_notes ?? "", is_completed: initial?.is_completed ?? false,
  }));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Strategy[]>("/strategies").then(setStrategies).catch(setError); }, []);
  const inp = (k: string) => ({ value: String(f[k] ?? ""), onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const num = (k: string) => (String(f[k]).trim() ? Number(f[k]) : null);
    const body = { ...f, target_trades: Number(f.target_trades), initial_capital: num("initial_capital"),
      risk_per_trade_pct: num("risk_per_trade_pct"), data_start: f.data_start || null, data_end: f.data_end || null };
    try {
      const s = initial ? await api<BtSession>(`/backtest-sessions/${initial.id}`, { method: "PUT", body })
                        : await api<BtSession>("/backtest-sessions", { method: "POST", body });
      onSaved(s);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="grid">
        <Field label="Tên phiên *" wide><input {...inp("name")} required placeholder="XAUUSD H4 Trend Pullback V1" /></Field>
        <Field label="Chiến lược / phiên bản *">
          <select {...inp("strategy_version_id")} required>
            <option value="">— Chọn —</option>
            {strategies.map((s) => <optgroup key={s.id} label={s.name}>{s.versions.map((v) => <option key={v.id} value={v.id}>{v.label}{v.status === "draft" ? " (nháp)" : ""}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Thị trường *"><input {...inp("market")} required placeholder="XAUUSD" /></Field>
        <Field label="Khung thời gian *"><input {...inp("timeframe")} required placeholder="H4" /></Field>
        <Field label="Dữ liệu từ ngày"><input type="date" {...inp("data_start")} /></Field>
        <Field label="Dữ liệu đến ngày"><input type="date" {...inp("data_end")} /></Field>
        <Field label="Múi giờ dữ liệu" hint="Thời gian giao dịch backtest nhập theo múi giờ này"><input {...inp("data_timezone")} required /></Field>
        <Field label="Mục tiêu số giao dịch *"><input type="number" min={1} {...inp("target_trades")} required /></Field>
        <Field label="Vốn ban đầu giả định"><input inputMode="decimal" {...inp("initial_capital")} /></Field>
        <Field label="Phương pháp equity">
          <select {...inp("equity_method")}>{Object.entries(LABEL.equity).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="% rủi ro mỗi lệnh" hint="Bắt buộc với phương pháp theo R"><input inputMode="decimal" {...inp("risk_per_trade_pct")} /></Field>
        <Field label="Quy tắc vào lệnh" hint="Để trống để dùng quy tắc của phiên bản chiến lược" wide><textarea rows={3} {...inp("entry_rules")} /></Field>
        <Field label="Quy tắc thoát lệnh" wide><textarea rows={3} {...inp("exit_rules")} /></Field>
        <Field label="Quy tắc quản lý rủi ro" wide><textarea rows={2} {...inp("risk_rules")} /></Field>
        {initial && <Field label="Ghi chú tổng kết" wide><textarea rows={4} {...inp("summary_notes")} /></Field>}
      </div>
      {initial && <label className="check"><input type="checkbox" checked={Boolean(f.is_completed)} onChange={(e) => setF({ ...f, is_completed: e.target.checked })} /> Đánh dấu phiên đã hoàn thành</label>}
      <ErrorBox error={error} />
      <div className="actions"><button className="btn primary" disabled={busy}>{busy ? "Đang lưu…" : initial ? "Lưu phiên" : "Tạo phiên backtest"}</button></div>
    </form>
  );
}
