// ═══════════════════════════════════════════════════════════════
// Bollinger Bot — Calibrator
// Trains per-asset Bollinger Bands parameters using up to 4 years of history.
// For each (period, stdDev) combination, measures historical favorable/adverse
// moves after each BB touch signal, then picks the parameters with highest EV.
// TP = 60th percentile of favorable moves (safe target).
// SL = 1.2 × avg adverse move (small buffer above typical pullback).
// ═══════════════════════════════════════════════════════════════

import { BollingerBands } from 'technicalindicators';
import type { OHLCV } from '@/types';
import type { BollingerProfile, SignalSideStats } from './types';

const PARAM_GRID: { period: number; stdDev: number }[] = [
  { period: 14, stdDev: 1.5 },
  { period: 14, stdDev: 2.0 },
  { period: 20, stdDev: 1.5 },
  { period: 20, stdDev: 2.0 },
  { period: 20, stdDev: 2.5 },
  { period: 30, stdDev: 2.0 },
  { period: 30, stdDev: 2.5 },
];

const LOOKAHEAD = 48; // 2 days on 1h candles

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

interface SignalSnapshot {
  index: number;
  entryPrice: number;
  maxFavorable: number;   // % (positive for long, abs for short)
  maxAdverse: number;     // % (negative)
  barsToMaxFav: number;
}

/**
 * Scan candles, find all signals matching the predicate,
 * and measure forward favorable/adverse moves for each.
 */
function scanSignals(
  candles: OHLCV[],
  predicate: (i: number) => boolean,
  side: 'long' | 'short',
): SignalSnapshot[] {
  const out: SignalSnapshot[] = [];
  for (let i = 50; i < candles.length - LOOKAHEAD; i++) {
    if (!predicate(i)) continue;
    const entry = candles[i].close;
    if (entry <= 0) continue;
    let maxFav = 0;
    let maxAdv = 0;
    let barsToMaxFav = 0;
    for (let j = 1; j <= LOOKAHEAD; j++) {
      const future = candles[i + j];
      const upMove = (future.high - entry) / entry;
      const downMove = (future.low - entry) / entry;
      if (side === 'long') {
        if (upMove > maxFav) { maxFav = upMove; barsToMaxFav = j; }
        if (downMove < maxAdv) maxAdv = downMove;
      } else {
        // For short: favorable = price goes DOWN
        if (-downMove > maxFav) { maxFav = -downMove; barsToMaxFav = j; }
        if (-upMove < maxAdv) maxAdv = -upMove;
      }
    }
    out.push({ index: i, entryPrice: entry, maxFavorable: maxFav, maxAdverse: maxAdv, barsToMaxFav });
  }
  return out;
}

function computeStats(
  snapshots: SignalSnapshot[],
  candles: OHLCV[],
  side: 'long' | 'short',
): SignalSideStats {
  if (snapshots.length < 10) {
    return {
      samples: snapshots.length,
      avgFavorable: 0, avgAdverse: 0,
      p60Favorable: 0, p80Favorable: 0,
      avgTimeToTP: 0,
      recommendedTP: 0, recommendedSL: 0,
      estimatedWinRate: 0, expectedValue: 0, edgeScore: 0,
    };
  }

  const favs = snapshots.map(s => s.maxFavorable).sort((a, b) => a - b);
  const advs = snapshots.map(s => s.maxAdverse).sort((a, b) => a - b);

  const avgFav = avg(favs);
  const avgAdv = avg(advs);
  // p40 of favorable moves = level that 60% of signals reach or exceed
  // (this is the user's "60% of the range" intent)
  const p40 = percentile(favs, 0.40);
  const p80 = percentile(favs, 0.80);
  const avgTime = avg(snapshots.map(s => s.barsToMaxFav));

  // TP = level that 60% of signals reach historically (= 40th percentile)
  // SL = avg adverse + 20% buffer
  const recTP = Math.max(0.005, p40); // min 0.5% to avoid noise
  const recSL = Math.max(0.005, Math.abs(avgAdv) * 1.2);

  // Sequential walk: for each signal, walk forward and check which is hit FIRST
  let wins = 0;
  let losses = 0;
  for (const s of snapshots) {
    const entry = s.entryPrice;
    const tpPrice = side === 'long' ? entry * (1 + recTP) : entry * (1 - recTP);
    const slPrice = side === 'long' ? entry * (1 - recSL) : entry * (1 + recSL);
    let hit: 'tp' | 'sl' | null = null;
    for (let j = 1; j <= LOOKAHEAD && s.index + j < candles.length; j++) {
      const bar = candles[s.index + j];
      if (side === 'long') {
        // SL hit first if low touches it before high touches TP (use both intracandle)
        if (bar.low <= slPrice) { hit = 'sl'; break; }
        if (bar.high >= tpPrice) { hit = 'tp'; break; }
      } else {
        if (bar.high >= slPrice) { hit = 'sl'; break; }
        if (bar.low <= tpPrice) { hit = 'tp'; break; }
      }
    }
    if (hit === 'tp') wins++;
    else if (hit === 'sl') losses++;
    // neither hit = neutral, ignored
  }
  const decided = wins + losses;
  const wr = decided > 0 ? wins / decided : 0;
  const ev = wr * recTP - (1 - wr) * recSL;
  const edgeScore = ev * Math.sqrt(decided);

  return {
    samples: snapshots.length,
    avgFavorable: Math.round(avgFav * 10000) / 100,
    avgAdverse: Math.round(avgAdv * 10000) / 100,
    p60Favorable: Math.round(p40 * 10000) / 100, // stored as p60 for backward field name
    p80Favorable: Math.round(p80 * 10000) / 100,
    avgTimeToTP: Math.round(avgTime * 10) / 10,
    recommendedTP: Math.round(recTP * 10000) / 100,
    recommendedSL: Math.round(recSL * 10000) / 100,
    estimatedWinRate: Math.round(wr * 1000) / 10,
    expectedValue: Math.round(ev * 10000) / 100,
    edgeScore: Math.round(edgeScore * 100) / 100,
  };
}

/**
 * Calibrate Bollinger parameters for a single asset.
 * Tests all PARAM_GRID combinations on both long (lower touch) and short (upper touch),
 * picks the parameters with highest combined edge score.
 */
export function calibrateAsset(asset: string, candles: OHLCV[]): BollingerProfile {
  const n = candles.length;
  console.log(`[BOLLINGER] Calibrating ${asset} on ${n} candles`);

  if (n < 200) {
    return emptyProfile(asset, candles);
  }

  let bestParams = PARAM_GRID[0];
  let bestLong: SignalSideStats | null = null;
  let bestShort: SignalSideStats | null = null;
  let bestCombinedEdge = -Infinity;

  const closes = candles.map(c => c.close);

  for (const params of PARAM_GRID) {
    const bb = BollingerBands.calculate({
      period: params.period,
      stdDev: params.stdDev,
      values: closes,
    });
    // Pad with nulls so indices align with candles
    const offset = closes.length - bb.length;
    const lower = new Array(offset).fill(null).concat(bb.map(b => b.lower));
    const upper = new Array(offset).fill(null).concat(bb.map(b => b.upper));

    // Long signal: close at or below lower band (within 0.5% buffer)
    const longSnaps = scanSignals(candles, i => {
      const lo = lower[i];
      return lo !== null && candles[i].close <= lo * 1.005;
    }, 'long');

    // Short signal: close at or above upper band
    const shortSnaps = scanSignals(candles, i => {
      const up = upper[i];
      return up !== null && candles[i].close >= up * 0.995;
    }, 'short');

    const longStats = computeStats(longSnaps, candles, 'long');
    const shortStats = computeStats(shortSnaps, candles, 'short');
    const combined = longStats.edgeScore + shortStats.edgeScore;

    console.log(`[BOLLINGER]   period=${params.period} stdDev=${params.stdDev}: long ${longStats.samples}sig EV ${longStats.expectedValue}% · short ${shortStats.samples}sig EV ${shortStats.expectedValue}% · combined ${combined.toFixed(2)}`);

    if (combined > bestCombinedEdge) {
      bestCombinedEdge = combined;
      bestParams = params;
      bestLong = longStats;
      bestShort = shortStats;
    }
  }

  if (!bestLong || !bestShort) {
    return emptyProfile(asset, candles);
  }

  // Compute overall score and recommendation
  const longGood = bestLong.expectedValue > 0 && bestLong.samples >= 30;
  const shortGood = bestShort.expectedValue > 0 && bestShort.samples >= 30;
  const totalEV = (bestLong.expectedValue + bestShort.expectedValue) / 2;
  const sampleScore = Math.min(1, (bestLong.samples + bestShort.samples) / 200);
  const overallScore = Math.max(0, Math.min(100, Math.round((totalEV * 20 + 50) * sampleScore)));

  let recommendation: 'STRONG' | 'GOOD' | 'CAUTION' | 'AVOID' = 'AVOID';
  let reason = '';
  if (longGood && shortGood && totalEV > 0.5) {
    recommendation = 'STRONG';
    reason = `Both long and short have positive EV (${totalEV.toFixed(2)}% per trade) on ${bestLong.samples + bestShort.samples} signals.`;
  } else if (longGood || shortGood) {
    recommendation = totalEV > 0.2 ? 'GOOD' : 'CAUTION';
    reason = `Only one direction profitable. Long EV ${bestLong.expectedValue}%, Short EV ${bestShort.expectedValue}%.`;
  } else {
    recommendation = 'AVOID';
    reason = `Neither direction has positive EV. Long ${bestLong.expectedValue}%, Short ${bestShort.expectedValue}%.`;
  }

  const firstDate = candles[0]?.date ?? '';
  const lastDate = candles[n - 1]?.date ?? '';
  const spanMs = firstDate && lastDate ? new Date(lastDate).getTime() - new Date(firstDate).getTime() : 0;
  const spanYears = Math.round((spanMs / (365 * 86400000)) * 10) / 10;

  return {
    asset,
    trainedAt: new Date().toISOString(),
    dataset: { candles: n, firstDate, lastDate, spanYears },
    optimalParams: bestParams,
    long: bestLong,
    short: bestShort,
    recommendation,
    recommendationReason: reason,
    overallScore,
  };
}

function emptyProfile(asset: string, candles: OHLCV[]): BollingerProfile {
  const empty: SignalSideStats = {
    samples: 0, avgFavorable: 0, avgAdverse: 0, p60Favorable: 0, p80Favorable: 0,
    avgTimeToTP: 0, recommendedTP: 0, recommendedSL: 0,
    estimatedWinRate: 0, expectedValue: 0, edgeScore: 0,
  };
  return {
    asset,
    trainedAt: new Date().toISOString(),
    dataset: {
      candles: candles.length,
      firstDate: candles[0]?.date ?? '',
      lastDate: candles[candles.length - 1]?.date ?? '',
      spanYears: 0,
    },
    optimalParams: { period: 20, stdDev: 2 },
    long: empty,
    short: empty,
    recommendation: 'AVOID',
    recommendationReason: 'Insufficient data',
    overallScore: 0,
  };
}
