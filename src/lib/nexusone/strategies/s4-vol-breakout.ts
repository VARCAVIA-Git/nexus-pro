// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy S4: Volatility Compression Breakout
//
// Hypothesis: When ATR compresses to a multi-hour low, the
// subsequent expansion tends to produce a directional move.
// With a 4-hour hold, the cost-to-edge ratio becomes favorable
// (13 bps on a move that should be 50-200+ bps).
//
// Logic:
//   1. ATR(14) drops below 60% of ATR_SMA(96) → compression
//   2. Price breaks above/below the compression range
//   3. Enter in breakout direction
//   4. Hold for 48 bars (4 hours on 5m)
//   5. No volume filter (compression kills volume naturally)
//
// Key advantage over S2/S3: much longer hold dilutes costs.
// 13 bps on a 4-hour hold is ~3.25 bps/hour vs 26 bps/hour on S2.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar, SignalEvent } from '../types';
import { nanoid } from 'nanoid';

export const strategyS4: StrategyManifest = {
  id: 'S4_VOL_COMPRESSION_BREAKOUT_V1',
  version: 1,
  symbol: 'BTC-USD',
  venue: 'alpaca',
  timeframe: '5m',
  direction: 'long',  // overridden by signal
  inputs: ['close', 'high', 'low'],
  features: {
    atr_period: 14,
    atr_sma_period: 96,         // 8 hours of 5m bars
    range_lookback: 24,          // 2 hours for compression range
  },
  trigger: {
    compression_ratio: 0.6,      // ATR < 60% of its SMA
    breakout_mult: 1.0,          // price must break range by 1x current ATR
  },
  execution: {
    mode: 'market',
    max_entry_wait_bars: 1,
    hold_bars: 48,               // 4 hours on 5m
  },
  risk: {
    risk_per_trade_bps: null,
    max_open_positions: 1,
    cooldown_bars: 24,           // 2 hour cooldown
  },
  status: 'research',
  notes: 'Vol compression breakout with 4h hold. Designed to overcome the cost problem that killed S2/S3.',
};

export interface S4Features {
  atr: number;
  atr_sma: number;
  compression_ratio: number;
  is_compressed: boolean;
  range_high: number;
  range_low: number;
  range_mid: number;
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
    atrs.push((atrs[i - 1] * (period - 1) + tr) / period);
  }
  return atrs;
}

export function calcS4Features(bars: MarketBar[]): S4Features | null {
  const { atr_period, atr_sma_period, range_lookback } = strategyS4.features;
  const minBars = atr_sma_period + atr_period;
  if (bars.length < minBars) return null;

  const atrs = calcATR(bars, atr_period);
  const currentATR = atrs[atrs.length - 1];

  // ATR SMA
  const atrSlice = atrs.slice(-atr_sma_period);
  const atrSMA = atrSlice.reduce((s, v) => s + v, 0) / atrSlice.length;
  const compressionRatio = atrSMA > 0 ? currentATR / atrSMA : 1;

  const isCompressed = compressionRatio < strategyS4.trigger.compression_ratio;

  // Compression range (recent N bars high/low)
  const rangeBars = bars.slice(-range_lookback);
  const rangeHigh = Math.max(...rangeBars.map(b => b.high));
  const rangeLow = Math.min(...rangeBars.map(b => b.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;

  const price = bars[bars.length - 1].close;

  // Breakout: price must be outside range by breakout_mult * ATR
  let breakoutDirection: 'long' | 'short' | null = null;
  const threshold = strategyS4.trigger.breakout_mult * currentATR;
  if (price > rangeHigh + threshold) breakoutDirection = 'long';
  if (price < rangeLow - threshold) breakoutDirection = 'short';

  return {
    atr: currentATR,
    atr_sma: atrSMA,
    compression_ratio: compressionRatio,
    is_compressed: isCompressed,
    range_high: rangeHigh,
    range_low: rangeLow,
    range_mid: rangeMid,
    price,
    breakout_direction: breakoutDirection,
  };
}

export function evaluateS4Trigger(features: S4Features): SignalEvent | null {
  // Must have BEEN compressed (low vol) AND now breaking out
  if (!features.is_compressed) return null;
  if (!features.breakout_direction) return null;

  return {
    id: nanoid(),
    strategy_id: strategyS4.id,
    symbol: strategyS4.symbol,
    ts_signal: Date.now(),
    direction: features.breakout_direction,
    feature_snapshot: {
      atr: features.atr,
      compression_ratio: features.compression_ratio,
      range_high: features.range_high,
      range_low: features.range_low,
      price: features.price,
    },
    trigger_snapshot: {
      compression_ratio: strategyS4.trigger.compression_ratio,
      breakout_mult: strategyS4.trigger.breakout_mult,
    },
    expected_hold_bars: strategyS4.execution.hold_bars,
    status: 'pending',
    created_at: Date.now(),
  };
}
