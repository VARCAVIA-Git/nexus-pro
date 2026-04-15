// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy S1
//
// S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1
//
// Thesis: When funding is high and the market shows local trending
// structure (positive autocorrelation), longs become crowded and
// overpay carry. This creates a tradeable short reversal.
//
// Parameters are FROZEN. Any change creates a new version.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar, FundingSnapshot, SignalEvent } from '../types';
import { nanoid } from 'nanoid';

// ─── Manifest (frozen) ──────────────────────────────────────

export const strategyS1: StrategyManifest = {
  id: 'S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1',
  version: 1,
  symbol: 'BTC-USD',
  venue: 'alpaca',           // paper trading via Alpaca initially
  timeframe: '5m',
  direction: 'short',
  inputs: ['close', 'funding_rate'],
  features: {
    funding_zscore_window: 30,    // bars for z-score calculation
    ac_lag_window: 48,            // bars for autocorrelation
  },
  trigger: {
    funding_zscore_gt: 2.0,       // funding z-score must be > 2.0
    ac1_gt: 0.15,                 // lag-1 autocorrelation must be > 0.15
  },
  execution: {
    mode: 'maker_first',
    max_entry_wait_bars: 2,       // cancel if not filled in 2 bars
    hold_bars: 6,                 // hold for 6 bars (30 min on 5m)
  },
  risk: {
    risk_per_trade_bps: null,     // fixed size for now
    max_open_positions: 1,
    cooldown_bars: 6,             // wait 6 bars between trades
  },
  status: 'paper',
  research_metrics: {
    oos_net_bps: 0,               // to be filled from research
    oos_win_rate: 0,
    oos_trades: 0,
    oos_sharpe: 0,
    walk_forward_stable: false,
    bootstrap_p_value: 1,
    last_validated: '',
  },
  notes: 'Initial strategy. Parameters frozen at V1. Requires OKX funding data or proxy.',
};

// ─── Feature Calculation ─────────────────────────────────────

/**
 * Calculate funding rate z-score.
 * z = (current - mean) / stddev over the window.
 */
export function calcFundingZScore(
  fundingRates: number[],
  window: number = strategyS1.features.funding_zscore_window,
): number {
  if (fundingRates.length < window) return 0;
  const slice = fundingRates.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
  const stddev = Math.sqrt(variance);
  if (stddev < 1e-12) return 0;  // guard against floating point noise
  const current = fundingRates[fundingRates.length - 1];
  return (current - mean) / stddev;
}

/**
 * Calculate lag-1 autocorrelation of close prices.
 * Measures if recent price moves tend to continue (trending).
 */
export function calcAutocorrelation(
  closes: number[],
  window: number = strategyS1.features.ac_lag_window,
): number {
  if (closes.length < window + 1) return 0;
  const slice = closes.slice(-(window + 1));

  // Calculate returns
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let num = 0;
  let den = 0;
  for (let i = 1; i < returns.length; i++) {
    num += (returns[i] - mean) * (returns[i - 1] - mean);
    den += (returns[i] - mean) ** 2;
  }

  return den === 0 ? 0 : num / den;
}

// ─── Trigger Evaluation ──────────────────────────────────────

export interface S1Features {
  funding_zscore: number;
  ac1: number;
  close: number;
  funding_rate: number;
}

/**
 * Calculate S1 features from raw data.
 */
export function calcS1Features(
  bars: MarketBar[],
  fundingRates: number[],
): S1Features | null {
  if (bars.length < strategyS1.features.ac_lag_window + 1) return null;
  if (fundingRates.length < strategyS1.features.funding_zscore_window) return null;

  const closes = bars.map(b => b.close);
  const lastBar = bars[bars.length - 1];

  return {
    funding_zscore: Math.round(calcFundingZScore(fundingRates) * 1000) / 1000,
    ac1: Math.round(calcAutocorrelation(closes) * 1000) / 1000,
    close: lastBar.close,
    funding_rate: fundingRates[fundingRates.length - 1],
  };
}

/**
 * Check if S1 trigger conditions are met.
 * Returns a SignalEvent if triggered, null otherwise.
 */
export function evaluateS1Trigger(features: S1Features): SignalEvent | null {
  const { funding_zscore_gt, ac1_gt } = strategyS1.trigger;

  const triggered =
    features.funding_zscore > funding_zscore_gt &&
    features.ac1 > ac1_gt;

  if (!triggered) return null;

  return {
    id: nanoid(12),
    strategy_id: strategyS1.id,
    symbol: strategyS1.symbol,
    ts_signal: Date.now(),
    direction: strategyS1.direction,
    feature_snapshot: {
      funding_zscore: features.funding_zscore,
      ac1: features.ac1,
      close: features.close,
      funding_rate: features.funding_rate,
    },
    trigger_snapshot: {
      funding_zscore_gt,
      ac1_gt,
    },
    expected_hold_bars: strategyS1.execution.hold_bars,
    status: 'pending',
    created_at: Date.now(),
  };
}

// Export for testing
export const _internals = {
  calcFundingZScore,
  calcAutocorrelation,
  calcS1Features,
  evaluateS1Trigger,
};
