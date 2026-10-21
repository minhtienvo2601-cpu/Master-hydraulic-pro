"use client";
import { useEffect, useState } from "react";
import { api, qs } from "./api";
import type { Account, BtSession, Options, Strategy, TradeType } from "./types";

export type Filters = Record<string, string>;

type Props = {
  value: Filters;
  onChange: (f: Filters) => void;
  tradeType: TradeType;
  /** Ẩn các bộ lọc không phù hợp ngữ cảnh (vd trong trang phiên backtest). */
  hide?: string[];
  extended?: boolean;
};

export function useRefs(tradeType?: TradeType) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [sessions, setSessions] = useState<BtSession[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    api<Account[]>("/accounts").then(setAccounts).catch(() => {});
    api<Strategy[]>("/strategies").then(setStrategies).catch(() => {});
    api<BtSession[]>("/backtest-sessions").then(setSessions).catch(() => {});
    api<Options>(`/trades/meta/options${qs({ trade_type: tradeType })}`).then(setOptions).catch(() => {});
  }, [tradeType]);
  return { accounts, strategies, sessions, options };
}

export default function FilterBar({ value, onChange, tradeType, hide = [], extended = false }: Props) {
  const { accounts, strategies, sessions, options } = useRefs(tradeType);
  const [open, setOpen] = useState(false);
  const set = (k: string, v: string) => {
    const next = { ...value, [k]: v };
    if (k === "strategy_id") next.strategy_version_id = "";
    onChange(next);
  };
  const show = (k: string) => !hide.includes(k);
  const versions = strategies.find((s) => s.id === value.strategy_id)?.versions ?? strategies.flatMap((s) => s.versions);
  const active = Object.entries(value).filter(([k, v]) => v && !hide.includes(k)).length;

  return (
    <div className="filters">
      <div className="filters-row">
        {show("date_from") && <label className="mini">Từ ngày<input type="date" value={value.date_from || ""} onChange={(e) => set("date_from", e.target.value)} /></label>}
        {show("date_to") && <label className="mini">Đến ngày<input type="date" value={value.date_to || ""} onChange={(e) => set("date_to", e.target.value)} /></label>}
        <button className="btn sm ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Ẩn bộ lọc" : "Thêm bộ lọc"}{active ? ` (${active})` : ""}
        </button>
        {active > 0 && <button className="btn sm ghost" onClick={() => onChange(Object.fromEntries(Object.keys(value).filter((k) => hide.includes(k)).map((k) => [k, value[k]])))}>Xóa lọc</button>}
      </div>
      {open && (
        <div className="filters-grid">
          {tradeType === "live" && show("account_id") && (
            <label className="mini">Tài khoản
              <select value={value.account_id || ""} onChange={(e) => set("account_id", e.target.value)}>
                <option value="">Tất cả</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </label>
          )}
          {tradeType === "backtest" && show("backtest_session_id") && (
            <label className="mini">Phiên backtest
              <select value={value.backtest_session_id || ""} onChange={(e) => set("backtest_session_id", e.target.value)}>
                <option value="">Tất cả</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {show("market") && <Sel label="Thị trường" k="market" opts={options?.markets} value={value} set={set} />}
          {show("strategy_id") && (
            <label className="mini">Chiến lược
              <select value={value.strategy_id || ""} onChange={(e) => set("strategy_id", e.target.value)}>
                <option value="">Tất cả</option>
                {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {show("strategy_version_id") && (
            <label className="mini">Phiên bản
              <select value={value.strategy_version_id || ""} onChange={(e) => set("strategy_version_id", e.target.value)}>
                <option value="">Tất cả</option>
                {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
          )}
          {show("timeframe") && <Sel label="Khung thời gian" k="timeframe" opts={options?.timeframes} value={value} set={set} />}
          {show("direction") && (
            <label className="mini">Buy/Sell
              <select value={value.direction || ""} onChange={(e) => set("direction", e.target.value)}>
                <option value="">Tất cả</option><option value="buy">Buy</option><option value="sell">Sell</option>
              </select>
            </label>
          )}
          {extended && (
            <>
              <Sel label="Setup" k="setup" opts={options?.setups} value={value} set={set} />
              <Sel label="Phiên giao dịch" k="trading_session" opts={options?.trading_sessions} value={value} set={set} />
              <Sel label="Điều kiện thị trường" k="market_condition" opts={options?.market_conditions} value={value} set={set} />
              <label className="mini">Tuân thủ
                <select value={value.plan_compliance || ""} onChange={(e) => set("plan_compliance", e.target.value)}>
                  <option value="">Tất cả</option><option value="followed">Tuân thủ</option><option value="partial">Một phần</option><option value="violated">Vi phạm</option>
                </select>
              </label>
              <label className="mini">Kết quả
                <select value={value.outcome || ""} onChange={(e) => set("outcome", e.target.value)}>
                  <option value="">Tất cả</option><option value="win">Thắng</option><option value="loss">Thua</option><option value="breakeven">Hòa</option>
                </select>
              </label>
              <label className="mini">R từ<input type="number" step="0.1" value={value.r_min || ""} onChange={(e) => set("r_min", e.target.value)} /></label>
              <label className="mini">R đến<input type="number" step="0.1" value={value.r_max || ""} onChange={(e) => set("r_max", e.target.value)} /></label>
              {options?.tags?.length ? <Sel label="Nhãn" k="tag" opts={options.tags} value={value} set={set} /> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Sel({ label, k, opts, value, set }: { label: string; k: string; opts?: string[]; value: Filters; set: (k: string, v: string) => void }) {
  return (
    <label className="mini">{label}
      <select value={value[k] || ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">Tất cả</option>
        {(opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
