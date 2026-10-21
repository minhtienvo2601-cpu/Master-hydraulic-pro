"use client";
import { ReactNode } from "react";

export function Loading({ label = "Đang tải…" }: { label?: string }) {
  return <div className="state" role="status"><span className="spinner" aria-hidden /> {label}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="state empty"><strong>{title}</strong>{children && <div className="muted">{children}</div>}</div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="alert error" role="alert">
      <div style={{ whiteSpace: "pre-line" }}>{msg}</div>
      {onRetry && <button className="btn sm" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "warn" | "ok" }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? " wide" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub, toneClass, title }: { label: string; value: ReactNode; sub?: ReactNode; toneClass?: string; title?: string }) {
  return (
    <div className="stat" title={title}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${toneClass || ""}`}>{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Trước</button>
      <span>Trang {page}/{pages} · {total} giao dịch</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau ›</button>
    </div>
  );
}

export function Badge({ children, kind = "" }: { children: ReactNode; kind?: string }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
