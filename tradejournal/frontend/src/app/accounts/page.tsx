"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { money } from "@/components/format";
import type { Account } from "@/components/types";
import { Badge, Empty, ErrorBox, Field, Loading } from "@/components/ui";

const blank = { name: "", broker: "", currency: "USD", initial_balance: "", is_archived: false };

export default function AccountsPage() {
  const [items, setItems] = useState<Account[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [f, setF] = useState<typeof blank>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(() => api<Account[]>("/accounts").then(setItems).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...f, initial_balance: f.initial_balance === "" ? null : Number(f.initial_balance) };
    try {
      await api(editing ? `/accounts/${editing}` : "/accounts", { method: editing ? "PUT" : "POST", body });
      setF(blank); setEditing(null); setError(null); load();
    } catch (err) { setError(err); }
  }
  async function remove(a: Account) {
    if (!confirm(`Xóa tài khoản ${a.name}?`)) return;
    try { await api(`/accounts/${a.id}`, { method: "DELETE" }); load(); } catch (err) { setError(err); }
  }

  return (
    <div>
      <header className="page-head"><h1>Tài khoản giao dịch</h1></header>
      <form className="panel form" onSubmit={submit}>
        <div className="grid">
          <Field label="Tên tài khoản *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Broker"><input value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} /></Field>
          <Field label="Đơn vị tiền"><input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} required maxLength={10} /></Field>
          <Field label="Số dư ban đầu" hint="Cần để tính drawdown %"><input inputMode="decimal" value={f.initial_balance} onChange={(e) => setF({ ...f, initial_balance: e.target.value })} /></Field>
        </div>
        {editing && <label className="check"><input type="checkbox" checked={f.is_archived} onChange={(e) => setF({ ...f, is_archived: e.target.checked })} /> Lưu trữ (ẩn khỏi form nhập)</label>}
        <ErrorBox error={error} />
        <div className="actions">
          <button className="btn primary">{editing ? "Lưu" : "Thêm tài khoản"}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setF(blank); }}>Hủy</button>}
        </div>
      </form>
      {items === null ? <Loading /> : items.length === 0 ? <Empty title="Chưa có tài khoản">Thêm tài khoản để ghi giao dịch Live.</Empty> : (
        <div className="cards">
          {items.map((a) => (
            <div key={a.id} className="card">
              <div className="card-head"><strong>{a.name}</strong>{a.is_archived && <Badge>Lưu trữ</Badge>}</div>
              <div className="muted small">{a.broker || "—"} · {a.currency}</div>
              <div className="small">Số dư ban đầu: {a.initial_balance === null ? "chưa nhập" : money(a.initial_balance)}</div>
              <div className="row-actions">
                <button className="btn sm ghost" onClick={() => { setEditing(a.id); setF({ name: a.name, broker: a.broker, currency: a.currency, initial_balance: a.initial_balance === null ? "" : String(a.initial_balance), is_archived: a.is_archived }); }}>Sửa</button>
                <button className="btn sm ghost danger" onClick={() => remove(a)}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
