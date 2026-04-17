// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — S2 Crypto Momentum Breakout (complementary)
//
// Long:  price breaks 24-bar high + volume>2x + ADX>25 + regime=TRENDING_UP
// Short: price breaks 24-bar low  + volume>2x + ADX>25 + regime=TRENDING_DOWN
// Exit:  TP = 2.5 × ATR, SL = 1.0 × ATR, time 8h
//
// Evaluates from the full 100-bar OHLCV series (not just Features)
// because we need the 24-bar lookback for the breakout level.
// ═══════════════════════════════════════════════════════════════

import type { Strategy, StrategySignal, EvalContext } from './strategy.interface';
import type { Features } from '../core/feature-engine';

const TIMEFRAME_MIN = 15;
const COOLDOWN_BARS = 8;
const BREAKOUT_LOOKBACK = 24;
const TIME_STOP_MIN = 8 * 60;

export const S2_MomentumBreak: Strategy = {
  id: 'S2_MOMENTUM_BREAK_V1',
  name: 'Crypto Momentum Breakout',
  timeframeMin: TIMEFRAME_MIN,
  activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN'],
  stats: {
    historicalWinRate: 0.42,
    avgWinLossRatio: 2.5,
    maxTradesPerDay: 3,
  },

  evaluate(asset: string, f: Features, ctx: EvalContext): StrategySignal | null {
    if (ctx.openPositionsForAsset !== 0) return null;
    if (!isCooledDown(ctx, TIMEFRAME_MIN, COOLDOWN_BARS)) return null;
    if (!Number.isFinite(f.atr_14) || f.atr_14 <= 0) return null;
    if (f.adx_14 < 25) return null;
    if (f.volume_ratio < 2.0) return null;
    if (!ctx.recentBars || ctx.recentBars.length < BREAKOUT_LOOKBACK + 1) return null;

    // Use the prior 24 bars (exclude the current bar) for the breakout level.
    const lookback = ctx.recentBars.slice(-BREAKOUT_LOOKBACK - 1, -1);
    const lookbackHigh = lookback.reduce((m, b) => Math.max(m, b.high), -Infinity);
    const lookbackLow = lookback.reduce((m, b) => Math.min(m, b.low), Infinity);

    const price = f.price;

    if (ctx.regime === 'TRENDING_UP' && price > lookbackHigh && price > f.ema_50) {
      return {
        strategyId: this.id,
        asset,
        direction: 'long',
        entryPrice: price,
        stopLoss: price - 1.0 * f.atr_14,
        takeProfit: price + 2.5 * f.atr_14,
        timeStopMin: TIME_STOP_MIN,
        cooldownBars: COOLDOWN_BARS,
        timeframeMin: TIMEFRAME_MIN,
        featuresSnapshot: { ...pickSnapshot(f), breakout_level: lookbackHigh },
      };
    }

    if (ctx.regime === 'TRENDING_DOWN' && price < lookbackLow && price < f.ema_50) {
      return {
        strategyId: this.id,
        asset,
        direction: 'short',
        entryPrice: price,
        stopLoss: price + 1.0 * f.atr_14,
        takeProfit: price - 2.5 * f.atr_14,
        timeStopMin: TIME_STOP_MIN,
        cooldownBars: COOLDOWN_BARS,
        timeframeMin: TIMEFRAME_MIN,
        featuresSnapshot: { ...pickSnapshot(f), breakout_level: lookbackLow },
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
    adx_14: f.adx_14,
    ema_20: f.ema_20,
    ema_50: f.ema_50,
    atr_14: f.atr_14,
    volume_ratio: f.volume_ratio,
    price: f.price,
  };
}
