"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { ErrorBox, Field, Notice } from "@/components/ui";

export default function SettingsPage() {
  const { user, reload } = useUser();
  const [p, setP] = useState({ display_name: user?.display_name ?? "", timezone: user?.timezone ?? "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setError(null); setMsg(null);
    try { await api("/auth/me", { method: "PATCH", body: p }); await reload(); setMsg("Đã lưu hồ sơ"); } catch (err) { setError(err); }
  }
  async function changePw(e: FormEvent) {
    e.preventDefault(); setError(null); setMsg(null);
    try { await api("/auth/password", { method: "POST", body: pw }); setPw({ current_password: "", new_password: "" }); setMsg("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất."); } catch (err) { setError(err); }
  }

  return (
    <div>
      <header className="page-head"><h1>Cài đặt</h1></header>
      <nav className="row-actions wrap mobile-only">
        <Link className="btn" href="/accounts">Tài khoản</Link>
        <Link className="btn" href="/data">Nhập / xuất dữ liệu</Link>
        <Link className="btn" href="/guide">Hướng dẫn</Link>
      </nav>
      {msg && <Notice kind="ok">{msg}</Notice>}
      <ErrorBox error={error} />
      <form className="panel form" onSubmit={saveProfile}>
        <h2>Hồ sơ</h2>
        <div className="grid">
          <Field label="Email"><input value={user?.email ?? ""} disabled /></Field>
          <Field label="Tên hiển thị"><input value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></Field>
          <Field label="Múi giờ hiển thị" hint="IANA, ví dụ Asia/Ho_Chi_Minh, Europe/London"><input value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} required /></Field>
        </div>
        <div className="actions"><button className="btn primary">Lưu hồ sơ</button></div>
      </form>
      <form className="panel form" onSubmit={changePw}>
        <h2>Đổi mật khẩu</h2>
        <div className="grid">
          <Field label="Mật khẩu hiện tại"><input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 10 ký tự"><input type="password" minLength={10} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required autoComplete="new-password" /></Field>
        </div>
        <div className="actions"><button className="btn">Đổi mật khẩu</button></div>
      </form>
    </div>
  );
}
