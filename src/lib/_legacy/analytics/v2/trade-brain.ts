// ═══════════════════════════════════════════════════════════════
// V2.0 — Trade Brain (Decision Engine + Meta-Learning)
//
// The central intelligence that combines all v2 modules:
//   1. Regime → what type of market are we in?
//   2. Distribution → what's the likely range of outcomes?
//   3. Kelly → how much to risk?
//   4. Meta → what actually worked recently?
//
// ONLY trades when:
//   - Regime is clear (>65% confidence)
//   - Distribution is asymmetric (R:R > 1.3)
//   - Kelly is positive (edge exists)
//   - Meta-learning confirms the setup works
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { LiveContext } from '@/lib/analytics/types';
import type { RegimeState, RegimeType } from './regime-detector';
import type { DistributionProfile, ConditionDistribution, TradeSetup } from './distribution-forecaster';
import type { SizingResult, PortfolioState } from './dynamic-kelly';
import { detectRegime } from './regime-detector';
import { calculateSize } from './dynamic-kelly';

// ─── Types ───────────────────────────────────────────────────

export interface TradeDecision {
  shouldTrade: boolean;
  direction: 'long' | 'short' | null;
  confidence: number;             // 0-1 composite
  setup: TradeSetup | null;
  sizing: SizingResult | null;
  regime: RegimeState;
  metaScore: number;              // meta-learning weight (0-1)
  reasoning: string[];
  // For mine placement
  entryPrice: number | null;
  tp: number | null;
  sl: number | null;
  positionSizeUsd: number;
  orderType: 'market' | 'limit';
}

export interface MetaEntry {
  conditions: string[];
  regime: RegimeType;
  direction: 'long' | 'short';
  timestamp: number;
  expectedPnlPct: number;
  actualPnlPct: number | null;    // null = still open
  wasCorrect: boolean | null;     // null = still open
}

export interface MetaState {
  entries: MetaEntry[];
  // Rolling performance per condition-set
  performance: Record<string, {
    trades: number;
    wins: number;
    avgPnlPct: number;
    lastUpdated: number;
    weight: number;               // 0-2: <1 = underperforming, >1 = outperforming
  }>;
}

// ─── Condition matching against live state ────────────────────

function matchConditionsLive(
  conditions: string[],
  live: LiveContext,
): boolean {
  const ind = live.indicators;
  if (!ind) return false;

  const state: Record<string, boolean> = {
    'RSI<30': ind.rsi < 30,
    'RSI<40': ind.rsi < 40,
    'RSI>60': ind.rsi > 60,
    'RSI>70': ind.rsi > 70,
    'BB=AT_LOWER': ind.bbPosition === 'AT_LOWER' || ind.bbPosition === 'BELOW_LOWER',
    'BB=AT_UPPER': ind.bbPosition === 'AT_UPPER' || ind.bbPosition === 'ABOVE_UPPER',
    'MACD=POSITIVE': ind.macdHistogram > 0,
    'MACD=NEGATIVE': ind.macdHistogram < 0,
    'MACD=CROSS_UP': ind.macdHistogram > 0, // approximation
    'MACD=CROSS_DOWN': ind.macdHistogram < 0,
    'ADX>25': ind.adx > 25,
    'ADX<15': ind.adx < 15,
    'STOCH<20': ind.stochK < 20,
    'STOCH>80': ind.stochK > 80,
    'TREND_UP': live.momentumScore > 0.1,
    'TREND_DOWN': live.momentumScore < -0.1,
    'VOL_HIGH': live.volatilityPercentile > 75,
    'VOL_LOW': live.volatilityPercentile < 25,
  };

  return conditions.every(c => state[c] === true);
}

// ─── Meta-Learning: weight by recent performance ─────────────

const DECAY_DAYS = 90;  // lookback window

function getMetaWeight(
  condKey: string,
  meta: MetaState | null,
): number {
  if (!meta) return 1.0; // no meta data → neutral weight
  const perf = meta.performance[condKey];
  if (!perf || perf.trades < 3) return 1.0; // not enough data
  return Math.max(0.1, Math.min(2.0, perf.weight));
}

/**
 * Update meta-learning state after a trade closes.
 */
export function updateMeta(
  meta: MetaState,
  condKey: string,
  regime: RegimeType,
  direction: 'long' | 'short',
  expectedPnlPct: number,
  actualPnlPct: number,
): MetaState {
  const wasCorrect = actualPnlPct > 0;

  // Record entry
  meta.entries.push({
    conditions: condKey.split('+'),
    regime,
    direction,
    timestamp: Date.now(),
    expectedPnlPct,
    actualPnlPct,
    wasCorrect,
  });

  // Trim to last 500 entries
  if (meta.entries.length > 500) meta.entries = meta.entries.slice(-500);

  // Update rolling performance
  const perf = meta.performance[condKey] ?? {
    trades: 0, wins: 0, avgPnlPct: 0, lastUpdated: 0, weight: 1.0,
  };

  perf.trades++;
  if (wasCorrect) perf.wins++;

  // EMA for avgPnlPct
  const alpha = 0.15;
  perf.avgPnlPct = perf.avgPnlPct * (1 - alpha) + actualPnlPct * alpha;
  perf.lastUpdated = Date.now();

  // Weight: based on recent WR and PnL
  const wr = perf.trades > 0 ? perf.wins / perf.trades : 0.5;
  perf.weight = Math.max(0.1, Math.min(2.0,
    wr * 1.5 + (perf.avgPnlPct > 0 ? 0.5 : -0.3)
  ));

  meta.performance[condKey] = perf;
  return meta;
}

export function createEmptyMeta(): MetaState {
  return { entries: [], performance: {} };
}

// ─── Main: Make trade decision ───────────────────────────────

/**
 * The brain: analyzes current conditions and decides whether to trade.
 *
 * @param candles - Recent candles for regime detection
 * @param live - Current live context (indicators, price)
 * @param profile - Distribution profile from training
 * @param portfolio - Current portfolio state
 * @param meta - Meta-learning state (optional, improves over time)
 */
export function decide(
  candles: OHLCV[],
  live: LiveContext,
  profile: DistributionProfile | null,
  portfolio: PortfolioState,
  meta: MetaState | null = null,
): TradeDecision {
  const reasoning: string[] = [];
  const price = live.price;

  const noTrade = (reason: string): TradeDecision => ({
    shouldTrade: false, direction: null, confidence: 0,
    setup: null, sizing: null, regime: detectRegime(candles),
    metaScore: 0, reasoning: [...reasoning, reason],
    entryPrice: null, tp: null, sl: null, positionSizeUsd: 0,
    orderType: 'market',
  });

  // ── 1. Regime detection ─────────────────────────────────

  const regime = detectRegime(candles);
  reasoning.push(`regime: ${regime.dominant} ${(regime.confidence * 100).toFixed(0)}% ${regime.direction}`);

  if (!regime.actionable) {
    return noTrade(`regime unclear (${(regime.confidence * 100).toFixed(0)}% < 65%)`);
  }

  // ── 2. Find matching distribution setups ────────────────

  if (!profile || profile.conditionDistributions.length === 0) {
    return noTrade('no distribution profile available');
  }

  // Find condition distributions that match current live state AND regime
  const matchingSetups: Array<ConditionDistribution & { metaWeight: number }> = [];

  for (const cd of profile.conditionDistributions) {
    // Must match current regime
    if (cd.regime !== regime.dominant) continue;

    // Must match current conditions
    if (!matchConditionsLive(cd.conditions, live)) continue;

    // Check R:R is still good
    if (cd.setup.riskReward < 1.3) continue;

    // Meta-learning weight
    const condKey = cd.conditions.join('+');
    const metaWeight = getMetaWeight(condKey, meta);

    // Skip if meta says this setup is bad
    if (metaWeight < 0.3) {
      reasoning.push(`skip ${condKey}: meta weight ${metaWeight.toFixed(2)} too low`);
      continue;
    }

    matchingSetups.push({ ...cd, metaWeight });
  }

  if (matchingSetups.length === 0) {
    return noTrade(`no matching condition+regime setups for ${regime.dominant}`);
  }

  // Pick best setup by: expectedValue × confidence × metaWeight
  matchingSetups.sort((a, b) =>
    (b.setup.expectedValuePct * b.setup.confidence * b.metaWeight) -
    (a.setup.expectedValuePct * a.setup.confidence * a.metaWeight)
  );

  const best = matchingSetups[0];
  reasoning.push(`matched: ${best.conditions.join(' + ')} ${best.direction} R:R=${best.setup.riskReward.toFixed(2)} EV=${best.setup.expectedValuePct.toFixed(3)}% meta=${best.metaWeight.toFixed(2)}`);

  // ── 3. Recalculate TP/SL at current price ───────────────

  const setup: TradeSetup = {
    ...best.setup,
    entryPrice: price,
    optimalTp: best.direction === 'long'
      ? round4(price * (1 + best.setup.tpPct / 100))
      : round4(price * (1 - best.setup.tpPct / 100)),
    optimalSl: best.direction === 'long'
      ? round4(price * (1 - best.setup.slPct / 100))
      : round4(price * (1 + best.setup.slPct / 100)),
  };

  // ── 4. Dynamic Kelly sizing ─────────────────────────────

  const sizing = calculateSize(setup, regime, portfolio);
  if (sizing.positionSizeUsd <= 0) {
    return noTrade(sizing.reason);
  }
  reasoning.push(`sizing: ${sizing.reason}`);

  // ── 5. Final confidence (composite) ─────────────────────

  const confidence = Math.min(1,
    setup.confidence * 0.4 +           // distribution quality
    regime.confidence * 0.25 +         // regime clarity
    best.metaWeight * 0.2 +            // meta confirmation
    Math.min(1, setup.riskReward / 3) * 0.15  // R:R quality
  );

  // ── 6. Order type decision ──────────────────────────────

  const momentum = Math.abs(live.momentumScore);
  const orderType = momentum > 0.3 ? 'market' : 'limit';

  return {
    shouldTrade: true,
    direction: best.direction,
    confidence: round4(confidence),
    setup,
    sizing,
    regime,
    metaScore: round4(best.metaWeight),
    reasoning,
    entryPrice: price,
    tp: setup.optimalTp,
    sl: setup.optimalSl,
    positionSizeUsd: sizing.positionSizeUsd,
    orderType,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Export for testing
export const _internals = {
  matchConditionsLive,
  getMetaWeight,
  updateMeta,
  decide,
};
