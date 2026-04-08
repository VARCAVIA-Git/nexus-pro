// ═══════════════════════════════════════════════════════════════
// Deep Mapping — Candle Analyzer
// For each 1h candle: complete context + ground truth (future returns)
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { computeIndicators } from '@/lib/core/indicators';

export type BBPosition = 'BELOW_LOWER' | 'AT_LOWER' | 'LOWER_HALF' | 'AT_MID' | 'UPPER_HALF' | 'AT_UPPER' | 'ABOVE_UPPER';
export type MacdSignal = 'CROSS_UP' | 'CROSS_DOWN' | 'ABOVE' | 'BELOW';
export type VolumeProfile = 'CLIMAX' | 'HIGH' | 'NORMAL' | 'LOW' | 'DRY';
export type Trend = 'STRONG_UP' | 'UP' | 'FLAT' | 'DOWN' | 'STRONG_DOWN';
export type Regime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface CandleContext {
  index: number;
  date: string;
  close: number;
  // Indicators
  rsi14: number;
  macdHistogram: number;
  macdSignal: MacdSignal;
  bbPosition: BBPosition;
  bbWidth: number;
  atr14: number;
  adx14: number;
  stochK: number;
  stochD: number;
  ema9: number;
  ema21: number;
  sma50: number | null;
  sma200: number | null;
  // Derived
  trendShort: Trend;   // 5 bars
  trendMedium: Trend;  // 20 bars
  trendLong: Trend;    // 50 bars
  volumeProfile: VolumeProfile;
  regime: Regime;
  // Ground truth (future)
  futureRet1h: number | null;
  futureRet4h: number | null;
  futureRet24h: number | null;
  futureMaxUp24h: number | null;
  futureMaxDown24h: number | null;
}

function classifyBB(close: number, lower: number | null, mid: number | null, upper: number | null): BBPosition {
  if (lower === null || mid === null || upper === null) return 'AT_MID';
  if (close < lower * 0.998) return 'BELOW_LOWER';
  if (close < lower * 1.005) return 'AT_LOWER';
  if (close < mid * 0.998) return 'LOWER_HALF';
  if (close < mid * 1.002) return 'AT_MID';
  if (close < upper * 0.995) return 'UPPER_HALF';
  if (close < upper * 1.002) return 'AT_UPPER';
  return 'ABOVE_UPPER';
}

function classifyMacd(hist: number, prevHist: number): MacdSignal {
  if (hist > 0 && prevHist <= 0) return 'CROSS_UP';
  if (hist < 0 && prevHist >= 0) return 'CROSS_DOWN';
  return hist > 0 ? 'ABOVE' : 'BELOW';
}

function classifyTrend(slope: number): Trend {
  if (slope > 0.015) return 'STRONG_UP';
  if (slope > 0.003) return 'UP';
  if (slope < -0.015) return 'STRONG_DOWN';
  if (slope < -0.003) return 'DOWN';
  return 'FLAT';
}

function classifyVolume(vol: number, avg20: number): VolumeProfile {
  if (avg20 === 0) return 'NORMAL';
  const ratio = vol / avg20;
  if (ratio > 2.5) return 'CLIMAX';
  if (ratio > 1.5) return 'HIGH';
  if (ratio < 0.5) return 'DRY';
  if (ratio < 0.8) return 'LOW';
  return 'NORMAL';
}

function classifyRegimeFromCtx(adx: number, slope: number, atrPct: number): Regime {
  if (atrPct > 0.025) return 'VOLATILE';
  if (adx > 25 && slope > 0.005) return 'TRENDING_UP';
  if (adx > 25 && slope < -0.005) return 'TRENDING_DOWN';
  return 'RANGING';
}

function slope(closes: number[], i: number, window: number): number {
  if (i < window) return 0;
  const first = closes[i - window];
  const last = closes[i];
  return first > 0 ? (last - first) / first : 0;
}

/**
 * Analyze every 1h candle and produce a CandleContext array.
 * IMPORTANT: max 5000 candles to avoid OOM on 1GB server.
 * Indicators are pre-computed ONCE on the full series, then iterated.
 */
export function analyzeAllCandles(candles1h: OHLCV[]): CandleContext[] {
  const trimmed = candles1h.length > 5000 ? candles1h.slice(-5000) : candles1h;
  const n = trimmed.length;
  if (n < 60) return [];

  console.log(`[DEEP-MAP] Analyzing ${n} candles...`);

  // Pre-compute indicators ONCE
  const ind = computeIndicators(trimmed);
  const closes = trimmed.map(c => c.close);

  const contexts: CandleContext[] = [];

  for (let i = 50; i < n; i++) {
    const c = trimmed[i];
    const close = c.close;

    const macdH = ind.macd.histogram[i] ?? 0;
    const macdHPrev = ind.macd.histogram[i - 1] ?? 0;

    const bbPos = classifyBB(close, ind.bollinger.lower[i], ind.bollinger.mid[i], ind.bollinger.upper[i]);
    const macdSig = classifyMacd(macdH, macdHPrev);
    const trendShort = classifyTrend(slope(closes, i, 5));
    const trendMedium = classifyTrend(slope(closes, i, 20));
    const trendLong = classifyTrend(slope(closes, i, 50));
    const volumeProfile = classifyVolume(c.volume, ind.volume.avg20[i] ?? 0);
    const atrPct = close > 0 ? (ind.atr[i] ?? 0) / close : 0;
    const regime = classifyRegimeFromCtx(ind.adx[i] ?? 0, slope(closes, i, 20), atrPct);

    // Ground truth — future returns
    const fwd1 = i + 1 < n ? (trimmed[i + 1].close - close) / close : null;
    const fwd4 = i + 4 < n ? (trimmed[i + 4].close - close) / close : null;
    const fwd24 = i + 24 < n ? (trimmed[i + 24].close - close) / close : null;
    let maxUp24: number | null = null;
    let maxDown24: number | null = null;
    if (i + 24 < n) {
      let mu = 0, md = 0;
      for (let j = 1; j <= 24; j++) {
        const hi = (trimmed[i + j].high - close) / close;
        const lo = (trimmed[i + j].low - close) / close;
        if (hi > mu) mu = hi;
        if (lo < md) md = lo;
      }
      maxUp24 = mu;
      maxDown24 = md;
    }

    contexts.push({
      index: i,
      date: c.date,
      close,
      rsi14: ind.rsi[i] ?? 50,
      macdHistogram: macdH,
      macdSignal: macdSig,
      bbPosition: bbPos,
      bbWidth: ind.bollinger.width[i] ?? 0,
      atr14: ind.atr[i] ?? 0,
      adx14: ind.adx[i] ?? 0,
      stochK: ind.stochastic.k[i] ?? 50,
      stochD: ind.stochastic.d[i] ?? 50,
      ema9: ind.ema9[i] ?? close,
      ema21: ind.ema21[i] ?? close,
      sma50: ind.sma50[i],
      sma200: ind.sma200[i],
      trendShort, trendMedium, trendLong,
      volumeProfile, regime,
      futureRet1h: fwd1, futureRet4h: fwd4, futureRet24h: fwd24,
      futureMaxUp24h: maxUp24, futureMaxDown24h: maxDown24,
    });
  }

  console.log(`[DEEP-MAP] Analyzed ${contexts.length} candles with full context`);
  return contexts;
}
