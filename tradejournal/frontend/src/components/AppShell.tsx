"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { User } from "./types";
import { Loading } from "./ui";

type Ctx = { user: User | null; reload: () => Promise<void> };
const UserCtx = createContext<Ctx>({ user: null, reload: async () => {} });
export const useUser = () => useContext(UserCtx);

const PUBLIC = ["/login", "/register"];
const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/trades", label: "Live", icon: "≡" },
  { href: "/backtest", label: "Backtest", icon: "⟲" },
  { href: "/strategies", label: "Chiến lược", icon: "◇" },
  { href: "/accounts", label: "Tài khoản", icon: "¤" },
  { href: "/data", label: "Dữ liệu", icon: "⇅" },
  { href: "/guide", label: "Hướng dẫn", icon: "?" },
  { href: "/settings", label: "Cài đặt", icon: "⚙" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const isPublic = PUBLIC.some((p) => path.startsWith(p));

  const reload = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (ready && !user && !isPublic) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, user, isPublic, path, router]);

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); router.replace("/login"); }
  }

  if (isPublic) return <UserCtx.Provider value={{ user, reload }}><main className="public">{children}</main></UserCtx.Provider>;
  if (!ready || !user) return <Loading />;

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <UserCtx.Provider value={{ user, reload }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">TradeJournal</div>
          <nav>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""}>
                <span className="ico" aria-hidden>{n.icon}</span>{n.label}
              </Link>
            ))}
          </nav>
          <div className="me">
            <div className="muted small">{user.display_name || user.email}</div>
            <div className="muted small">Múi giờ: {user.timezone}</div>
            <button className="btn sm ghost" onClick={logout}>Đăng xuất</button>
          </div>
        </aside>
        <main className="content">{children}</main>
        <nav className="bottombar">
          {NAV.slice(0, 5).map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""}>
              <span className="ico" aria-hidden>{n.icon}</span><span>{n.label}</span>
            </Link>
          ))}
          <Link href="/settings" className={["/data", "/guide", "/settings"].some(active) ? "active" : ""}>
            <span className="ico" aria-hidden>⋯</span><span>Thêm</span>
          </Link>
        </nav>
      </div>
    </UserCtx.Provider>
  );
}
