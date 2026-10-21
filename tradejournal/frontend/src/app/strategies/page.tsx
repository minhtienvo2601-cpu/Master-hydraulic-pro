"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { d, money, pct, r } from "@/components/format";
import type { Stats, Strategy, Version } from "@/components/types";
import { Badge, Empty, ErrorBox, Field, Loading, Notice } from "@/components/ui";

type Cmp = { version_id: string; version_no: number; label: string; status: string; sample_size: number; stats: Stats };

export default function StrategiesPage() {
  const [items, setItems] = useState<Strategy[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const load = useCallback(() => api<Strategy[]>("/strategies").then(setItems).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try { await api("/strategies", { method: "POST", body: { name, description: desc } }); setName(""); setDesc(""); load(); } catch (err) { setError(err); }
  }

  return (
    <div>
      <header className="page-head"><h1>Chiến lược & phiên bản</h1></header>
      <Notice>Phiên bản đã <b>xác nhận</b> bị khóa quy tắc — kết quả lịch sử không bị ghi đè. Muốn thay đổi quy tắc, hãy <b>sao chép thành phiên bản mới</b>; mỗi phiên bản có bộ thống kê riêng.</Notice>
      <ErrorBox error={error} />
      <form className="panel form inline" onSubmit={create}>
        <Field label="Tên chiến lược mới"><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="XAUUSD H4 Pullback" /></Field>
        <Field label="Mô tả"><input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <button className="btn primary">Tạo (kèm V1)</button>
      </form>
      {items === null ? <Loading /> : items.length === 0 ? <Empty title="Chưa có chiến lược" /> :
        items.map((s) => <StrategyCard key={s.id} s={s} onChange={load} onError={setError} />)}
    </div>
  );
}

function StrategyCard({ s, onChange, onError }: { s: Strategy; onChange: () => void; onError: (e: unknown) => void }) {
  const [cmp, setCmp] = useState<Cmp[] | null>(null);
  const [type, setType] = useState<"backtest" | "live">("backtest");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    api<{ versions: Cmp[] }>(`/strategies/${s.id}/compare?trade_type=${type}`).then((x) => setCmp(x.versions)).catch(onError);
  }, [open, type, s.id, s.versions.length, onError]);

  async function clone(v: Version) {
    try { await api(`/strategies/${s.id}/versions?from_version_id=${v.id}`, { method: "POST", body: {} }); onChange(); } catch (e) { onError(e); }
  }
  async function remove() {
    if (!confirm(`Xóa chiến lược ${s.name}?`)) return;
    try { await api(`/strategies/${s.id}`, { method: "DELETE" }); onChange(); } catch (e) { onError(e); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>{s.name}</h2>{s.description && <div className="muted small">{s.description}</div>}</div>
        <button className="btn sm ghost danger" onClick={remove}>Xóa</button>
      </div>
      {s.versions.map((v) => <VersionRow key={v.id} v={v} onClone={() => clone(v)} onChange={onChange} onError={onError} />)}
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>So sánh các phiên bản</summary>
        <div className="seg">
          <button className={type === "backtest" ? "on" : ""} onClick={() => setType("backtest")}>Backtest</button>
          <button className={type === "live" ? "on" : ""} onClick={() => setType("live")}>Live</button>
        </div>
        {cmp === null ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Phiên bản</th><th className="num">Cỡ mẫu</th><th className="num">Win rate</th><th className="num">Expectancy</th><th className="num">Tổng R</th><th className="num">Profit Factor</th><th className="num">Max DD (R)</th><th className="num">Net</th></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.version_id}>
                    <td data-label="Phiên bản">{c.label} {c.status === "draft" && <Badge kind="warn">nháp</Badge>}</td>
                    <td data-label="Cỡ mẫu" className="num">{c.sample_size}{c.sample_size < 30 && c.sample_size > 0 ? " ⚠" : ""}</td>
                    <td data-label="Win rate" className="num">{pct(c.stats.win_rate)}</td>
                    <td data-label="Expectancy" className="num">{r(c.stats.expectancy_r)}</td>
                    <td data-label="Tổng R" className="num">{r(c.stats.total_r)}</td>
                    <td data-label="Profit Factor" className="num">{c.stats.profit_factor?.toFixed(2) ?? "N/A"}</td>
                    <td data-label="Max DD (R)" className="num">{r(c.stats.max_drawdown_r ? -c.stats.max_drawdown_r : 0)}</td>
                    <td data-label="Net" className="num">{c.stats.money_sample ? money(c.stats.net_profit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Cùng định nghĩa chỉ số cho mọi phiên bản. ⚠ = cỡ mẫu dưới 30, kết luận cần thận trọng.</p>
          </div>
        )}
      </details>
    </section>
  );
}

function VersionRow({ v, onClone, onChange, onError }: { v: Version; onClone: () => void; onChange: () => void; onError: (e: unknown) => void }) {
  const { user } = useUser();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ label: v.label, entry_rules: v.entry_rules, exit_rules: v.exit_rules, risk_rules: v.risk_rules, notes: v.notes });
  const locked = v.status === "confirmed";
  async function save() {
    try { await api(`/strategies/versions/${v.id}`, { method: "PATCH", body: locked ? { label: f.label, notes: f.notes } : f }); setEdit(false); onChange(); } catch (e) { onError(e); }
  }
  async function confirmV() {
    if (!confirm(`Xác nhận ${v.label}? Sau khi xác nhận, quy tắc sẽ bị khóa vĩnh viễn.`)) return;
    try { await api(`/strategies/versions/${v.id}/confirm`, { method: "POST" }); onChange(); } catch (e) { onError(e); }
  }
  const ta = (k: keyof typeof f, label: string, dis = false) => (
    <Field label={label} wide><textarea rows={2} value={f[k]} disabled={dis} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  return (
    <div className="version">
      <div className="version-head">
        <strong>V{v.version_no} · {v.label}</strong>
        {locked ? <Badge kind="ok">Đã xác nhận {d(v.confirmed_at, user?.timezone)}</Badge> : <Badge kind="warn">Nháp</Badge>}
        <div className="row-actions">
          <button className="btn sm ghost" onClick={() => setEdit(!edit)}>{edit ? "Đóng" : locked ? "Xem" : "Sửa"}</button>
          {!locked && <button className="btn sm" onClick={confirmV}>Xác nhận</button>}
          <button className="btn sm" onClick={onClone}>Sao chép → phiên bản mới</button>
        </div>
      </div>
      {edit && (
        <div className="grid">
          <Field label="Tên phiên bản" wide><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          {ta("entry_rules", "Quy tắc vào lệnh", locked)}
          {ta("exit_rules", "Quy tắc thoát lệnh", locked)}
          {ta("risk_rules", "Quy tắc quản lý rủi ro", locked)}
          {ta("notes", "Ghi chú")}
          <div className="actions"><button className="btn primary sm" onClick={save}>Lưu</button></div>
        </div>
      )}
    </div>
  );
}
