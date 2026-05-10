// NexusOne v3 — frozen primitives.
//
// Each primitive emits a signal with explicit SL (×ATR), TP (×ATR), time-stop.
// Primitives DO NOT change at runtime — adaptation happens at the tuple gate.
//
// The activeRegimes list tells the orchestrator which regimes the primitive
// is allowed to fire in (regime-conditional gating).

import type { BarV3, IndicatorsV3, PrimitiveDef, SignalV3 } from '../types';

const P_DONCH_24 = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 25 || i + 1 >= b.length) return null;
  let h = -Infinity, l = Infinity;
  for (let j = i - 24; j < i; j++) {
    if (b[j].high > h) h = b[j].high;
    if (b[j].low < l) l = b[j].low;
  }
  const a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px > h) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 3.0, timeStopBars: 48 };
  if (px < l) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 3.0, timeStopBars: 48 };
  return null;
};

const P_DONCH_48 = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 49 || i + 1 >= b.length) return null;
  let h = -Infinity, l = Infinity;
  for (let j = i - 48; j < i; j++) {
    if (b[j].high > h) h = b[j].high;
    if (b[j].low < l) l = b[j].low;
  }
  const a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px > h) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 3.5, timeStopBars: 72 };
  if (px < l) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 3.5, timeStopBars: 72 };
  return null;
};

const P_BB_REVERSION = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 25 || i + 1 >= b.length) return null;
  const m = ind.sma20[i], sd = ind.std20[i], r = ind.rsi14[i], a = ind.atr14[i];
  if (!isFinite(m) || !isFinite(sd) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (px <= m - 2.5 * sd && r < 30) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.0, timeStopBars: 24 };
  if (px >= m + 2.5 * sd && r > 70) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.0, timeStopBars: 24 };
  return null;
};

const P_RSI_CROSS = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 16 || i + 1 >= b.length) return null;
  const cur = ind.rsi14[i], prev = ind.rsi14[i - 1], a = ind.atr14[i];
  if (!isFinite(a) || a <= 0) return null;
  const entryPrice = b[i + 1].open;
  if (cur < 30 && prev >= 30) return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 24 };
  if (cur > 70 && prev <= 70) return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 24 };
  return null;
};

const P_EMA_PULLBACK = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 100 || i + 1 >= b.length) return null;
  const e20 = ind.ema20[i], e50 = ind.ema50[i], a = ind.atr14[i];
  if (!isFinite(e20) || !isFinite(e50) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  const entryPrice = b[i + 1].open;
  if (e20 > e50 && px <= e20 * 1.003 && px >= e20 * 0.998 && b[i - 1].close > b[i - 2].close) {
    return { dir: 'long', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 36 };
  }
  if (e20 < e50 && px >= e20 * 0.997 && px <= e20 * 1.002 && b[i - 1].close < b[i - 2].close) {
    return { dir: 'short', entryPrice, stopAtr: 1.5, tpAtr: 2.5, timeStopBars: 36 };
  }
  return null;
};

const P_RANGE_FADE = (b: BarV3[], ind: IndicatorsV3, i: number): SignalV3 | null => {
  if (i < 60 || i + 1 >= b.length) return null;
  const m = ind.sma50[i], sd = ind.std50[i], a = ind.atr14[i];
  if (!isFinite(m) || !isFinite(sd) || !isFinite(a) || a <= 0) return null;
  const px = b[i].close;
  if (a / px > 0.012) return null;
  const entryPrice = b[i + 1].open;
  if (px <= m - 2 * sd) return { dir: 'long', entryPrice, stopAtr: 1.0, tpAtr: 1.8, timeStopBars: 16 };
  if (px >= m + 2 * sd) return { dir: 'short', entryPrice, stopAtr: 1.0, tpAtr: 1.8, timeStopBars: 16 };
  return null;
};

export const PRIMITIVES_V3: PrimitiveDef[] = [
  { id: 'DONCH_24', fn: P_DONCH_24, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN', 'VOLATILE'] },
  { id: 'DONCH_48', fn: P_DONCH_48, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN'] },
  { id: 'BB_REV', fn: P_BB_REVERSION, activeRegimes: ['RANGING'] },
  { id: 'RSI_CROSS', fn: P_RSI_CROSS, activeRegimes: ['RANGING'] },
  { id: 'EMA_PB', fn: P_EMA_PULLBACK, activeRegimes: ['TRENDING_UP', 'TRENDING_DOWN'] },
  { id: 'RANGE_FADE', fn: P_RANGE_FADE, activeRegimes: ['RANGING'] },
];
