// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy S5: RSI Bidirectional with Maker Execution
//
// Hypothesis: RSI extremes on 5m bars signal short-term
// mean reversion. Bidirectional (long on RSI<30, short on RSI>70).
//
// This is the strategy that showed gross profit (+2623 bps / 60d)
// but was killed by taker costs (13 bps RT). With maker execution
// (8 bps RT), the same signals yield +879 bps net.
//
// Parameters FROZEN at V1.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar, SignalEvent } from '../types';
import { nanoid } from 'nanoid';

export const strategyS5: StrategyManifest = {
  id: 'S5_RSI_BIDIR_MAKER_V1',
  version: 1,
  symbol: 'BTC-USD',
  venue: 'alpaca',
  timeframe: '5m',
  direction: 'long',  // overridden by signal direction
  inputs: ['close'],
  features: {
    rsi_period: 14,
  },
  trigger: {
    rsi_oversold: 30,     // long when RSI crosses below 30
    rsi_overbought: 70,   // short when RSI crosses above 70
  },
  execution: {
    mode: 'maker_first',   // limit orders to reduce costs
    max_entry_wait_bars: 2,
    hold_bars: 24,         // 2 hours on 5m
  },
  risk: {
    risk_per_trade_bps: null,
    max_open_positions: 1,
    cooldown_bars: 12,     // 1 hour cooldown
  },
  status: 'research',
  research_metrics: {
    oos_net_bps: 0,
    oos_win_rate: 0,
    oos_trades: 0,
    oos_sharpe: 0,
    walk_forward_stable: false,
    bootstrap_p_value: 1,
    last_validated: '',
  },
  notes: 'RSI bidir with maker execution. Gross edge confirmed (+2623 bps/60d). Requires 8bps RT to be net positive.',
};

// ─── Cost model for maker execution ─────────────────────────

export const MAKER_COSTS = {
  maker_fee_bps: 1.5,
  taker_fee_bps: 1.5,  // both legs maker
  slippage_bps: 1.0,   // much less with limit orders
  spread_bps: 1.0,     // limit orders sit at bid/ask
};
// Round trip: (1.5 + 1.0 + 0.5) * 2 = 6 bps (conservative 8 bps with buffer)

// ─── RSI Calculation ─────────────────────────────────────────

function calcRSI(closes: number[], period: number = 14): number[] {
  const out = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return out;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ─── Features ────────────────────────────────────────────────

export interface S5Features {
  rsi: number;
  rsi_prev: number;
  price: number;
  direction: 'long' | 'short' | null;
}

export function calcS5Features(bars: MarketBar[]): S5Features | null {
  if (bars.length < strategyS5.features.rsi_period + 2) return null;

  const closes = bars.map(b => b.close);
  const rsiVals = calcRSI(closes, strategyS5.features.rsi_period);
  const rsi = rsiVals[rsiVals.length - 1];
  const rsiPrev = rsiVals[rsiVals.length - 2];

  let direction: 'long' | 'short' | null = null;
  // Long: RSI crosses below oversold
  if (rsi < strategyS5.trigger.rsi_oversold && rsiPrev >= strategyS5.trigger.rsi_oversold) {
    direction = 'long';
  }
  // Short: RSI crosses above overbought
  if (rsi > strategyS5.trigger.rsi_overbought && rsiPrev <= strategyS5.trigger.rsi_overbought) {
    direction = 'short';
  }

  return {
    rsi,
    rsi_prev: rsiPrev,
    price: bars[bars.length - 1].close,
    direction,
  };
}

// ─── Trigger ─────────────────────────────────────────────────

export function evaluateS5Trigger(features: S5Features): SignalEvent | null {
  if (!features.direction) return null;

  return {
    id: nanoid(),
    strategy_id: strategyS5.id,
    symbol: strategyS5.symbol,
    ts_signal: Date.now(),
    direction: features.direction,
    feature_snapshot: {
      rsi: features.rsi,
      rsi_prev: features.rsi_prev,
      price: features.price,
    },
    trigger_snapshot: {
      rsi_oversold: strategyS5.trigger.rsi_oversold,
      rsi_overbought: strategyS5.trigger.rsi_overbought,
    },
    expected_hold_bars: strategyS5.execution.hold_bars,
    status: 'pending',
    created_at: Date.now(),
  };
}
