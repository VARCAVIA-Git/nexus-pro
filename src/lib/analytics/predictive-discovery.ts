// ═══════════════════════════════════════════════════════════════
// Phase 6 — Predictive Combination Discovery
//
// Analyzes 4 years of historical data to discover which indicator
// combinations reliably PREDICT substantial price moves BEFORE
// they happen.
//
// Output: 3 risk-tiered strategy profiles:
//   - PRUDENT:    high certainty, fewer trades, WR > 62%, PF > 1.8
//   - MODERATE:   balanced, WR > 52%, PF > 1.3
//   - AGGRESSIVE: max opportunities, WR > 42%, PF > 1.0
//
// Each profile contains the best indicator combinations for that
// risk level, with simulated $1000 performance.
// ═══════════════════════════════════════════════════════════════

import type { CandleContext } from '@/lib/research/deep-mapping/candle-analyzer';

// ─── Types ───────────────────────────────────────────────────

export type RiskTier = 'prudent' | 'moderate' | 'aggressive';

export interface PredictiveCombination {
  id: string;
  conditions: string[];               // e.g. ['RSI<30', 'MACD=CROSS_UP']
  direction: 'long' | 'short';
  // Predictive quality
  occurrences: number;                 // how many times this combo appeared
  substantialMoves: number;            // how many led to a substantial move
  hitRate: number;                     // substantialMoves / occurrences
  avgReturnPct: number;               // average return when this combo fired
  avgMaxFavorablePct: number;          // avg max favorable excursion (MFE)
  avgMaxAdversePct: number;            // avg max adverse excursion (MAE)
  falsePositiveRate: number;           // % of times it fired without a substantial move
  // Backtest simulation ($1000)
  simTrades: number;
  simWinRate: number;
  simProfitFactor: number;
  simFinalCapital: number;             // $1000 → ?
  simMaxDrawdownPct: number;
  simAvgTpPct: number;                // optimal TP distance
  simAvgSlPct: number;                // optimal SL distance
  // Confidence
  wilsonScore: number;                 // Wilson LB on hit rate
  edgeScore: number;                   // composite quality metric
}

export interface TierProfile {
  tier: RiskTier;
  label: string;
  description: string;
  combinations: PredictiveCombination[];
  // Aggregated stats
  totalTrades: number;
  avgWinRate: number;
  avgProfitFactor: number;
  bestFinalCapital: number;            // best $1000 → ?
  avgFinalCapital: number;             // average across all combos
}

export interface PredictiveProfile {
  symbol: string;
  generatedAt: number;
  candlesAnalyzed: number;
  periodStart: string;
  periodEnd: string;
  totalCombinationsTested: number;
  totalPredictiveCombos: number;
  tiers: Record<RiskTier, TierProfile>;
}

// ─── Constants ───────────────────────────────────────────────

/** Minimum move to be considered "substantial" by tier. */
const SUBSTANTIAL_MOVE_PCT: Record<RiskTier, number> = {
  prudent: 2.0,     // >2% move = substantial (fewer, bigger moves)
  moderate: 1.0,    // >1% move
  aggressive: 0.5,  // >0.5% move (any meaningful move)
};

/** Minimum criteria for each tier. */
const TIER_CRITERIA: Record<RiskTier, { minWR: number; minPF: number; minOccurrences: number; minWilson: number }> = {
  prudent:    { minWR: 0.62, minPF: 1.8, minOccurrences: 20, minWilson: 0.50 },
  moderate:   { minWR: 0.52, minPF: 1.3, minOccurrences: 15, minWilson: 0.40 },
  aggressive: { minWR: 0.42, minPF: 1.0, minOccurrences: 10, minWilson: 0.30 },
};

const TIER_LABELS: Record<RiskTier, { label: string; description: string }> = {
  prudent: {
    label: 'Prudente',
    description: 'Combinazioni con alta certezza (WR > 62%). Meno operazioni ma molto affidabili. Ideale per chi preferisce poche operazioni sicure.',
  },
  moderate: {
    label: 'Moderato',
    description: 'Combinazioni bilanciate (WR > 52%). Buon equilibrio tra numero di operazioni e affidabilità.',
  },
  aggressive: {
    label: 'Aggressivo',
    description: 'Massimo numero di operazioni profittevoli (WR > 42%). Ogni opportunità viene intercettata, anche con margine più stretto.',
  },
};

const MAX_COMBOS_PER_TIER = 8;
const SIM_CAPITAL = 1000;
const SIM_TRADE_SIZE_PCT = 0.02; // 2% of capital per trade

// ─── Condition definitions (same as pattern-miner) ───────────

interface Condition {
  id: string;
  test: (c: CandleContext) => boolean;
}

const CONDITIONS: Condition[] = [
  { id: 'RSI<30',           test: c => c.rsi14 < 30 },
  { id: 'RSI<40',           test: c => c.rsi14 < 40 },
  { id: 'RSI>60',           test: c => c.rsi14 > 60 },
  { id: 'RSI>70',           test: c => c.rsi14 > 70 },
  { id: 'BB=BELOW_LOWER',   test: c => c.bbPosition === 'BELOW_LOWER' },
  { id: 'BB=AT_LOWER',      test: c => c.bbPosition === 'AT_LOWER' },
  { id: 'BB=AT_UPPER',      test: c => c.bbPosition === 'AT_UPPER' },
  { id: 'BB=ABOVE_UPPER',   test: c => c.bbPosition === 'ABOVE_UPPER' },
  { id: 'MACD=CROSS_UP',    test: c => c.macdSignal === 'CROSS_UP' },
  { id: 'MACD=CROSS_DOWN',  test: c => c.macdSignal === 'CROSS_DOWN' },
  { id: 'MACD=ABOVE',       test: c => c.macdSignal === 'ABOVE' },
  { id: 'MACD=BELOW',       test: c => c.macdSignal === 'BELOW' },
  { id: 'TREND_S=UP',       test: c => c.trendShort === 'UP' || c.trendShort === 'STRONG_UP' },
  { id: 'TREND_S=DOWN',     test: c => c.trendShort === 'DOWN' || c.trendShort === 'STRONG_DOWN' },
  { id: 'TREND_M=UP',       test: c => c.trendMedium === 'UP' || c.trendMedium === 'STRONG_UP' },
  { id: 'TREND_M=DOWN',     test: c => c.trendMedium === 'DOWN' || c.trendMedium === 'STRONG_DOWN' },
  { id: 'TREND_L=UP',       test: c => c.trendLong === 'UP' || c.trendLong === 'STRONG_UP' },
  { id: 'TREND_L=DOWN',     test: c => c.trendLong === 'DOWN' || c.trendLong === 'STRONG_DOWN' },
  { id: 'ADX>25',           test: c => c.adx14 > 25 },
  { id: 'ADX<15',           test: c => c.adx14 < 15 },
  { id: 'VOL=CLIMAX',       test: c => c.volumeProfile === 'CLIMAX' },
  { id: 'VOL=HIGH',         test: c => c.volumeProfile === 'HIGH' },
  { id: 'VOL=DRY',          test: c => c.volumeProfile === 'DRY' },
  { id: 'STOCH<20',         test: c => c.stochK < 20 },
  { id: 'STOCH>80',         test: c => c.stochK > 80 },
  { id: 'REGIME=TREND_UP',  test: c => c.regime === 'TRENDING_UP' },
  { id: 'REGIME=TREND_DN',  test: c => c.regime === 'TRENDING_DOWN' },
  { id: 'REGIME=RANGING',   test: c => c.regime === 'RANGING' },
];

// ─── Wilson Score ────────────────────────────────────────────

function wilsonLB(wins: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

// ─── Core: Scan all 2-condition combos for predictive power ──

interface RawComboResult {
  conditions: string[];
  direction: 'long' | 'short';
  occurrences: number;
  wins: number;             // times it predicted the move correctly
  sumReturn: number;
  sumMaxFavorable: number;  // MFE sum
  sumMaxAdverse: number;    // MAE sum
  returns: number[];        // individual returns for simulation
  prices: number[];         // entry prices for simulation
}

function scanCombinations(contexts: CandleContext[], moveThresholdPct: number): RawComboResult[] {
  const results: RawComboResult[] = [];
  const n = CONDITIONS.length;

  // Test all 2-condition combinations
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const conds = [CONDITIONS[i], CONDITIONS[j]];
      const condIds = [conds[0].id, conds[1].id];

      // Scan for LONG signals (predict upward move)
      const longResult: RawComboResult = {
        conditions: condIds,
        direction: 'long',
        occurrences: 0, wins: 0, sumReturn: 0,
        sumMaxFavorable: 0, sumMaxAdverse: 0,
        returns: [], prices: [],
      };

      // Scan for SHORT signals (predict downward move)
      const shortResult: RawComboResult = {
        conditions: condIds,
        direction: 'short',
        occurrences: 0, wins: 0, sumReturn: 0,
        sumMaxFavorable: 0, sumMaxAdverse: 0,
        returns: [], prices: [],
      };

      for (const ctx of contexts) {
        if (ctx.futureRet24h === null) continue;
        if (!conds[0].test(ctx) || !conds[1].test(ctx)) continue;

        const ret = ctx.futureRet24h;
        const maxUp = ctx.futureMaxUp24h ?? 0;
        const maxDown = ctx.futureMaxDown24h ?? 0;

        // LONG: positive return is a win
        longResult.occurrences++;
        longResult.sumReturn += ret;
        longResult.sumMaxFavorable += maxUp;
        longResult.sumMaxAdverse += Math.abs(maxDown);
        longResult.returns.push(ret);
        longResult.prices.push(ctx.close);
        if (ret > moveThresholdPct) longResult.wins++;

        // SHORT: negative return is a win
        shortResult.occurrences++;
        shortResult.sumReturn += -ret;
        shortResult.sumMaxFavorable += Math.abs(maxDown);
        shortResult.sumMaxAdverse += maxUp;
        shortResult.returns.push(-ret);
        shortResult.prices.push(ctx.close);
        if (ret < -moveThresholdPct) shortResult.wins++;
      }

      if (longResult.occurrences >= 5) results.push(longResult);
      if (shortResult.occurrences >= 5) results.push(shortResult);
    }
  }

  return results;
}

// ─── Simulate $1000 on a combination ─────────────────────────

interface SimResult {
  trades: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  finalCapital: number;
  maxDrawdownPct: number;
  avgTpPct: number;
  avgSlPct: number;
}

function simulate(returns: number[], prices: number[]): SimResult {
  if (returns.length === 0) {
    return { trades: 0, wins: 0, winRate: 0, profitFactor: 0, finalCapital: SIM_CAPITAL, maxDrawdownPct: 0, avgTpPct: 0, avgSlPct: 0 };
  }

  let capital = SIM_CAPITAL;
  let peak = capital;
  let maxDD = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const tpDistances: number[] = [];
  const slDistances: number[] = [];

  // Minimum cooldown: skip signals within 4 bars of last trade
  let lastTradeIdx = -5;

  for (let i = 0; i < returns.length; i++) {
    if (i - lastTradeIdx < 4) continue; // cooldown

    const tradeSize = capital * SIM_TRADE_SIZE_PCT;
    if (tradeSize < 1) break; // too small

    const ret = returns[i];
    // Apply commission (0.2% round trip)
    const netRet = ret - 0.2;
    const pnl = tradeSize * (netRet / 100);

    capital += pnl;
    lastTradeIdx = i;

    if (pnl > 0) {
      wins++;
      grossProfit += pnl;
      tpDistances.push(ret);
    } else {
      grossLoss += Math.abs(pnl);
      slDistances.push(Math.abs(ret));
    }

    peak = Math.max(peak, capital);
    const dd = peak > 0 ? ((peak - capital) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
  }

  const trades = returns.filter((_, i) => {
    // Recalculate which trades were taken (same cooldown logic)
    let last = -5;
    for (let j = 0; j <= i; j++) {
      if (j - last >= 4) { last = j; if (j === i) return true; }
    }
    return false;
  }).length || Math.max(1, Math.floor(returns.length / 4)); // approximation

  const actualTrades = wins + (grossLoss > 0 ? Math.round(grossLoss / (grossLoss / Math.max(1, returns.length - wins))) : returns.length - wins);
  const finalTrades = Math.min(returns.length, Math.max(1, Math.floor(returns.length / 4)));

  return {
    trades: finalTrades,
    wins,
    winRate: finalTrades > 0 ? wins / finalTrades : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
    finalCapital: Math.round(capital * 100) / 100,
    maxDrawdownPct: Math.round(maxDD * 100) / 100,
    avgTpPct: tpDistances.length > 0 ? Math.round(avg(tpDistances) * 100) / 100 : 0,
    avgSlPct: slDistances.length > 0 ? Math.round(avg(slDistances) * 100) / 100 : 0,
  };
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Build Predictive Combinations for a tier ────────────────

function buildTierCombinations(
  rawResults: RawComboResult[],
  tier: RiskTier,
): PredictiveCombination[] {
  const criteria = TIER_CRITERIA[tier];
  const threshold = SUBSTANTIAL_MOVE_PCT[tier];

  const combinations: PredictiveCombination[] = [];

  for (const raw of rawResults) {
    if (raw.occurrences < criteria.minOccurrences) continue;

    const hitRate = raw.wins / raw.occurrences;
    const wilson = wilsonLB(raw.wins, raw.occurrences);
    if (wilson < criteria.minWilson) continue;

    const avgReturn = raw.sumReturn / raw.occurrences;
    if (avgReturn <= 0) continue; // must be profitable on average

    const avgMFE = raw.sumMaxFavorable / raw.occurrences;
    const avgMAE = raw.sumMaxAdverse / raw.occurrences;
    const falsePositiveRate = 1 - hitRate;

    // Simulate $1000
    const sim = simulate(raw.returns, raw.prices);

    if (sim.winRate < criteria.minWR) continue;
    if (sim.profitFactor < criteria.minPF) continue;
    if (sim.finalCapital <= SIM_CAPITAL) continue; // must be profitable

    const edgeScore = wilson * Math.abs(avgReturn) * Math.sqrt(raw.occurrences);

    combinations.push({
      id: `${raw.conditions.join('_')}_${raw.direction}`,
      conditions: raw.conditions,
      direction: raw.direction,
      occurrences: raw.occurrences,
      substantialMoves: raw.wins,
      hitRate: Math.round(hitRate * 1000) / 1000,
      avgReturnPct: Math.round(avgReturn * 1000) / 1000,
      avgMaxFavorablePct: Math.round(avgMFE * 1000) / 1000,
      avgMaxAdversePct: Math.round(avgMAE * 1000) / 1000,
      falsePositiveRate: Math.round(falsePositiveRate * 1000) / 1000,
      simTrades: sim.trades,
      simWinRate: Math.round(sim.winRate * 1000) / 1000,
      simProfitFactor: Math.round(sim.profitFactor * 100) / 100,
      simFinalCapital: sim.finalCapital,
      simMaxDrawdownPct: sim.maxDrawdownPct,
      simAvgTpPct: sim.avgTpPct,
      simAvgSlPct: sim.avgSlPct,
      wilsonScore: Math.round(wilson * 1000) / 1000,
      edgeScore: Math.round(edgeScore * 100) / 100,
    });
  }

  // Sort by edgeScore (composite quality) and take top N
  combinations.sort((a, b) => b.edgeScore - a.edgeScore);
  return combinations.slice(0, MAX_COMBOS_PER_TIER);
}

// ─── Main: Discover Predictive Profiles ──────────────────────

/**
 * Analyze historical CandleContexts to discover predictive indicator
 * combinations, classified into 3 risk tiers.
 *
 * @param contexts - CandleContext[] from 4yr 1h analysis (with ground truth)
 * @param symbol - Asset symbol
 * @returns PredictiveProfile with 3 tiers
 */
export function discoverPredictiveProfile(
  contexts: CandleContext[],
  symbol: string,
): PredictiveProfile {
  const validContexts = contexts.filter(c => c.futureRet24h !== null);

  // Scan all 2-condition combos at each threshold level
  // Use the lowest threshold to capture all relevant data
  const rawResults = scanCombinations(validContexts, 0); // raw returns, no threshold filter in scan

  // Build tiers with different criteria
  const tiers: Record<RiskTier, TierProfile> = {} as any;
  let totalPredictive = 0;

  for (const tier of ['prudent', 'moderate', 'aggressive'] as RiskTier[]) {
    // Re-scan with tier-specific substantial move threshold
    const tierResults = scanCombinations(validContexts, SUBSTANTIAL_MOVE_PCT[tier]);
    const combinations = buildTierCombinations(tierResults, tier);
    totalPredictive += combinations.length;

    const totalTrades = combinations.reduce((s, c) => s + c.simTrades, 0);
    const avgWR = combinations.length > 0
      ? combinations.reduce((s, c) => s + c.simWinRate, 0) / combinations.length
      : 0;
    const avgPF = combinations.length > 0
      ? combinations.reduce((s, c) => s + c.simProfitFactor, 0) / combinations.length
      : 0;
    const bestFC = combinations.length > 0
      ? Math.max(...combinations.map(c => c.simFinalCapital))
      : SIM_CAPITAL;
    const avgFC = combinations.length > 0
      ? combinations.reduce((s, c) => s + c.simFinalCapital, 0) / combinations.length
      : SIM_CAPITAL;

    tiers[tier] = {
      tier,
      label: TIER_LABELS[tier].label,
      description: TIER_LABELS[tier].description,
      combinations,
      totalTrades,
      avgWinRate: Math.round(avgWR * 1000) / 1000,
      avgProfitFactor: Math.round(avgPF * 100) / 100,
      bestFinalCapital: Math.round(bestFC * 100) / 100,
      avgFinalCapital: Math.round(avgFC * 100) / 100,
    };
  }

  // Total unique combos tested = C(28, 2) × 2 directions = 378 × 2 = 756
  const totalTested = (CONDITIONS.length * (CONDITIONS.length - 1) / 2) * 2;

  const dates = validContexts.map(c => c.date).filter(Boolean);

  return {
    symbol,
    generatedAt: Date.now(),
    candlesAnalyzed: validContexts.length,
    periodStart: dates[0] ?? '',
    periodEnd: dates[dates.length - 1] ?? '',
    totalCombinationsTested: totalTested,
    totalPredictiveCombos: totalPredictive,
    tiers,
  };
}

// Export for testing
export const _internals = {
  scanCombinations,
  simulate,
  buildTierCombinations,
  wilsonLB,
  CONDITIONS,
  TIER_CRITERIA,
  SUBSTANTIAL_MOVE_PCT,
};
