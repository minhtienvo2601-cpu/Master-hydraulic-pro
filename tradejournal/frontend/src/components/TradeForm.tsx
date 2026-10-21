"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, newIdempotencyKey } from "./api";
import { useUser } from "./AppShell";
import { useRefs } from "./FilterBar";
import { isoToWall, LABEL, r as fmtR, signedMoney, wallToIso } from "./format";
import type { BtSession, Trade, TradeType } from "./types";
import { ErrorBox, Field, Notice } from "./ui";

type Props = { initial?: Trade | null; tradeType: TradeType; session?: BtSession | null; onSaved: (t: Trade) => void; compact?: boolean };

const NUMS = ["entry_price", "stop_loss", "take_profit", "exit_price", "volume", "risk_amount", "gross_pnl", "commission", "swap", "other_fees", "r_manual"] as const;
const TEXTS = ["code", "market", "timeframe", "trading_session", "trend", "key_levels", "setup", "confirmation", "market_condition", "entry_reason", "exit_reason", "plan_compliance", "mistakes", "emotion", "lessons", "notes", "chart_link"] as const;
type State = Record<string, string | boolean>;

function toState(t: Trade | null | undefined, tz: string, type: TradeType, session?: BtSession | null): State {
  const s: State = {
    direction: t?.direction ?? "buy", status: t?.status ?? (type === "backtest" ? "closed" : "open"),
    entry_time: isoToWall(t?.entry_time, tz), exit_time: isoToWall(t?.exit_time, tz),
    account_id: t?.account_id ?? "", strategy_version_id: t?.strategy_version_id ?? session?.strategy_version_id ?? "",
    is_draft: t?.is_draft ?? false, tags: (t?.tags ?? []).map((x) => x.name).join(", "),
  };
  for (const k of NUMS) s[k] = t && t[k] !== null && t[k] !== undefined ? String(t[k]) : k === "commission" || k === "swap" || k === "other_fees" ? "0" : "";
  for (const k of TEXTS) s[k] = (t?.[k] as string) ?? "";
  if (!t && session) { s.market = session.market; s.timeframe = session.timeframe; }
  return s;
}

const n = (v: string | boolean) => (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : null);

export default function TradeForm({ initial, tradeType, session, onSaved, compact }: Props) {
  const { user } = useUser();
  // Backtest: thời gian nhập theo múi giờ dữ liệu lịch sử của phiên; Live: theo múi giờ người dùng
  const tz = tradeType === "backtest" && session ? session.data_timezone : user?.timezone || "UTC";
  const { accounts, strategies, options } = useRefs(tradeType);
  const [s, setS] = useState<State>(() => toState(initial, tz, tradeType, session));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idem = useRef(newIdempotencyKey());

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (k: string, v: string | boolean) => { setS((p) => ({ ...p, [k]: v })); setDirty(true); };
  const inp = (k: string, extra: Record<string, unknown> = {}) => ({
    value: String(s[k] ?? ""), onChange: (e: { target: { value: string } }) => set(k, e.target.value), ...extra,
  });

  const preview = useMemo(() => {
    const gross = n(s.gross_pnl);
    const net = gross === null ? null : gross - (n(s.commission) || 0) - (n(s.other_fees) || 0) + (n(s.swap) || 0);
    const risk = n(s.risk_amount);
    let rv: number | null = null; let src = "none";
    if (s.status === "closed") {
      if (risk && net !== null) { rv = net / risk; src = "computed"; }
      else if (n(s.r_manual) !== null) { rv = n(s.r_manual); src = "manual"; }
      else if (tradeType === "backtest") {
        const e = n(s.entry_price), sl = n(s.stop_loss), x = n(s.exit_price);
        if (e && sl && x && e !== sl) { rv = (s.direction === "buy" ? x - e : e - x) / Math.abs(e - sl); src = "price"; }
      }
    }
    return { net, rv, src };
  }, [s, tradeType]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const body: Record<string, unknown> = {
      trade_type: tradeType, direction: s.direction, status: s.status, is_draft: s.is_draft,
      entry_time: s.entry_time ? wallToIso(String(s.entry_time), tz) : null,
      exit_time: s.exit_time ? wallToIso(String(s.exit_time), tz) : null,
      account_id: tradeType === "live" ? s.account_id || null : null,
      backtest_session_id: tradeType === "backtest" ? session?.id ?? initial?.backtest_session_id : null,
      strategy_version_id: s.strategy_version_id || null,
      tags: String(s.tags).split(",").map((x) => x.trim()).filter(Boolean),
      row_version: initial?.row_version,
      chart_config: initial?.chart_config ?? null,
    };
    for (const k of NUMS) body[k] = n(s[k]);
    for (const k of ["commission", "swap", "other_fees"]) body[k] = body[k] ?? 0;
    for (const k of TEXTS) body[k] = String(s[k] ?? "").trim();
    if (!body.code) body.code = null;
    if (s.status === "open" && !s.is_draft) { body.exit_time = null; body.exit_price = null; }
    try {
      const t = initial
        ? await api<Trade>(`/trades/${initial.id}`, { method: "PUT", body })
        : await api<Trade>("/trades", { method: "POST", body, headers: { "Idempotency-Key": idem.current } });
      setDirty(false);
      onSaved(t);
      if (!initial) { idem.current = newIdempotencyKey(); }
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const closed = s.status === "closed";
  const list = (id: string, items?: string[]) => <datalist id={id}>{(items || []).map((x) => <option key={x} value={x} />)}</datalist>;

  return (
    <form onSubmit={submit} className="form">
      <fieldset>
        <legend>Thông tin chung</legend>
        <div className="grid">
          <Field label="Mã giao dịch" hint="Để trống để tự sinh"><input {...inp("code")} maxLength={64} /></Field>
          {tradeType === "live" ? (
            <Field label="Tài khoản *">
              <select {...inp("account_id")} required={!s.is_draft}>
                <option value="">— Chọn —</option>
                {accounts.filter((a) => !a.is_archived || a.id === s.account_id).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Phiên backtest"><input value={session?.name ?? ""} disabled /></Field>
          )}
          <Field label="Thị trường *"><input {...inp("market")} required list="dl-markets" placeholder="XAUUSD" /></Field>
          <div className="field" role="group" aria-label="Buy/Sell">
            <span className="label">Buy/Sell *</span>
            <div className="seg">
              {(["buy", "sell"] as const).map((d) => (
                <button type="button" key={d} aria-pressed={s.direction === d} className={s.direction === d ? `on ${d}` : ""} onClick={() => set("direction", d)}>{LABEL.direction[d]}</button>
              ))}
            </div>
          </div>
          <Field label="Trạng thái *">
            <select {...inp("status")}>
              <option value="open">Open — đang mở</option><option value="closed">Closed — đã đóng</option><option value="cancelled">Cancelled — đã hủy</option>
            </select>
          </Field>
          <Field label={`Vào lệnh * (${tz})`}><input type="datetime-local" {...inp("entry_time")} required /></Field>
          <Field label={`Thoát lệnh${closed ? " *" : ""} (${tz})`}><input type="datetime-local" {...inp("exit_time")} required={closed && !s.is_draft} disabled={s.status === "open" && !s.is_draft} /></Field>
          <Field label="Khung thời gian"><input {...inp("timeframe")} list="dl-tf" placeholder="H1, H4…" /></Field>
          <Field label="Phiên giao dịch"><input {...inp("trading_session")} list="dl-sess" placeholder="Á, Âu, Mỹ…" /></Field>
          {tradeType === "live" && (
            <Field label="Chiến lược / phiên bản">
              <select {...inp("strategy_version_id")}>
                <option value="">— Không gắn —</option>
                {strategies.map((st) => (
                  <optgroup key={st.id} label={st.name}>
                    {st.versions.map((v) => <option key={v.id} value={v.id}>{v.label}{v.status === "draft" ? " (nháp)" : ""}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Thông tin lệnh</legend>
        <div className="grid">
          <Field label="Giá vào *"><input inputMode="decimal" {...inp("entry_price")} required /></Field>
          <Field label="Stop Loss ban đầu"><input inputMode="decimal" {...inp("stop_loss")} /></Field>
          <Field label="Take Profit dự kiến"><input inputMode="decimal" {...inp("take_profit")} /></Field>
          <Field label={tradeType === "live" ? `Giá thoát thực tế${closed ? " *" : ""}` : "Giá thoát giả định"}><input inputMode="decimal" {...inp("exit_price")} disabled={s.status === "open" && !s.is_draft} /></Field>
          <Field label="Khối lượng (lot)"><input inputMode="decimal" {...inp("volume")} /></Field>
          <Field label="Rủi ro dự kiến (tiền)" hint="Cần để tính R = Kết quả ròng / Rủi ro"><input inputMode="decimal" {...inp("risk_amount")} /></Field>
          <Field label={`Kết quả trước chi phí${tradeType === "live" && closed ? " *" : ""}`}><input inputMode="decimal" {...inp("gross_pnl")} /></Field>
          <Field label="Commission" hint="Chi phí, nhập số dương"><input inputMode="decimal" {...inp("commission")} /></Field>
          <Field label="Swap" hint="Dương = được cộng, âm = bị trừ"><input inputMode="decimal" {...inp("swap")} /></Field>
          <Field label="Chi phí khác" hint="Nhập số dương"><input inputMode="decimal" {...inp("other_fees")} /></Field>
          <Field label="Kết quả R (nhập tay)" hint="Chỉ dùng khi không tính được từ tiền"><input inputMode="decimal" {...inp("r_manual")} /></Field>
        </div>
        <div className="calc">
          <span>Kết quả ròng: <b className={preview.net === null ? "" : preview.net >= 0 ? "pos" : "neg"}>{signedMoney(preview.net)}</b></span>
          <span>Kết quả R: <b>{fmtR(preview.rv)}</b> <span className="muted small">({LABEL.rSource[preview.src]})</span></span>
          <span className="muted small">Ước tính trên trình duyệt — backend tính và lưu giá trị chính thức.</span>
        </div>
      </fieldset>

      {!compact && (
        <fieldset>
          <legend>Phân tích</legend>
          <div className="grid">
            <Field label="Xu hướng thị trường"><input {...inp("trend")} list="dl-trend" /></Field>
            <Field label="Setup"><input {...inp("setup")} list="dl-setup" /></Field>
            <Field label="Điều kiện thị trường"><input {...inp("market_condition")} list="dl-cond" placeholder="Trend, Range, Tin tức…" /></Field>
            <Field label="Tuân thủ kế hoạch">
              <select {...inp("plan_compliance")}>
                <option value="">—</option><option value="followed">Tuân thủ</option><option value="partial">Một phần</option><option value="violated">Vi phạm</option>
              </select>
            </Field>
            <Field label="Cảm xúc"><input {...inp("emotion")} list="dl-emo" /></Field>
            <Field label="Nhãn" hint="Phân cách bằng dấu phẩy"><input {...inp("tags")} /></Field>
            <Field label="Vùng giá quan trọng" wide><textarea rows={2} {...inp("key_levels")} /></Field>
            <Field label="Điều kiện xác nhận" wide><textarea rows={2} {...inp("confirmation")} /></Field>
            <Field label="Lý do vào lệnh" wide><textarea rows={2} {...inp("entry_reason")} /></Field>
            <Field label="Lý do thoát lệnh" wide><textarea rows={2} {...inp("exit_reason")} /></Field>
            <Field label="Lỗi giao dịch" wide><textarea rows={2} {...inp("mistakes")} /></Field>
            <Field label="Bài học rút ra" wide><textarea rows={2} {...inp("lessons")} /></Field>
            <Field label="Ghi chú" wide><textarea rows={2} {...inp("notes")} /></Field>
            <Field label="Liên kết biểu đồ (TradingView…)" wide><input type="url" {...inp("chart_link")} placeholder="https://" /></Field>
          </div>
        </fieldset>
      )}
      {compact && (
        <div className="grid">
          <Field label="Setup"><input {...inp("setup")} list="dl-setup" /></Field>
          <Field label="Điều kiện thị trường"><input {...inp("market_condition")} list="dl-cond" /></Field>
          <Field label="Tuân thủ chiến lược">
            <select {...inp("plan_compliance")}>
              <option value="">—</option><option value="followed">Tuân thủ</option><option value="partial">Một phần</option><option value="violated">Vi phạm</option>
            </select>
          </Field>
          <Field label="Ghi chú" wide><textarea rows={2} {...inp("notes")} /></Field>
        </div>
      )}

      {list("dl-markets", options?.markets)}{list("dl-tf", options?.timeframes)}{list("dl-sess", options?.trading_sessions)}
      {list("dl-setup", options?.setups)}{list("dl-cond", options?.market_conditions)}{list("dl-emo", options?.emotions)}
      {list("dl-trend", ["Tăng", "Giảm", "Đi ngang"])}

      <label className="check"><input type="checkbox" checked={Boolean(s.is_draft)} onChange={(e) => set("is_draft", e.target.checked)} /> Lưu nháp (ghi nhận dở dang, chưa tính vào thống kê)</label>
      {dirty && <Notice kind="warn">Có thay đổi chưa lưu.</Notice>}
      <ErrorBox error={error} />
      <div className="actions">
        <button className="btn primary" disabled={saving}>{saving ? "Đang lưu…" : initial ? "Lưu thay đổi" : "Lưu giao dịch"}</button>
      </div>
    </form>
  );
}
