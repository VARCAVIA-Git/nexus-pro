// ═══════════════════════════════════════════════════════════════
// Pattern Analyzer — discovers what works and what doesn't per asset
// ═══════════════════════════════════════════════════════════════

import type { TradeOutcome, ConditionStats, AssetInsights } from './types';
import { loadOutcomes } from './outcome-tracker';
import { redisGet, redisSet, KEYS } from '@/lib/db/redis';

const MIN_SAMPLE = 10; // minimum trades per group for statistical significance

/** Calculate stats for a group of trades */
function calcStats(trades: TradeOutcome[]): ConditionStats {
  if (trades.length === 0) return { winRate: 0, trades: 0, avgPnl: 0, avgPnlPct: 0 };
  const wins = trades.filter(t => t.won).length;
  const avgPnl = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const avgPnlPct = trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length;
  return { winRate: (wins / trades.length) * 100, trades: trades.length, avgPnl, avgPnlPct };
}

/** Group trades by a key and calculate stats per group */
function groupBy<T>(trades: TradeOutcome[], keyFn: (t: TradeOutcome) => T): Map<T, TradeOutcome[]> {
  const map = new Map<T, TradeOutcome[]>();
  for (const t of trades) {
    const key = keyFn(t);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

/** Find best strategy by win rate */
function findBestStrategy(outcomes: TradeOutcome[]): Record<string, ConditionStats> {
  const groups = groupBy(outcomes, t => t.entryContext.strategy);
  const result: Record<string, ConditionStats> = {};
  for (const [key, trades] of groups) {
    if (trades.length >= MIN_SAMPLE) result[key] = calcStats(trades);
  }
  return result;
}

/** Find best regime */
function findBestRegime(outcomes: TradeOutcome[]): Record<string, ConditionStats> {
  const groups = groupBy(outcomes, t => t.entryContext.regime);
  const result: Record<string, ConditionStats> = {};
  for (const [key, trades] of groups) {
    if (trades.length >= MIN_SAMPLE) result[key] = calcStats(trades);
  }
  return result;
}

/** Find best timing (hours and days) */
function findBestTiming(outcomes: TradeOutcome[]): AssetInsights['bestTiming'] {
  const byHour = groupBy(outcomes, t => t.entryContext.hourOfDay);
  const byDay = groupBy(outcomes, t => t.entryContext.dayOfWeek);

  const hourStats: Array<{ hour: number; winRate: number; trades: number }> = [];
  for (const [hour, trades] of byHour) {
    if (trades.length >= 5) {
      hourStats.push({ hour, ...calcStats(trades) });
    }
  }
  hourStats.sort((a, b) => b.winRate - a.winRate);

  const dayStats: Array<{ day: number; winRate: number; trades: number }> = [];
  for (const [day, trades] of byDay) {
    if (trades.length >= 5) {
      dayStats.push({ day, ...calcStats(trades) });
    }
  }
  dayStats.sort((a, b) => b.winRate - a.winRate);

  return {
    bestHours: hourStats.filter(h => h.winRate > 55).map(h => h.hour).slice(0, 5),
    worstHours: hourStats.filter(h => h.winRate < 40).map(h => h.hour).slice(0, 3),
    bestDays: dayStats.filter(d => d.winRate > 55).map(d => d.day).slice(0, 3),
    worstDays: dayStats.filter(d => d.winRate < 40).map(d => d.day).slice(0, 2),
  };
}

/** Analyze news impact */
function analyzeNewsImpact(outcomes: TradeOutcome[]): AssetInsights['newsImpact'] {
  const positive = outcomes.filter(o => o.entryContext.newsSentiment > 20);
  const negative = outcomes.filter(o => o.entryContext.newsSentiment < -20);
  const neutral = outcomes.filter(o => Math.abs(o.entryContext.newsSentiment) <= 20);
  return {
    positive: calcStats(positive),
    negative: calcStats(negative),
    neutral: calcStats(neutral),
  };
}

/** Analyze event impact */
function analyzeEventImpact(outcomes: TradeOutcome[]): AssetInsights['eventImpact'] {
  const near = outcomes.filter(o => o.entryContext.nearbyEconomicEvent);
  const none = outcomes.filter(o => !o.entryContext.nearbyEconomicEvent);
  return { nearEvent: calcStats(near), noEvent: calcStats(none) };
}

/** Find optimal RSI range for entries */
function findOptimalRSI(outcomes: TradeOutcome[]): AssetInsights['optimalRSI'] {
  const ranges: Array<{ min: number; max: number; label: string }> = [
    { min: 0, max: 30, label: 'oversold' },
    { min: 30, max: 45, label: 'low' },
    { min: 45, max: 55, label: 'mid' },
    { min: 55, max: 70, label: 'high' },
    { min: 70, max: 100, label: 'overbought' },
  ];

  let bestRange: [number, number] = [30, 50];
  let worstRange: [number, number] = [50, 70];
  let bestWR = 0;
  let worstWR = 100;

  for (const r of ranges) {
    const trades = outcomes.filter(o => o.entryContext.rsi >= r.min && o.entryContext.rsi < r.max);
    if (trades.length >= MIN_SAMPLE) {
      const wr = calcStats(trades).winRate;
      if (wr > bestWR) { bestWR = wr; bestRange = [r.min, r.max]; }
      if (wr < worstWR) { worstWR = wr; worstRange = [r.min, r.max]; }
    }
  }

  return { bestBuyRange: bestRange, worstBuyRange: worstRange };
}

/** Find optimal minimum master score for profitable trades */
function findOptimalMinScore(outcomes: TradeOutcome[]): number {
  let bestThreshold = 70;
  let bestWR = 0;

  for (let threshold = 50; threshold <= 85; threshold += 5) {
    const trades = outcomes.filter(o => o.entryContext.masterScore >= threshold);
    if (trades.length >= MIN_SAMPLE) {
      const wr = calcStats(trades).winRate;
      if (wr > bestWR && wr > 55) { bestWR = wr; bestThreshold = threshold; }
    }
  }

  return bestThreshold;
}

/** Run full analysis for an asset */
export async function analyzeAssetPatterns(asset: string): Promise<AssetInsights> {
  // Check cache first (valid for 1 hour)
  const cacheKey = KEYS.learningInsights(asset);
  try {
    const cached = await redisGet<AssetInsights>(cacheKey);
    if (cached && Date.now() - cached.lastUpdated < 3600_000) return cached;
  } catch {}

  const outcomes = await loadOutcomes(asset);

  const insights: AssetInsights = {
    asset,
    bestStrategy: findBestStrategy(outcomes),
    bestRegime: findBestRegime(outcomes),
    bestTiming: findBestTiming(outcomes),
    newsImpact: analyzeNewsImpact(outcomes),
    eventImpact: analyzeEventImpact(outcomes),
    optimalRSI: findOptimalRSI(outcomes),
    optimalMinScore: findOptimalMinScore(outcomes),
    sampleSize: outcomes.length,
    lastUpdated: Date.now(),
  };

  // Cache insights
  redisSet(cacheKey, insights, 3600).catch(() => {});
  return insights;
}

/** Analyze all assets */
export async function analyzeAllAssets(assets: string[]): Promise<Record<string, AssetInsights>> {
  const result: Record<string, AssetInsights> = {};
  for (const asset of assets) {
    result[asset] = await analyzeAssetPatterns(asset);
  }
  return result;
}
