"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import { useUser } from "@/components/AppShell";
import { useRefs } from "@/components/FilterBar";
import { dt } from "@/components/format";
import type { ImportJob, PriceSeries } from "@/components/types";
import { ErrorBox, Field, Notice } from "@/components/ui";

export default function DataPage() {
  const { user } = useUser();
  const { accounts, sessions } = useRefs();
  const [type, setType] = useState("live");
  const [accountId, setAccountId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [tz, setTz] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadJobs = useCallback(() => api<ImportJob[]>("/import/jobs").then(setJobs).catch(() => {}), []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  async function preview() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.append("file", f); form.append("trade_type", type); form.append("timezone", tz);
    if (type === "live" && accountId) form.append("account_id", accountId);
    if (type === "backtest" && sessionId) form.append("backtest_session_id", sessionId);
    setBusy(true); setError(null);
    try { setJob(await api<ImportJob>("/import/trades/preview", { method: "POST", form })); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  async function commit() {
    if (!job) return;
    setBusy(true);
    try { setJob(await api<ImportJob>(`/import/jobs/${job.id}/commit`, { method: "POST" })); loadJobs(); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div>
      <header className="page-head"><h1>Nhập / xuất dữ liệu</h1></header>

      <section className="panel">
        <h2>Xuất dữ liệu cá nhân</h2>
        <p className="muted small">Tải về bất cứ lúc nào để lưu trữ riêng. Tệp CSV xuất ra có thể nhập lại.</p>
        <div className="row-actions wrap">
          <a className="btn" href="/api/v1/export/trades.csv?trade_type=live">Giao dịch Live (CSV)</a>
          <a className="btn" href="/api/v1/export/trades.csv?trade_type=backtest">Giao dịch Backtest (CSV)</a>
          <a className="btn" href="/api/v1/export/strategies.csv">Chiến lược & phiên bản (CSV)</a>
          <a className="btn" href="/api/v1/export/backtest-sessions.csv">Phiên backtest (CSV)</a>
          <a className="btn" href="/api/v1/export/stats.json" target="_blank">Báo cáo thống kê (JSON)</a>
          <a className="btn primary" href="/api/v1/export/archive.zip">Toàn bộ + ảnh (ZIP)</a>
        </div>
      </section>

      <section className="panel">
        <h2>Nhập giao dịch từ CSV</h2>
        <p className="muted small">Bước 1 kiểm tra từng dòng và đánh dấu dòng trùng; chưa ghi gì. Bước 2 mới nhập. Nhập lại cùng tệp sẽ không tạo giao dịch trùng. Xem định dạng ở trang Hướng dẫn.</p>
        <div className="grid">
          <Field label="Loại giao dịch (mặc định)">
            <select value={type} onChange={(e) => setType(e.target.value)}><option value="live">Live</option><option value="backtest">Backtest</option></select>
          </Field>
          {type === "live" ? (
            <Field label="Tài khoản (khi CSV không có cột account)">
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          ) : (
            <Field label="Phiên backtest (khi CSV không có cột backtest_session)">
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">—</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
          )}
          <Field label="Múi giờ cho thời gian không ghi múi giờ" hint={`Mặc định: ${user?.timezone}`}><input value={tz} onChange={(e) => setTz(e.target.value)} placeholder={user?.timezone} /></Field>
          <Field label="Tệp CSV (UTF-8)"><input ref={fileRef} type="file" accept=".csv,text/csv" onChange={() => setJob(null)} /></Field>
        </div>
        <ErrorBox error={error} />
        <div className="actions"><button className="btn" onClick={preview} disabled={busy}>Kiểm tra tệp</button></div>
        {job && (
          <div className="import-result">
            <Notice kind={job.status === "committed" ? "ok" : job.error_rows ? "warn" : "info"}>
              {job.status === "committed"
                ? <>Đã nhập <b>{job.imported_rows}</b> giao dịch. Bỏ qua {job.duplicate_rows} dòng trùng, {job.error_rows} dòng lỗi.</>
                : <>Tổng {job.total_rows} dòng: <b>{job.valid_rows}</b> hợp lệ, {job.duplicate_rows} trùng, {job.error_rows} lỗi.</>}
            </Notice>
            {job.errors.length > 0 && (
              <div className="table-wrap"><table className="table"><thead><tr><th>Dòng</th><th>Vấn đề</th></tr></thead>
                <tbody>{job.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.line}</td><td className={e.duplicate ? "muted" : "neg"}>{e.errors.join("; ")}</td></tr>)}</tbody></table></div>
            )}
            {job.status !== "committed" && job.valid_rows > 0 && <button className="btn primary" onClick={commit} disabled={busy}>Nhập {job.valid_rows} giao dịch hợp lệ</button>}
          </div>
        )}
        {jobs.length > 0 && (
          <details><summary>Lịch sử nhập dữ liệu</summary>
            <ul className="small">{jobs.map((j) => <li key={j.id}>{dt(j.created_at, user!.timezone)} · {j.filename} · {j.status === "committed" ? `đã nhập ${j.imported_rows}` : "chưa nhập"} · {j.duplicate_rows} trùng · {j.error_rows} lỗi</li>)}</ul>
          </details>
        )}
      </section>

      <PricesSection />
    </div>
  );
}

function PricesSection() {
  const [series, setSeries] = useState<PriceSeries[]>([]);
  const [f, setF] = useState({ symbol: "", timeframe: "H4", source: "", timezone: "UTC" });
  const [error, setError] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<PriceSeries[]>("/prices/series").then(setSeries).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    setError(null); setOk(null);
    try { const s = await api<PriceSeries>("/prices/series/import", { method: "POST", form }); setOk(`Đã nhập ${s.symbol} ${s.timeframe}: ${s.bar_count} nến`); load(); } catch (e) { setError(e); }
  }
  async function remove(s: PriceSeries) {
    if (!confirm(`Xóa dữ liệu giá ${s.symbol} ${s.timeframe} (${s.source})?`)) return;
    try { await api(`/prices/series/${s.id}`, { method: "DELETE" }); load(); } catch (e) { setError(e); }
  }

  return (
    <section className="panel" id="prices">
      <h2>Dữ liệu giá cho biểu đồ tương tác</h2>
      <Notice>MVP chưa tích hợp nhà cung cấp dữ liệu giá. Bạn có thể nhập nến OHLC (cột <code>time,open,high,low,close[,volume]</code>) từ nguồn mà bạn có quyền sử dụng, ví dụ xuất từ MT5. Ứng dụng không tự tạo dữ liệu nến.</Notice>
      <div className="grid">
        <Field label="Mã"><input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} placeholder="XAUUSD" /></Field>
        <Field label="Khung"><input value={f.timeframe} onChange={(e) => setF({ ...f, timeframe: e.target.value })} /></Field>
        <Field label="Nguồn dữ liệu *"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="MT5 – broker X" /></Field>
        <Field label="Múi giờ của cột time"><input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
        <Field label="Tệp CSV"><input ref={fileRef} type="file" accept=".csv,text/csv" /></Field>
      </div>
      <ErrorBox error={error} />
      {ok && <Notice kind="ok">{ok}</Notice>}
      <div className="actions"><button className="btn" onClick={upload} disabled={!f.symbol || !f.source}>Nhập dữ liệu giá</button></div>
      {series.length > 0 && (
        <ul className="small">{series.map((s) => (
          <li key={s.id}>{s.symbol} {s.timeframe} · {s.source} · {s.bar_count} nến ({s.first_ts?.slice(0, 10)} → {s.last_ts?.slice(0, 10)}) <button className="btn sm ghost danger" onClick={() => remove(s)}>Xóa</button></li>
        ))}</ul>
      )}
    </section>
  );
}
