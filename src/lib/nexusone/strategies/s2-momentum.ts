// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy S2: Momentum Breakout
//
// Hypothesis: When BTC breaks out of a consolidation range with
// above-average volume, the move tends to continue for a short
// period. This is a well-documented microstructure effect.
//
// Logic:
//   1. Detect consolidation: ATR drops below its 48-bar SMA
//   2. Detect breakout: price moves > 1.5x current ATR from
//      the consolidation midpoint
//   3. Confirm with volume: current volume > 1.5x 48-bar avg
//   4. Enter in breakout direction
//   5. Hold for 12 bars (1 hour on 5m)
//
// Parameters are FROZEN. Any change creates a new version.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar, SignalEvent } from '../types';
import { nanoid } from 'nanoid';

// ─── Manifest ────────────────────────────────────────────────

export const strategyS2: StrategyManifest = {
  id: 'S2_MOMENTUM_BREAKOUT_V1',
  version: 1,
  symbol: 'BTC-USD',
  venue: 'alpaca',
  timeframe: '5m',
  direction: 'long',  // will be overridden by signal direction
  inputs: ['close', 'high', 'low', 'volume'],
  features: {
    atr_period: 14,
    consolidation_lookback: 48,
    volume_lookback: 48,
  },
  trigger: {
    atr_ratio_lt: 0.8,       // ATR must be < 80% of its SMA (consolidation)
    breakout_atr_mult: 1.5,   // price must move > 1.5x ATR from range mid
    volume_mult: 1.5,         // volume must be > 1.5x average
  },
  execution: {
    mode: 'market',
    max_entry_wait_bars: 1,
    hold_bars: 12,            // 1 hour on 5m
  },
  risk: {
    risk_per_trade_bps: null,
    max_open_positions: 1,
    cooldown_bars: 12,
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
  notes: 'Momentum breakout from consolidation with volume confirmation. Bidirectional.',
};

// ─── Feature Calculation ─────────────────────────────────────

export interface S2Features {
  atr: number;
  atr_sma: number;
  atr_ratio: number;
  range_mid: number;
  range_height: number;
  current_volume: number;
  avg_volume: number;
  volume_ratio: number;
  price: number;
  breakout_direction: 'long' | 'short' | null;
}

function calcATR(bars: MarketBar[], period: number): number[] {
  const atrs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { atrs.push(bars[i].high - bars[i].low); continue; }
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    if (i < period) { atrs.push(tr); continue; }
    const prev = atrs[i - 1];
    atrs.push((prev * (period - 1) + tr) / period);
  }
  return atrs;
}

export function calcS2Features(bars: MarketBar[]): S2Features | null {
  const { atr_period, consolidation_lookback, volume_lookback } = strategyS2.features;
  const minBars = Math.max(consolidation_lookback, volume_lookback) + atr_period;
  if (bars.length < minBars) return null;

  const atrs = calcATR(bars, atr_period);
  const currentATR = atrs[atrs.length - 1];

  // ATR SMA over lookback
  const atrSlice = atrs.slice(-consolidation_lookback);
  const atrSMA = atrSlice.reduce((s, v) => s + v, 0) / atrSlice.length;
  const atrRatio = atrSMA > 0 ? currentATR / atrSMA : 1;

  // Range midpoint (last consolidation_lookback bars)
  const recentBars = bars.slice(-consolidation_lookback);
  const highs = recentBars.map(b => b.high);
  const lows = recentBars.map(b => b.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeHeight = rangeHigh - rangeLow;

  // Volume
  const volumeSlice = bars.slice(-volume_lookback).map(b => b.volume);
  const avgVolume = volumeSlice.reduce((s, v) => s + v, 0) / volumeSlice.length;
  const currentVolume = bars[bars.length - 1].volume;
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

  // Breakout direction
  const price = bars[bars.length - 1].close;
  const displacement = price - rangeMid;
  let breakoutDirection: 'long' | 'short' | null = null;
  if (Math.abs(displacement) > strategyS2.trigger.breakout_atr_mult * currentATR) {
    breakoutDirection = displacement > 0 ? 'long' : 'short';
  }

  return {
    atr: currentATR,
    atr_sma: atrSMA,
    atr_ratio: atrRatio,
    range_mid: rangeMid,
    range_height: rangeHeight,
    current_volume: currentVolume,
    avg_volume: avgVolume,
    volume_ratio: volumeRatio,
    price,
    breakout_direction: breakoutDirection,
  };
}

// ─── Trigger Evaluation ──────────────────────────────────────

export function evaluateS2Trigger(features: S2Features): SignalEvent | null {
  const { atr_ratio_lt, volume_mult } = strategyS2.trigger;

  // Must have been in consolidation recently (ATR compressed)
  // AND current bar shows breakout with volume
  const wasConsolidating = features.atr_ratio < atr_ratio_lt;
  const hasVolume = features.volume_ratio > volume_mult;
  const hasBreakout = features.breakout_direction !== null;

  if (!wasConsolidating || !hasVolume || !hasBreakout) return null;

  return {
    id: nanoid(),
    strategy_id: strategyS2.id,
    symbol: strategyS2.symbol,
    ts_signal: Date.now(),
    direction: features.breakout_direction!,
    feature_snapshot: {
      atr: features.atr,
      atr_ratio: features.atr_ratio,
      volume_ratio: features.volume_ratio,
      price: features.price,
    },
    trigger_snapshot: { atr_ratio_lt, volume_mult },
    expected_hold_bars: strategyS2.execution.hold_bars,
    status: 'pending',
    created_at: Date.now(),
  };
}
