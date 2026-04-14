// ═══════════════════════════════════════════════════════════════
// Phase 6 — Continuous Strategy Evaluator
//
// Runs every 30s as part of the mine-tick cycle.
// Evaluates top strategies against current market conditions
// and produces ContinuousEvaluation with entry/TP/SL/timeout.
//
// Decision flow:
//   1. Load live context + analytic report + asset memory
//   2. Evaluate top 5 strategies against current indicators
//   3. Score each strategy's fit to current conditions
//   4. Decide order type (market vs limit) based on volatility/momentum
//   5. Calculate limit price + timeout
//   6. Save evaluation to Redis
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type { LiveContext, AnalyticReport, BacktestStrategySummary } from './types';
import type {
  ContinuousEvaluation,
  StrategyType,
  AssetMemory,
  StrategyPerformanceEntry,
  AggressivenessProfile,
} from '@/lib/mine/types';
import type { PredictiveProfile, PredictiveCombination, RiskTier } from './predictive-discovery';
import { MINE_KEYS } from '@/lib/mine/constants';

const EVAL_TTL_SECONDS = 60; // 60s TTL for evaluations

// ─── Configuration ───────────────────────────────────────────

/** Minimum confidence to emit a trade signal. */
const MIN_TRADE_CONFIDENCE = 0.4;

/** Volatility percentile threshold: above this → prefer limit orders. */
const HIGH_VOL_PERCENTILE = 65;

/** Strong momentum threshold: above this → prefer market orders. */
const STRONG_MOMENTUM = 0.35;

/** Default limit order timeout by volatility regime (ms). */
const LIMIT_TIMEOUT_MS = {
  low: 30 * 60_000,      // 30 min in low vol
  normal: 60 * 60_000,   // 1h in normal vol
  high: 120 * 60_000,    // 2h in high vol
};

// ─── Main ────────────────────────────────────────────────────

export interface EvaluatorInput {
  symbol: string;
  live: LiveContext;
  report: AnalyticReport;
  memory: AssetMemory | null;
  riskProfile?: AggressivenessProfile;  // maps to predictive tier
}

/** Map user risk profile to predictive tier. */
function profileToTier(profile?: AggressivenessProfile): RiskTier {
  switch (profile) {
    case 'conservative': return 'prudent';
    case 'aggressive': return 'aggressive';
    default: return 'moderate';
  }
}

/**
 * Evaluate current conditions for an asset and produce a trade recommendation.
 * Phase 6: First checks predictive combinations (from 4yr analysis),
 * then falls back to backtest rankings.
 */
export function evaluate(input: EvaluatorInput): ContinuousEvaluation {
  const { symbol, live, report, memory } = input;
  const reasoning: string[] = [];
  const now = Date.now();

  // Phase 6: Check predictive profile combinations first
  const predictive = report.predictiveProfile;
  if (predictive) {
    const tier = profileToTier(input.riskProfile);
    const tierProfile = predictive.tiers[tier];
    if (tierProfile && tierProfile.combinations.length > 0) {
      const match = matchPredictiveCombination(tierProfile.combinations, live);
      if (match) {
        reasoning.push(`predictive combo: ${match.conditions.join(' + ')} (${tier})`);
        reasoning.push(`hit rate: ${(match.hitRate * 100).toFixed(0)}%, WR: ${(match.simWinRate * 100).toFixed(0)}%`);

        const orderType = decideOrderType(live);
        const price = live.price;
        const atr = live.indicators?.atr ?? price * 0.02;
        const tpPct = match.simAvgTpPct > 0 ? match.simAvgTpPct / 100 : 0.025;
        const slPct = match.simAvgSlPct > 0 ? match.simAvgSlPct / 100 : 0.015;

        let entry: number, tp: number, sl: number;
        if (match.direction === 'long') {
          entry = orderType === 'limit' ? round8(price - atr * 0.3) : price;
          tp = round8(entry * (1 + tpPct));
          sl = round8(entry * (1 - slPct));
        } else {
          entry = orderType === 'limit' ? round8(price + atr * 0.3) : price;
          tp = round8(entry * (1 - tpPct));
          sl = round8(entry * (1 + slPct));
        }

        const timeoutMs = orderType === 'limit' ? calculateTimeout(live.volatilityPercentile) : null;

        return {
          symbol, updatedAt: now, shouldTrade: true,
          direction: match.direction,
          confidence: Math.min(1, match.wilsonScore * 1.2),
          suggestedEntry: entry, tp, sl, timeoutMs, orderType,
          strategy: match.direction === 'long' ? 'trend' : 'reversion',
          timeframe: '1h',
          reasoning,
        };
      }
      reasoning.push(`no predictive combo matched for tier ${tier}`);
    }
  }

  // Fallback: use backtest rankings
  const rankings = report.backtestSummary?.rankings ?? [];
  if (rankings.length === 0) {
    return noTrade(symbol, now, [...reasoning, 'no backtest rankings available']);
  }

  // 2. Score each strategy against current conditions
  const scored = rankings.slice(0, 5).map(r => ({
    ranking: r,
    score: scoreStrategy(r, live, memory),
  }));

  // Sort by combined score
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  reasoning.push(`best strategy: ${best.ranking.strategyName} (score=${best.score.toFixed(2)})`);

  // 3. Minimum confidence check
  if (best.score < MIN_TRADE_CONFIDENCE) {
    reasoning.push(`score ${best.score.toFixed(2)} < min ${MIN_TRADE_CONFIDENCE}`);
    return noTrade(symbol, now, reasoning);
  }

  // 4. Determine direction from regime + momentum
  const direction = inferDirection(live, best.ranking);
  if (!direction) {
    reasoning.push('no clear direction from regime/momentum');
    return noTrade(symbol, now, reasoning);
  }
  reasoning.push(`direction: ${direction}`);

  // 5. Decide order type
  const orderType = decideOrderType(live);
  reasoning.push(`order type: ${orderType} (vol=${live.volatilityPercentile}%, momentum=${live.momentumScore.toFixed(2)})`);

  // 6. Calculate entry, TP, SL
  const price = live.price;
  const atr = live.indicators?.atr ?? price * 0.02;
  const tpMultiplier = best.ranking.avgTpDistancePct
    ? best.ranking.avgTpDistancePct / 100
    : 0.025;
  const slMultiplier = best.ranking.avgSlDistancePct
    ? best.ranking.avgSlDistancePct / 100
    : 0.015;

  let entry: number;
  let tp: number;
  let sl: number;

  if (direction === 'long') {
    entry = orderType === 'limit'
      ? round8(price - atr * 0.3)  // try to get a better price
      : price;
    tp = round8(entry * (1 + tpMultiplier));
    sl = round8(entry * (1 - slMultiplier));
  } else {
    entry = orderType === 'limit'
      ? round8(price + atr * 0.3)
      : price;
    tp = round8(entry * (1 - tpMultiplier));
    sl = round8(entry * (1 + slMultiplier));
  }

  // 7. Calculate timeout
  const timeoutMs = orderType === 'limit'
    ? calculateTimeout(live.volatilityPercentile)
    : null;

  // 8. Map to StrategyType
  const strategy = mapStrategy(best.ranking.strategyName);

  return {
    symbol,
    updatedAt: now,
    shouldTrade: true,
    direction,
    confidence: Math.min(1, best.score),
    suggestedEntry: entry,
    tp,
    sl,
    timeoutMs,
    orderType,
    strategy,
    timeframe: best.ranking.timeframe || '1h',
    reasoning,
  };
}

/**
 * Evaluate and save to Redis.
 */
export async function evaluateAndSave(input: EvaluatorInput): Promise<ContinuousEvaluation> {
  const evaluation = evaluate(input);
  await redisSet(MINE_KEYS.evaluation(input.symbol), evaluation, EVAL_TTL_SECONDS);
  return evaluation;
}

/**
 * Load a saved evaluation from Redis.
 */
export async function loadEvaluation(symbol: string): Promise<ContinuousEvaluation | null> {
  return redisGet<ContinuousEvaluation>(MINE_KEYS.evaluation(symbol));
}

// ─── Scoring ─────────────────────────────────────────────────

/**
 * Score how well a strategy fits current market conditions.
 * Returns 0-1 composite score.
 */
function scoreStrategy(
  ranking: BacktestStrategySummary,
  live: LiveContext,
  memory: AssetMemory | null,
): number {
  let score = 0;
  let weights = 0;

  // 1. Backtest quality (40% weight)
  const btScore = backtestScore(ranking);
  score += btScore * 0.4;
  weights += 0.4;

  // 2. Regime alignment (25% weight)
  const regimeScore = regimeAlignment(ranking, live);
  score += regimeScore * 0.25;
  weights += 0.25;

  // 3. Momentum alignment (20% weight)
  const momentumScore = momentumAlignment(live);
  score += momentumScore * 0.2;
  weights += 0.2;

  // 4. Memory-based performance (15% weight)
  if (memory) {
    const memScore = memoryScore(ranking, memory);
    score += memScore * 0.15;
    weights += 0.15;
  } else {
    // Without memory, redistribute weight to backtest
    score += btScore * 0.15;
    weights += 0.15;
  }

  return weights > 0 ? score / weights * weights : 0;
}

function backtestScore(r: BacktestStrategySummary): number {
  // Composite of WR, PF, Sharpe
  const wrScore = Math.min(1, r.winRate / 0.65); // 65% WR = perfect
  const pfScore = Math.min(1, (r.profitFactor - 1) / 1.5); // PF 2.5 = perfect
  const sharpeScore = Math.min(1, Math.max(0, r.sharpe / 2)); // Sharpe 2 = perfect
  return (wrScore * 0.4 + pfScore * 0.35 + sharpeScore * 0.25);
}

function regimeAlignment(r: BacktestStrategySummary, live: LiveContext): number {
  const regime = (live.regime ?? '').toUpperCase();
  const isTrend = regime.includes('UP') || regime.includes('DOWN') || regime.includes('BULL') || regime.includes('BEAR');
  const isRanging = regime.includes('RANG') || regime.includes('FLAT');

  const name = r.strategyName.toLowerCase();
  const isTrendStrategy = name.includes('trend') || name.includes('momentum') || name.includes('breakout');
  const isReversionStrategy = name.includes('reversion') || name.includes('mean') || name.includes('bounce');

  if (isTrend && isTrendStrategy) return 1.0;
  if (isRanging && isReversionStrategy) return 1.0;
  if (isTrend && isReversionStrategy) return 0.3;
  if (isRanging && isTrendStrategy) return 0.3;
  return 0.5; // neutral
}

function momentumAlignment(live: LiveContext): number {
  const absMomentum = Math.abs(live.momentumScore);
  // Strong momentum in either direction = good opportunity
  return Math.min(1, absMomentum / 0.4 * 0.7 + 0.3);
}

function memoryScore(r: BacktestStrategySummary, memory: AssetMemory): number {
  const perf = memory.strategyPerformance[r.strategyName];
  if (!perf || perf.trades < 3) return 0.5; // not enough data, neutral
  return Math.min(1, perf.winRate / 0.6); // 60% live WR = perfect
}

// ─── Direction Inference ─────────────────────────────────────

function inferDirection(
  live: LiveContext,
  ranking: BacktestStrategySummary,
): 'long' | 'short' | null {
  const momentum = live.momentumScore;
  const regime = (live.regime ?? '').toUpperCase();

  // Strong momentum → follow it
  if (momentum > 0.2) return 'long';
  if (momentum < -0.2) return 'short';

  // Regime-based inference
  if (regime.includes('UP') || regime.includes('BULL')) return 'long';
  if (regime.includes('DOWN') || regime.includes('BEAR')) return 'short';

  // Check active rules for bias
  const rules = live.activeRules ?? [];
  const longRules = rules.filter(r => r.directionBias === 'long' && r.matched);
  const shortRules = rules.filter(r => r.directionBias === 'short' && r.matched);
  if (longRules.length > shortRules.length) return 'long';
  if (shortRules.length > longRules.length) return 'short';

  return null; // no clear direction
}

// ─── Order Type Decision ─────────────────────────────────────

/**
 * Decide between market and limit order based on market conditions.
 * - High volatility → limit (capture better price)
 * - Strong momentum → market (don't miss the move)
 * - Near zone → limit (wait for bounce)
 */
export function decideOrderType(live: LiveContext): 'market' | 'limit' {
  const vol = live.volatilityPercentile;
  const momentum = Math.abs(live.momentumScore);

  // Very strong momentum → market (the move is happening NOW)
  if (momentum >= STRONG_MOMENTUM) return 'market';

  // High volatility with weak momentum → limit (price oscillates, get better entry)
  if (vol >= HIGH_VOL_PERCENTILE && momentum < 0.2) return 'limit';

  // Near a zone → limit (wait for the bounce)
  const nearZone = (live.nearestZones ?? []).some(z => Math.abs(z.distancePct) <= 0.01);
  if (nearZone) return 'limit';

  // Default: low vol + moderate momentum = market
  return 'market';
}

// ─── Predictive Combination Matching ─────────────────────────

/**
 * Check if current live conditions match any predictive combination.
 * Uses the same condition checks as the pattern miner / live observer.
 */
function matchPredictiveCombination(
  combinations: PredictiveCombination[],
  live: LiveContext,
): PredictiveCombination | null {
  const ind = live.indicators;
  if (!ind) return null;

  const conditionState: Record<string, boolean> = {
    'RSI<30': ind.rsi < 30,
    'RSI<40': ind.rsi < 40,
    'RSI>60': ind.rsi > 60,
    'RSI>70': ind.rsi > 70,
    'BB=BELOW_LOWER': ind.bbPosition === 'BELOW_LOWER',
    'BB=AT_LOWER': ind.bbPosition === 'AT_LOWER',
    'BB=AT_UPPER': ind.bbPosition === 'AT_UPPER',
    'BB=ABOVE_UPPER': ind.bbPosition === 'ABOVE_UPPER',
    'MACD=CROSS_UP': ind.macdHistogram > 0,
    'MACD=CROSS_DOWN': ind.macdHistogram < 0,
    'MACD=ABOVE': ind.macdHistogram > 0,
    'MACD=BELOW': ind.macdHistogram < 0,
    'ADX>25': ind.adx > 25,
    'ADX<15': ind.adx < 15,
    'STOCH<20': ind.stochK < 20,
    'STOCH>80': ind.stochK > 80,
    'REGIME=TREND_UP': (live.regime ?? '').toUpperCase().includes('UP'),
    'REGIME=TREND_DN': (live.regime ?? '').toUpperCase().includes('DOWN'),
    'REGIME=RANGING': (live.regime ?? '').toUpperCase().includes('RANG'),
    'TREND_S=UP': live.momentumScore > 0.15,
    'TREND_S=DOWN': live.momentumScore < -0.15,
    'TREND_M=UP': live.momentumScore > 0.1,
    'TREND_M=DOWN': live.momentumScore < -0.1,
    'TREND_L=UP': live.momentumScore > 0.05,
    'TREND_L=DOWN': live.momentumScore < -0.05,
    'VOL=CLIMAX': live.volatilityPercentile > 95,
    'VOL=HIGH': live.volatilityPercentile > 75,
    'VOL=DRY': live.volatilityPercentile < 20,
  };

  for (const combo of combinations) {
    const allMatch = combo.conditions.every(c => conditionState[c] === true);
    if (allMatch) return combo;
  }

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────

function calculateTimeout(volatilityPercentile: number): number {
  if (volatilityPercentile < 30) return LIMIT_TIMEOUT_MS.low;
  if (volatilityPercentile < 70) return LIMIT_TIMEOUT_MS.normal;
  return LIMIT_TIMEOUT_MS.high;
}

function mapStrategy(name: string): StrategyType {
  const lower = name.toLowerCase();
  if (lower.includes('trend') || lower.includes('momentum')) return 'trend';
  if (lower.includes('reversion') || lower.includes('mean') || lower.includes('bounce')) return 'reversion';
  if (lower.includes('breakout')) return 'breakout';
  return 'trend'; // default
}

function noTrade(symbol: string, now: number, reasoning: string[]): ContinuousEvaluation {
  return {
    symbol,
    updatedAt: now,
    shouldTrade: false,
    direction: null,
    confidence: 0,
    suggestedEntry: null,
    tp: null,
    sl: null,
    timeoutMs: null,
    orderType: 'market',
    strategy: 'trend',
    timeframe: '1h',
    reasoning,
  };
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

// Export for testing
export const _internals = {
  scoreStrategy,
  backtestScore,
  regimeAlignment,
  momentumAlignment,
  memoryScore,
  inferDirection,
  decideOrderType,
  calculateTimeout,
  mapStrategy,
  matchPredictiveCombination,
  profileToTier,
};
