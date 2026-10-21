"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { ErrorBox, Field } from "@/components/ui";

export default function LoginPage() {
  const { reload } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      await reload();
      const next = new URLSearchParams(location.search).get("next");
      location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className="auth-card">
      <h1>TradeJournal</h1>
      <p className="muted">Đăng nhập để tiếp tục nhật ký giao dịch.</p>
      <form onSubmit={submit} className="form">
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <Field label="Mật khẩu"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Field>
        <ErrorBox error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </form>
      <p className="muted small">Chưa có tài khoản? <Link href="/register">Đăng ký</Link></p>
    </div>
  );
}
