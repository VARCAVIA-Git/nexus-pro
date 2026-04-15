// ═══════════════════════════════════════════════════════════════
// Adaptive Weights — adjusts master signal weights per asset
// based on historical trade outcomes
// ═══════════════════════════════════════════════════════════════

import type { AdaptiveWeights } from './types';
import { analyzeAssetPatterns } from './pattern-analyzer';
import { redisGet, redisSet, KEYS } from '@/lib/db/redis';

const DEFAULT_WEIGHTS: AdaptiveWeights = {
  mtfWeight: 0.50,
  newsWeight: 0.25,
  calendarWeight: 0.25,
  minScoreToEnter: 70,
  preferredHours: [],
  avoidDays: [],
  lastUpdated: 0,
};

const MIN_TRADES_FOR_ADAPTATION = 30;

/** Get adaptive weights for an asset (uses learning insights) */
export async function getAdaptiveWeights(asset: string): Promise<AdaptiveWeights> {
  // Check cache
  const cacheKey = KEYS.learningWeights(asset);
  try {
    const cached = await redisGet<AdaptiveWeights>(cacheKey);
    if (cached && Date.now() - cached.lastUpdated < 1800_000) return cached; // 30 min cache
  } catch {}

  const insights = await analyzeAssetPatterns(asset);

  if (insights.sampleSize < MIN_TRADES_FOR_ADAPTATION) {
    return { ...DEFAULT_WEIGHTS, lastUpdated: Date.now() };
  }

  // Adjust MTF weight: if regime analysis shows strong correlation with wins → boost
  let mtfWeight = 0.50;
  const regimeValues = Object.values(insights.bestRegime);
  if (regimeValues.length > 0) {
    const bestRegimeWR = Math.max(...regimeValues.map(r => r.winRate));
    if (bestRegimeWR > 70) mtfWeight = 0.55; // regime is very predictive → boost MTF
    if (bestRegimeWR < 50) mtfWeight = 0.40; // regime not predictive → reduce MTF
  }

  // Adjust news weight: if news impact shows strong divergence → boost
  let newsWeight = 0.25;
  const { positive, negative } = insights.newsImpact;
  if (positive.trades >= 10 && negative.trades >= 10) {
    const divergence = Math.abs(positive.winRate - negative.winRate);
    if (divergence > 25) newsWeight = 0.30; // news is very predictive
    if (divergence < 10) newsWeight = 0.15; // news doesn't help much
  }

  // Calendar weight: if event impact is significant
  let calendarWeight = 0.25;
  const { nearEvent, noEvent } = insights.eventImpact;
  if (nearEvent.trades >= 10 && noEvent.trades >= 10) {
    if (nearEvent.winRate < noEvent.winRate - 15) calendarWeight = 0.30; // events hurt → weight more
  }

  // Normalize weights to sum to 1
  const total = mtfWeight + newsWeight + calendarWeight;
  mtfWeight /= total;
  newsWeight /= total;
  calendarWeight /= total;

  const weights: AdaptiveWeights = {
    mtfWeight,
    newsWeight,
    calendarWeight,
    minScoreToEnter: insights.optimalMinScore,
    preferredHours: insights.bestTiming.bestHours,
    avoidDays: insights.bestTiming.worstDays,
    lastUpdated: Date.now(),
  };

  redisSet(cacheKey, weights, 1800).catch(() => {});
  return weights;
}

/** Check if current time is in a preferred window */
export function isPreferredTime(weights: AdaptiveWeights): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (weights.avoidDays.length > 0 && weights.avoidDays.includes(day)) return false;
  if (weights.preferredHours.length > 0 && !weights.preferredHours.includes(hour)) return false;
  return true;
}
