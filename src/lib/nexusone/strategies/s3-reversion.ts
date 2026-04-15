// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy S3: Mean Reversion on Overextension
//
// Hypothesis: When BTC deviates significantly from its short-term
// mean (2x ATR beyond 48-bar SMA), it tends to revert partially.
// This is especially strong when volume is declining (exhaustion).
//
// Logic:
//   1. Calculate 48-bar SMA of close
//   2. Calculate 14-bar ATR
//   3. If price > SMA + 2*ATR AND volume declining → short
//   4. If price < SMA - 2*ATR AND volume declining → long
//   5. Hold for 6 bars (30 min on 5m)
//
// Key insight: we trade AGAINST the move, so higher win rate
// but smaller avg win. Needs tight risk management.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar, SignalEvent } from '../types';
import { nanoid } from 'nanoid';

export const strategyS3: StrategyManifest = {
  id: 'S3_MEAN_REVERSION_OVEREXT_V1',
  version: 1,
  symbol: 'BTC-USD',
  venue: 'alpaca',
  timeframe: '5m',
  direction: 'long',  // overridden by signal
  inputs: ['close', 'high', 'low', 'volume'],
  features: {
    sma_period: 48,
    atr_period: 14,
    volume_decline_lookback: 6,
  },
  trigger: {
    deviation_atr_mult: 2.0,
    volume_decline_ratio: 0.7,  // current vol < 70% of 6-bar avg
  },
  execution: {
    mode: 'market',
    max_entry_wait_bars: 1,
    hold_bars: 6,
  },
  risk: {
    risk_per_trade_bps: null,
    max_open_positions: 1,
    cooldown_bars: 6,
  },
  status: 'research',
  notes: 'Mean reversion on 2-ATR overextension with volume exhaustion confirmation.',
};

export interface S3Features {
  sma: number;
  atr: number;
  price: number;
  deviation_atr: number;
  volume_ratio: number;
  direction: 'long' | 'short' | null;
}

export function calcS3Features(bars: MarketBar[]): S3Features | null {
  const { sma_period, atr_period, volume_decline_lookback } = strategyS3.features;
  if (bars.length < sma_period + atr_period) return null;

  // SMA
  const smaSlice = bars.slice(-sma_period);
  const sma = smaSlice.reduce((s, b) => s + b.close, 0) / sma_period;

  // ATR
  let atr = 0;
  for (let i = bars.length - atr_period; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      i > 0 ? Math.abs(bars[i].high - bars[i - 1].close) : 0,
      i > 0 ? Math.abs(bars[i].low - bars[i - 1].close) : 0,
    );
    atr += tr;
  }
  atr /= atr_period;

  // Price deviation from SMA in ATR units
  const price = bars[bars.length - 1].close;
  const deviationATR = atr > 0 ? (price - sma) / atr : 0;

  // Volume decline: current vs recent average
  const recentVol = bars.slice(-volume_decline_lookback);
  const avgVol = recentVol.reduce((s, b) => s + b.volume, 0) / volume_decline_lookback;
  const currentVol = bars[bars.length - 1].volume;
  const volumeRatio = avgVol > 0 ? currentVol / avgVol : 1;

  // Direction
  let direction: 'long' | 'short' | null = null;
  if (deviationATR > strategyS3.trigger.deviation_atr_mult) direction = 'short';
  if (deviationATR < -strategyS3.trigger.deviation_atr_mult) direction = 'long';

  return { sma, atr, price, deviation_atr: deviationATR, volume_ratio: volumeRatio, direction };
}

export function evaluateS3Trigger(features: S3Features): SignalEvent | null {
  if (!features.direction) return null;
  if (features.volume_ratio > strategyS3.trigger.volume_decline_ratio) return null;

  return {
    id: nanoid(),
    strategy_id: strategyS3.id,
    symbol: strategyS3.symbol,
    ts_signal: Date.now(),
    direction: features.direction,
    feature_snapshot: {
      deviation_atr: features.deviation_atr,
      volume_ratio: features.volume_ratio,
      sma: features.sma,
      price: features.price,
    },
    trigger_snapshot: {
      deviation_atr_mult: strategyS3.trigger.deviation_atr_mult,
      volume_decline_ratio: strategyS3.trigger.volume_decline_ratio,
    },
    expected_hold_bars: strategyS3.execution.hold_bars,
    status: 'pending',
    created_at: Date.now(),
  };
}
