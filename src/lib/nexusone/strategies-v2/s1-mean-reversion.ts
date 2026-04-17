// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — S1 Crypto Mean Reversion (primary)
//
// Long:  price < BB_lower AND RSI<30 AND volume>1.5x AND regime=RANGING
// Short: mirrored (routed via simulated short on alpaca-paper)
// Exit:  TP = BB middle (SMA20), SL = 1.5 × ATR, time 4h
// ═══════════════════════════════════════════════════════════════

import type { Strategy, StrategySignal, EvalContext } from './strategy.interface';
import type { Features } from '../core/feature-engine';

const TIMEFRAME_MIN = 15;
const COOLDOWN_BARS = 6;
const TIME_STOP_MIN = 4 * 60;

export const S1_MeanReversion: Strategy = {
  id: 'S1_MEAN_REV_V1',
  name: 'Crypto Mean Reversion (Bollinger + RSI)',
  timeframeMin: TIMEFRAME_MIN,
  activeRegimes: ['RANGING'],
  stats: {
    historicalWinRate: 0.57,
    avgWinLossRatio: 1.4,
    maxTradesPerDay: 6,
  },

  evaluate(asset, f: Features, ctx: EvalContext): StrategySignal | null {
    if (ctx.openPositionsForAsset !== 0) return null;
    if (!isCooledDown(ctx, TIMEFRAME_MIN, COOLDOWN_BARS)) return null;
    if (!Number.isFinite(f.atr_14) || f.atr_14 <= 0) return null;

    const price = f.price;
    const volumeOk = f.volume_ratio >= 1.5;

    // LONG
    const longOk = ctx.regime === 'RANGING'
      && price <= f.bb_lower
      && f.rsi_14 <= 30
      && volumeOk;

    if (longOk) {
      return {
        strategyId: this.id,
        asset,
        direction: 'long',
        entryPrice: price,
        stopLoss: price - 1.5 * f.atr_14,
        takeProfit: f.bb_middle,
        timeStopMin: TIME_STOP_MIN,
        cooldownBars: COOLDOWN_BARS,
        timeframeMin: TIMEFRAME_MIN,
        featuresSnapshot: pickSnapshot(f),
      };
    }

    // SHORT
    const shortOk = ctx.regime === 'RANGING'
      && price >= f.bb_upper
      && f.rsi_14 >= 70
      && volumeOk;

    if (shortOk) {
      return {
        strategyId: this.id,
        asset,
        direction: 'short',
        entryPrice: price,
        stopLoss: price + 1.5 * f.atr_14,
        takeProfit: f.bb_middle,
        timeStopMin: TIME_STOP_MIN,
        cooldownBars: COOLDOWN_BARS,
        timeframeMin: TIMEFRAME_MIN,
        featuresSnapshot: pickSnapshot(f),
      };
    }

    return null;
  },
};

function isCooledDown(ctx: EvalContext, timeframeMin: number, bars: number): boolean {
  if (!ctx.lastSignalTs) return true;
  return ctx.now - ctx.lastSignalTs >= bars * timeframeMin * 60_000;
}

function pickSnapshot(f: Features): Record<string, number> {
  return {
    rsi_14: f.rsi_14,
    bb_upper: f.bb_upper,
    bb_middle: f.bb_middle,
    bb_lower: f.bb_lower,
    bb_percent_b: f.bb_percent_b,
    volume_ratio: f.volume_ratio,
    atr_14: f.atr_14,
    price: f.price,
  };
}
