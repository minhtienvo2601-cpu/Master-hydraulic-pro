"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { ErrorBox, Field } from "@/components/ui";

export default function RegisterPage() {
  const { reload } = useUser();
  const [f, setF] = useState({ email: "", password: "", confirm: "", display_name: "",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Ho_Chi_Minh" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) { setError(new Error("Mật khẩu nhập lại không khớp")); return; }
    setBusy(true); setError(null);
    try {
      await api("/auth/register", { method: "POST", body: { email: f.email, password: f.password, display_name: f.display_name, timezone: f.timezone } });
      await reload();
      location.replace("/guide");
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <h1>Tạo tài khoản</h1>
      <form onSubmit={submit} className="form">
        <Field label="Tên hiển thị"><input value={f.display_name} onChange={set("display_name")} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></Field>
        <Field label="Mật khẩu" hint="Tối thiểu 10 ký tự"><input type="password" minLength={10} value={f.password} onChange={set("password")} required autoComplete="new-password" /></Field>
        <Field label="Nhập lại mật khẩu"><input type="password" value={f.confirm} onChange={set("confirm")} required autoComplete="new-password" /></Field>
        <Field label="Múi giờ hiển thị" hint="Tên IANA, ví dụ Asia/Ho_Chi_Minh"><input value={f.timezone} onChange={set("timezone")} required /></Field>
        <ErrorBox error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? "Đang tạo…" : "Đăng ký"}</button>
      </form>
      <p className="muted small">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>
    </div>
  );
}
