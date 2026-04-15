// ═══════════════════════════════════════════════════════════════
// V2.0 — Probabilistic Regime Detector
//
// Instead of a single label, outputs a probability distribution
// across 4 regimes. Only act when dominant regime > 65%.
//
// Regimes:
//   TRENDING  — strong directional move (ADX>25, aligned EMAs)
//   RANGING   — sideways, mean-reverting (ADX<20, BB tight)
//   VOLATILE  — high volatility, fast moves (ATR>1.5x, BB expanding)
//   ACCUMULATING — low vol, building position before breakout
//
// Uses fuzzy logic: each indicator contributes evidence toward
// each regime with a weight, then softmax normalizes.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { computeIndicators } from '@/lib/core/indicators';

export type RegimeType = 'TRENDING' | 'RANGING' | 'VOLATILE' | 'ACCUMULATING';

export interface RegimeProbabilities {
  trending: number;       // 0-1
  ranging: number;        // 0-1
  volatile: number;       // 0-1
  accumulating: number;   // 0-1
}

export interface RegimeState {
  probabilities: RegimeProbabilities;
  dominant: RegimeType;
  confidence: number;            // probability of dominant regime (0-1)
  direction: 'up' | 'down' | 'neutral';  // trend direction if trending
  actionable: boolean;           // confidence > threshold
  details: string;
}

const CONFIDENCE_THRESHOLD = 0.65;

/**
 * Detect market regime with probability distribution.
 * Requires at least 60 candles for meaningful analysis.
 */
export function detectRegime(candles: OHLCV[]): RegimeState {
  if (candles.length < 60) {
    return {
      probabilities: { trending: 0.25, ranging: 0.25, volatile: 0.25, accumulating: 0.25 },
      dominant: 'RANGING',
      confidence: 0.25,
      direction: 'neutral',
      actionable: false,
      details: 'Insufficient data (<60 candles)',
    };
  }

  const ind = computeIndicators(candles);
  const i = candles.length - 1;
  const close = candles[i].close;

  // ── Extract features ──────────────────────────────────

  const adx = ind.adx[i] ?? 15;
  const adxPrev = ind.adx[Math.max(0, i - 5)] ?? adx;
  const rsi = ind.rsi[i] ?? 50;
  const atr = ind.atr[i] ?? close * 0.02;
  const ema9 = ind.ema9[i] ?? close;
  const ema21 = ind.ema21[i] ?? close;
  const sma50 = ind.sma50[i] ?? close;
  const bbWidth = ind.bollinger.width[i] ?? 0;
  const stochK = ind.stochastic.k[i] ?? 50;

  // ATR ratio vs 50-period average
  const atrSlice = ind.atr.slice(Math.max(0, i - 50), i).filter(v => v > 0);
  const avgATR = atrSlice.length > 0 ? atrSlice.reduce((s, v) => s + v, 0) / atrSlice.length : atr;
  const atrRatio = avgATR > 0 ? atr / avgATR : 1;

  // BB width percentile (vs last 100 values)
  const bbSlice = ind.bollinger.width.slice(Math.max(0, i - 100), i).filter(v => v != null && v > 0);
  const bbWidthPct = bbSlice.length > 0
    ? bbSlice.filter(v => v <= bbWidth).length / bbSlice.length
    : 0.5;

  // Price vs EMAs
  const priceVsEma9 = ema9 > 0 ? (close - ema9) / ema9 : 0;
  const priceVsEma21 = ema21 > 0 ? (close - ema21) / ema21 : 0;
  const ema9VsSma50 = sma50 > 0 ? (ema9 - sma50) / sma50 : 0;

  // Directional alignment
  const emasAligned = Math.sign(priceVsEma9) === Math.sign(priceVsEma21) &&
                      Math.sign(priceVsEma21) === Math.sign(ema9VsSma50);

  // Higher highs / lower lows
  const recent20 = candles.slice(-20);
  let hhCount = 0, llCount = 0;
  for (let j = 5; j < recent20.length; j += 5) {
    const prevH = Math.max(...recent20.slice(j - 5, j).map(c => c.high));
    const currH = Math.max(...recent20.slice(j, Math.min(j + 5, recent20.length)).map(c => c.high));
    const prevL = Math.min(...recent20.slice(j - 5, j).map(c => c.low));
    const currL = Math.min(...recent20.slice(j, Math.min(j + 5, recent20.length)).map(c => c.low));
    if (currH > prevH) hhCount++;
    if (currL < prevL) llCount++;
  }

  // ── Compute evidence scores (0-1) for each regime ────

  // TRENDING evidence
  const trendEvidence =
    sigmoid(adx, 25, 8) * 0.35 +                      // ADX > 25
    (emasAligned ? 0.25 : 0) +                          // EMAs aligned
    sigmoid(Math.abs(priceVsEma21), 0.01, 300) * 0.20 + // price far from EMA21
    (Math.max(hhCount, llCount) >= 2 ? 0.20 : 0);       // clear HH or LL pattern

  // RANGING evidence
  const rangingEvidence =
    (1 - sigmoid(adx, 20, 8)) * 0.35 +                 // ADX < 20
    (1 - sigmoid(bbWidthPct, 0.5, 5)) * 0.25 +          // BB width below median
    sigmoid(Math.abs(rsi - 50), 5, -0.3) * 0.20 +       // RSI near 50
    (hhCount === llCount ? 0.20 : 0);                    // no clear direction

  // VOLATILE evidence
  const volatileEvidence =
    sigmoid(atrRatio, 1.5, 3) * 0.35 +                 // ATR > 1.5x average
    sigmoid(bbWidthPct, 0.7, 5) * 0.30 +                // BB width expanding
    (Math.abs(rsi - 50) > 25 ? 0.20 : 0) +              // RSI extreme
    sigmoid(adx - adxPrev, 3, 1) * 0.15;                // ADX rising fast

  // ACCUMULATING evidence
  const accumulatingEvidence =
    (1 - sigmoid(atrRatio, 0.8, 5)) * 0.30 +            // ATR below average
    (1 - sigmoid(bbWidthPct, 0.3, 5)) * 0.30 +          // BB very tight (squeeze)
    (1 - sigmoid(adx, 15, 5)) * 0.25 +                  // ADX very low
    (Math.abs(priceVsEma21) < 0.005 ? 0.15 : 0);        // price hugging EMA21

  // ── Softmax normalization ─────────────────────────────

  const scores = [trendEvidence, rangingEvidence, volatileEvidence, accumulatingEvidence];
  const temperature = 2.0; // lower = more decisive
  const expScores = scores.map(s => Math.exp(s / temperature));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const probs = expScores.map(e => e / sumExp);

  const probabilities: RegimeProbabilities = {
    trending: round3(probs[0]),
    ranging: round3(probs[1]),
    volatile: round3(probs[2]),
    accumulating: round3(probs[3]),
  };

  // ── Determine dominant regime ─────────────────────────

  const entries: [RegimeType, number][] = [
    ['TRENDING', probabilities.trending],
    ['RANGING', probabilities.ranging],
    ['VOLATILE', probabilities.volatile],
    ['ACCUMULATING', probabilities.accumulating],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const dominant = entries[0][0];
  const confidence = entries[0][1];

  // Direction (only meaningful for TRENDING)
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  if (dominant === 'TRENDING') {
    if (priceVsEma21 > 0 && hhCount > llCount) direction = 'up';
    else if (priceVsEma21 < 0 && llCount > hhCount) direction = 'down';
  }

  const actionable = confidence >= CONFIDENCE_THRESHOLD;

  return {
    probabilities,
    dominant,
    confidence,
    direction,
    actionable,
    details: `${dominant} ${(confidence * 100).toFixed(0)}%${direction !== 'neutral' ? ' ' + direction : ''} | ADX=${adx.toFixed(0)} ATR=${atrRatio.toFixed(2)}x BB=${(bbWidthPct * 100).toFixed(0)}%`,
  };
}

// ── Sigmoid helper ──────────────────────────────────────

/** Sigmoid centered at `center` with steepness `k`. Returns 0-1. */
function sigmoid(x: number, center: number, k: number): number {
  return 1 / (1 + Math.exp(-k * (x - center)));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Export for testing
export const _internals = { sigmoid, detectRegime, CONFIDENCE_THRESHOLD };
