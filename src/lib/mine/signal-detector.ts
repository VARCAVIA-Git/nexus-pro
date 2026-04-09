// ═══════════════════════════════════════════════════════════════
// Phase 4 — Signal Detector
//
// Runs every mine-tick. Reads live context + analytics + news +
// macro and produces DetectedSignal[] for the Decision Engine.
//
// Signal types:
//   zone_bounce       — price near support/resistance with high pBounce
//   trend_continuation — aligned trends + momentum confirmation
//   breakout_confirm  — price breaking key zone with volume
//   pattern_match     — active mined rule matching current conditions
// ═══════════════════════════════════════════════════════════════

import type {
  DetectedSignal,
  EntrySignal,
  StrategyType,
} from './types';
import type {
  LiveContext,
  AnalyticReport,
  NewsDigest,
  MacroEvent,
  MinedRule,
  ReactionZone,
  StrategyFit,
} from '@/lib/analytics/types';
import { MACRO_BLACKOUT_MS } from './constants';

// ─── Input ────────────────────────────────────────────────────

export interface SignalDetectorInput {
  symbol: string;
  live: LiveContext;
  report: AnalyticReport;
  news: NewsDigest | null;
  macroEvents: MacroEvent[];
  activeMineDirections: ('long' | 'short')[]; // directions of open mines for this asset
}

// ─── Thresholds ───────────────────────────────────────────────

const ZONE_DISTANCE_PCT = 0.02;      // within 2% of zone level
const ZONE_MIN_PBOUNCE = 0.6;        // minimum bounce probability
const TREND_MOMENTUM_THRESHOLD = 0.3; // |momentum| > 0.3 for trend signal
const BREAKOUT_MOMENTUM_THRESHOLD = 0.5;
const PATTERN_MIN_CONFIDENCE = 0.3;   // minimum activeRule confidence

// ─── Helpers ──────────────────────────────────────────────────

function isMacroBlackout(events: MacroEvent[], now: number = Date.now()): boolean {
  return events.some(
    (e) =>
      e.importance === 'high' &&
      e.scheduledAt > now &&
      e.scheduledAt - now < MACRO_BLACKOUT_MS,
  );
}

function newsSentiment(news: NewsDigest | null): number {
  return news?.avgSentiment ?? 0;
}

function findBestStrategyFit(
  fits: StrategyFit[],
  strategy: StrategyType,
): StrategyFit | null {
  const matching = (fits ?? []).filter(
    (f) => f?.strategyName?.toLowerCase().includes(strategy),
  );
  if (matching.length === 0) return null;
  return matching.sort((a, b) => (b.profitFactor ?? 0) - (a.profitFactor ?? 0))[0];
}

function suggestTPSL(
  direction: 'long' | 'short',
  currentPrice: number,
  fit: StrategyFit | null,
  nearestTarget: number | null,
): { tp: number; sl: number } {
  // Use strategy fit avg metrics or fallback to 3% TP / 2% SL
  const avgWinPct = fit ? Math.abs(fit.avgReturn ?? 0) * 2 : 3;
  const avgLossPct = fit ? Math.abs(fit.maxDrawdown ?? 2) * 0.5 : 2;
  const tpPct = Math.max(1.5, avgWinPct) / 100;
  const slPct = Math.max(0.5, avgLossPct) / 100;

  if (direction === 'long') {
    const tp = nearestTarget ? Math.max(nearestTarget, currentPrice * (1 + tpPct)) : currentPrice * (1 + tpPct);
    const sl = currentPrice * (1 - slPct);
    return { tp, sl };
  }
  const tp = nearestTarget ? Math.min(nearestTarget, currentPrice * (1 - tpPct)) : currentPrice * (1 - tpPct);
  const sl = currentPrice * (1 + slPct);
  return { tp, sl };
}

// ─── Signal Detectors ─────────────────────────────────────────

function detectZoneBounce(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  // Find nearest zone within threshold
  const zone = (live.nearestZones ?? []).find(
    (z) => Math.abs(z.distancePct) <= ZONE_DISTANCE_PCT && z.pBounce >= ZONE_MIN_PBOUNCE,
  );
  if (!zone) return null;

  const direction: 'long' | 'short' = zone.type === 'support' ? 'long' : 'short';
  const confidence = zone.pBounce * 0.8; // scale down slightly
  const fit = findBestStrategyFit(report.strategyFit ?? [], 'reversion');
  const nearestTarget = findNearestTargetZone(live, direction);
  const { tp, sl } = suggestTPSL(direction, price, fit, nearestTarget);

  return {
    symbol,
    signal: {
      type: 'zone_bounce',
      confidence,
      sourceZone: zone.level,
      newsSentiment: newsSentiment(input.news),
      macroClear: !isMacroBlackout(input.macroEvents),
    },
    suggestedStrategy: 'reversion',
    suggestedTimeframe: fit?.timeframe ?? report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

function detectTrendContinuation(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  const momentum = live.momentumScore ?? 0;
  if (Math.abs(momentum) < TREND_MOMENTUM_THRESHOLD) return null;

  const regime = (live.regime ?? '').toUpperCase();
  const isTrendingUp = regime.includes('UP') || regime.includes('BULL');
  const isTrendingDown = regime.includes('DOWN') || regime.includes('BEAR');

  if (!isTrendingUp && !isTrendingDown) return null;

  // Momentum must align with regime
  if (isTrendingUp && momentum < TREND_MOMENTUM_THRESHOLD) return null;
  if (isTrendingDown && momentum > -TREND_MOMENTUM_THRESHOLD) return null;

  const direction: 'long' | 'short' = isTrendingUp ? 'long' : 'short';
  const confidence = Math.min(1, Math.abs(momentum) * 0.9);
  const fit = findBestStrategyFit(report.strategyFit ?? [], 'trend');
  const nearestTarget = findNearestTargetZone(live, direction);
  const { tp, sl } = suggestTPSL(direction, price, fit, nearestTarget);

  return {
    symbol,
    signal: {
      type: 'trend_continuation',
      confidence,
      newsSentiment: newsSentiment(input.news),
      macroClear: !isMacroBlackout(input.macroEvents),
    },
    suggestedStrategy: 'trend',
    suggestedTimeframe: fit?.timeframe ?? report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

function detectBreakout(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  const momentum = live.momentumScore ?? 0;
  if (Math.abs(momentum) < BREAKOUT_MOMENTUM_THRESHOLD) return null;

  // Look for a resistance zone that price has just broken above, or support broken below
  const brokenResistance = (live.nearestZones ?? []).find(
    (z) => z.type === 'resistance' && z.distancePct > 0 && z.distancePct < 0.01,
  );
  const brokenSupport = (live.nearestZones ?? []).find(
    (z) => z.type === 'support' && z.distancePct < 0 && z.distancePct > -0.01,
  );

  if (!brokenResistance && !brokenSupport) return null;

  const direction: 'long' | 'short' = brokenResistance ? 'long' : 'short';
  const confidence = Math.min(1, Math.abs(momentum) * 0.85);
  const fit = findBestStrategyFit(report.strategyFit ?? [], 'breakout');
  const { tp, sl } = suggestTPSL(direction, price, fit, null);

  return {
    symbol,
    signal: {
      type: 'breakout_confirm',
      confidence,
      sourceZone: brokenResistance?.level ?? brokenSupport?.level,
      newsSentiment: newsSentiment(input.news),
      macroClear: !isMacroBlackout(input.macroEvents),
    },
    suggestedStrategy: 'breakout',
    suggestedTimeframe: fit?.timeframe ?? report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

function detectPatternMatch(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  // Use activeRules from live context (already matched by live-observer)
  const bestRule = (live.activeRules ?? [])
    .filter((r) => r.matched && r.confidence >= PATTERN_MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!bestRule) return null;

  const direction = bestRule.directionBias === 'neutral' ? 'long' : bestRule.directionBias;
  const fit = findBestStrategyFit(report.strategyFit ?? [], 'trend');
  const nearestTarget = findNearestTargetZone(live, direction);
  const { tp, sl } = suggestTPSL(direction, price, fit, nearestTarget);

  return {
    symbol,
    signal: {
      type: 'pattern_match',
      confidence: bestRule.confidence,
      sourcePattern: bestRule.ruleId,
      newsSentiment: newsSentiment(input.news),
      macroClear: !isMacroBlackout(input.macroEvents),
    },
    suggestedStrategy: 'trend',
    suggestedTimeframe: report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

// ─── Helpers (private) ────────────────────────────────────────

function findNearestTargetZone(
  live: LiveContext,
  direction: 'long' | 'short',
): number | null {
  const zones = live.nearestZones ?? [];
  const targetType = direction === 'long' ? 'resistance' : 'support';
  const targets = zones
    .filter((z) => z.type === targetType)
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
  return targets[0]?.level ?? null;
}

// ─── Filters ──────────────────────────────────────────────────

function applyFilters(
  signals: (DetectedSignal | null)[],
  input: SignalDetectorInput,
): DetectedSignal[] {
  const valid: DetectedSignal[] = [];

  for (const sig of signals) {
    if (!sig) continue;

    // Filter: macro blackout reduces confidence to 0 (discard)
    if (!sig.signal.macroClear) continue;

    // Filter: very negative news → skip long signals, very positive → skip short
    const sentiment = sig.signal.newsSentiment ?? 0;
    if (sig.suggestedDirection === 'long' && sentiment < -0.4) continue;
    if (sig.suggestedDirection === 'short' && sentiment > 0.4) continue;

    // Filter: conflicting mine (same asset, opposite direction)
    const hasConflict = input.activeMineDirections.some(
      (d) => d !== sig.suggestedDirection,
    );
    if (hasConflict) continue;

    valid.push(sig);
  }

  return valid;
}

// ─── Main ─────────────────────────────────────────────────────

/**
 * Detect all valid entry signals for a given asset.
 * Returns signals sorted by confidence (highest first).
 */
export function detectSignals(input: SignalDetectorInput): DetectedSignal[] {
  const raw = [
    detectZoneBounce(input),
    detectTrendContinuation(input),
    detectBreakout(input),
    detectPatternMatch(input),
  ];

  const filtered = applyFilters(raw, input);
  return filtered.sort((a, b) => b.signal.confidence - a.signal.confidence);
}

// Export individual detectors for testing
export const _internals = {
  detectZoneBounce,
  detectTrendContinuation,
  detectBreakout,
  detectPatternMatch,
  isMacroBlackout,
  applyFilters,
};
