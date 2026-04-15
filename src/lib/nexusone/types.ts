// ═══════════════════════════════════════════════════════════════
// NexusOne — Core Types
//
// Source of truth for all NexusOne data structures.
// Every type here maps 1:1 to a concept in the manual.
// ═══════════════════════════════════════════════════════════════

// ─── Strategy ────────────────────────────────────────────────

export interface StrategyManifest {
  id: string;                          // e.g. 'S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1'
  version: number;
  symbol: string;                      // e.g. 'BTC-USD'
  venue: string;                       // e.g. 'okx', 'alpaca'
  timeframe: string;                   // e.g. '5m'
  direction: 'long' | 'short';
  inputs: string[];                    // required data feeds
  features: Record<string, number>;    // feature parameters (frozen)
  trigger: Record<string, number>;     // trigger thresholds (frozen)
  execution: {
    mode: 'maker_first' | 'market';
    max_entry_wait_bars: number;
    hold_bars: number;
  };
  risk: {
    risk_per_trade_bps: number | null;
    max_open_positions: number;
    cooldown_bars: number;
  };
  status: 'draft' | 'paper' | 'live' | 'disabled';
  research_metrics?: ResearchMetrics;
  notes?: string;
}

export interface ResearchMetrics {
  oos_net_bps: number;
  oos_win_rate: number;
  oos_trades: number;
  oos_sharpe: number;
  walk_forward_stable: boolean;
  bootstrap_p_value: number;
  last_validated: string;              // ISO date
}

// ─── Signal Event ────────────────────────────────────────────

export interface SignalEvent {
  id: string;
  strategy_id: string;
  symbol: string;
  ts_signal: number;                   // epoch ms
  direction: 'long' | 'short';
  feature_snapshot: Record<string, number>;
  trigger_snapshot: Record<string, number>;
  expected_hold_bars: number;
  status: 'pending' | 'sent_to_execution' | 'filled' | 'expired' | 'cancelled';
  created_at: number;
}

// ─── Order Attempt ───────────────────────────────────────────

export interface OrderAttempt {
  id: string;
  signal_event_id: string;
  order_type: 'limit' | 'market';
  side: 'buy' | 'sell';
  intended_price: number;
  actual_price: number | null;
  quantity: number;
  fee_bps: number;
  slippage_bps: number;
  fill_status: 'pending' | 'filled' | 'partial' | 'expired' | 'rejected';
  broker_order_id: string | null;
  latency_ms: number;
  created_at: number;
}

// ─── Trade Result ────────────────────────────────────────────

export interface TradeResult {
  id: string;
  signal_event_id: string;
  strategy_id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_ts: number;
  exit_ts: number | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  gross_bps: number;
  net_bps: number;
  fees_bps: number;
  reason_exit: 'target' | 'stop' | 'time_exit' | 'kill_switch' | 'manual' | null;
  max_adverse_excursion_bps: number;
  max_favorable_excursion_bps: number;
  status: 'open' | 'closed';
  created_at: number;
}

// ─── Market Data ─────────────────────────────────────────────

export interface MarketBar {
  venue: string;
  symbol: string;
  timeframe: string;
  ts_open: number;
  ts_close: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundingSnapshot {
  venue: string;
  symbol: string;
  funding_ts: number;
  funding_rate: number;
  mark_price: number;
}

// ─── Evaluation ──────────────────────────────────────────────

export interface DriftReport {
  strategy_id: string;
  window_start: number;
  window_end: number;
  trades: number;
  gross_bps_mean: number;
  net_bps_mean: number;
  win_rate: number;
  fill_rate: number;
  slippage_mean_bps: number;
  signal_count: number;
  // Drift flags
  edge_positive: boolean;
  fill_rate_ok: boolean;
  slippage_ok: boolean;
  signal_frequency_ok: boolean;
  // Verdict
  go_no_go: 'GO' | 'NO_GO' | 'WARNING';
  reasons: string[];
  created_at: number;
}

// ─── Kill Switch ─────────────────────────────────────────────

export interface KillSwitchState {
  triggered: boolean;
  reason: string | null;
  triggered_at: number | null;
  // Thresholds
  max_daily_loss_r: number;
  max_weekly_loss_r: number;
  max_consecutive_losses: number;
  min_fill_rate: number;
  max_slippage_bps: number;
  rolling_window_trades: number;
}

// ─── System Mode ─────────────────────────────────────────────

export type SystemMode = 'disabled' | 'paper' | 'live';
