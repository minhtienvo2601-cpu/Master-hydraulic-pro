export type TradeType = "live" | "backtest";

export interface User { id: string; email: string; display_name: string; timezone: string; created_at: string }
export interface Account { id: string; name: string; broker: string; currency: string; initial_balance: number | null; is_archived: boolean }
export interface Version {
  id: string; strategy_id: string; parent_version_id: string | null; version_no: number; label: string;
  entry_rules: string; exit_rules: string; risk_rules: string; notes: string; status: "draft" | "confirmed";
  confirmed_at: string | null; created_at: string;
}
export interface Strategy { id: string; name: string; description: string; versions: Version[] }
export interface Progress { recorded: number; target: number; completion_pct: number; incomplete: number; last_tested_at: string | null }
export interface BtSession {
  id: string; name: string; strategy_version_id: string; market: string; timeframe: string;
  data_start: string | null; data_end: string | null; data_timezone: string; entry_rules: string; exit_rules: string;
  risk_rules: string; target_trades: number; initial_capital: number | null; equity_method: "cash" | "r_fixed" | "r_compound";
  risk_per_trade_pct: number | null; summary_notes: string; is_completed: boolean; created_at: string; updated_at: string;
  progress?: Progress; strategy_label?: string | null;
}
export interface Tag { id: string; name: string; color: string }
export interface Trade {
  id: string; trade_type: TradeType; code: string; account_id: string | null; backtest_session_id: string | null;
  strategy_version_id: string | null; market: string; direction: "buy" | "sell"; status: "open" | "closed" | "cancelled";
  entry_time: string; exit_time: string | null; timeframe: string; trading_session: string;
  entry_price: number; stop_loss: number | null; take_profit: number | null; exit_price: number | null; volume: number | null;
  risk_amount: number | null; gross_pnl: number | null; commission: number; swap: number; other_fees: number;
  net_pnl: number | null; r_multiple: number | null; r_source: string; r_manual: number | null; outcome: string | null;
  trend: string; key_levels: string; setup: string; confirmation: string; market_condition: string; entry_reason: string;
  exit_reason: string; plan_compliance: string; mistakes: string; emotion: string; lessons: string; notes: string;
  chart_link: string; chart_config: Record<string, unknown> | null; is_draft: boolean; row_version: number; tags: Tag[];
  created_at: string; updated_at: string; image_count: number;
}
export interface TradePage { items: Trade[]; total: number; page: number; page_size: number }
export interface Image { id: string; trade_id: string | null; backtest_session_id: string | null; kind: "before" | "after" | "other"; caption: string; content_type: string; size_bytes: number; original_filename: string; sort_order: number; created_at: string }
export interface EquityPoint { time: string | null; trade_id: string | null; equity: number; drawdown: number; drawdown_pct: number | null }
export interface Stats {
  total_closed: number; wins: number; losses: number; breakevens: number;
  excluded: { open: number; cancelled: number; draft: number; incomplete: number };
  win_rate: number | null; money_sample: number; net_profit: number; gross_profit: number; gross_loss: number;
  profit_factor: number | null; average_win: number | null; average_loss: number | null; expectancy_money: number | null;
  r_sample: number; total_r: number; expectancy_r: number | null; max_win_streak: number; max_loss_streak: number;
  equity_method: string; initial_capital: number | null; max_drawdown: number; max_drawdown_pct: number | null;
  max_drawdown_r: number; currencies: string[]; warnings: string[]; equity_curve: EquityPoint[];
}
export interface PeriodRow { period: string; net_pnl: number; total_r: number; trades: number }
export interface Dashboard { trade_type: TradeType; timezone: string; stats: Stats; by_period: PeriodRow[]; period: string; conventions: Record<string, string> }
export interface Options { markets: string[]; timeframes: string[]; setups: string[]; trading_sessions: string[]; market_conditions: string[]; emotions: string[]; tags: string[] }
export interface ImportJob { id: string; filename: string; status: string; total_rows: number; valid_rows: number; duplicate_rows: number; error_rows: number; imported_rows: number; errors: { line: number; errors: string[]; duplicate?: boolean }[]; created_at: string; committed_at: string | null }
export interface PriceSeries { id: string; symbol: string; timeframe: string; source: string; bar_count: number; first_ts: string | null; last_ts: string | null }
