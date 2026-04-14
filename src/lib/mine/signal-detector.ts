// ═══════════════════════════════════════════════════════════════
// Phase 5 — Signal Detector (REWRITE)
//
// Generates entry signals from ALL available sources:
// 1. AIC signals (strongest — from Python backtester)
// 2. Active mined rules (from live context)
// 3. Trend/momentum detection (from indicators)
// 4. Zone bounce (from reaction zones)
//
// MUCH more aggressive than Phase 4 version:
// - Lower thresholds (crypto moves fast, opportunities are brief)
// - Confidence properly normalized to 0-1 scale
// - AIC signals used directly (highest priority)
// ═══════════════════════════════════════════════════════════════

import type { DetectedSignal, EntrySignal, StrategyType } from './types';
import type { LiveContext, AnalyticReport, NewsDigest, MacroEvent, StrategyFit } from '@/lib/analytics/types';
import type { AICSignal } from './types';
import { MACRO_BLACKOUT_MS } from './constants';
import { getLatestSignal, getConfluence, isAICHealthy } from './aic-client';

// ─── Input ────────────────────────────────────────────────────

export interface SignalDetectorInput {
  symbol: string;
  live: LiveContext;
  report: AnalyticReport;
  news: NewsDigest | null;
  macroEvents: MacroEvent[];
  activeMineDirections: ('long' | 'short')[];
}

// ─── Helpers ──────────────────────────────────────────────────

function isMacroBlackout(events: MacroEvent[], now = Date.now()): boolean {
  return events.some(e => e.importance === 'high' && e.scheduledAt > now && e.scheduledAt - now < MACRO_BLACKOUT_MS);
}

// Phase 6: tighter TP/SL for realistic profit (was 2.5/1.5)
function suggestTPSL(direction: 'long' | 'short', price: number, tpPct = 1.8, slPct = 1.0): { tp: number; sl: number } {
  if (direction === 'long') {
    return { tp: price * (1 + tpPct / 100), sl: price * (1 - slPct / 100) };
  }
  return { tp: price * (1 - tpPct / 100), sl: price * (1 + slPct / 100) };
}

// ─── Signal 1: AIC Direct Signal ──────────────────────────────

async function detectAICSignal(input: SignalDetectorInput): Promise<DetectedSignal | null> {
  const { symbol, live } = input;
  try {
    if (!symbol.includes('/')) return null; // AIC only for crypto
    const healthy = await isAICHealthy(symbol);
    if (!healthy) return null;

    const sig = await getLatestSignal(symbol);
    if (!sig || !sig.action) return null;

    const direction: 'long' | 'short' = sig.action === 'LONG' ? 'long' : 'short';
    let confidence = sig.confidence ?? 0.5;

    // Boost/penalize by confluence alignment
    const confluence = await getConfluence(symbol);
    if (confluence) {
      const bias = confluence.bias;
      if ((bias === 'BULLISH' && direction === 'long') || (bias === 'BEARISH' && direction === 'short')) {
        confidence = Math.min(1, confidence + 0.1);
      } else if ((bias === 'BULLISH' && direction === 'short') || (bias === 'BEARISH' && direction === 'long')) {
        confidence = Math.max(0, confidence - 0.15);
      }
    }

    // Use AIC TP/SL if valid, otherwise calculate from current price
    let { tp, sl } = sig.TP && sig.SL
      ? { tp: sig.TP[0], sl: sig.SL }
      : suggestTPSL(direction, live.price);

    // Validate TP/SL direction — AIC signals can be stale with wrong prices
    if (direction === 'long' && (tp <= live.price || sl >= live.price)) {
      ({ tp, sl } = suggestTPSL('long', live.price));
    }
    if (direction === 'short' && (tp >= live.price || sl <= live.price)) {
      ({ tp, sl } = suggestTPSL('short', live.price));
    }

    return {
      symbol,
      signal: { type: 'pattern_match', confidence, sourcePattern: sig.setup_name ?? 'aic_signal', newsSentiment: 0, macroClear: !isMacroBlackout(input.macroEvents) },
      suggestedStrategy: 'trend',
      suggestedTimeframe: '1h',
      suggestedDirection: direction,
      suggestedTp: tp,
      suggestedSl: sl,
    };
  } catch { return null; }
}

// ─── Signal 2: Active Mined Rules ─────────────────────────────

function detectActiveRules(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  const rules = (live.activeRules ?? []).filter(r => r.matched);
  if (rules.length === 0) return null;

  // Best rule by confidence (normalize: values are 0-100 integers, map to 0-1)
  const best = rules.sort((a, b) => b.confidence - a.confidence)[0];
  const normalizedConf = Math.min(1, best.confidence / 100);

  if (normalizedConf < 0.3) return null; // Very low, skip

  const direction = best.directionBias === 'neutral' ? 'long' : best.directionBias;
  const { tp, sl } = suggestTPSL(direction, price);

  return {
    symbol,
    signal: { type: 'pattern_match', confidence: normalizedConf, sourcePattern: best.ruleId, newsSentiment: 0, macroClear: !isMacroBlackout(input.macroEvents) },
    suggestedStrategy: 'trend',
    suggestedTimeframe: report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

// ─── Signal 3: Trend/Momentum ─────────────────────────────────

function detectTrend(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  const momentum = live.momentumScore ?? 0;
  // Lowered threshold: 0.15 instead of 0.3
  if (Math.abs(momentum) < 0.15) return null;

  const regime = (live.regime ?? '').toUpperCase();
  // Momentum must agree with regime (or be strong enough on its own)
  const regimeUp = regime.includes('UP') || regime.includes('BULL');
  const regimeDown = regime.includes('DOWN') || regime.includes('BEAR');
  const isUp = (regimeUp && momentum > 0) || momentum > 0.25;
  const isDown = (regimeDown && momentum < 0) || momentum < -0.25;

  if (!isUp && !isDown) return null;

  const direction: 'long' | 'short' = isUp ? 'long' : 'short';
  // Confidence from momentum strength
  const confidence = Math.min(0.85, 0.4 + Math.abs(momentum) * 0.6);
  const { tp, sl } = suggestTPSL(direction, price);

  return {
    symbol,
    signal: { type: 'trend_continuation', confidence, newsSentiment: 0, macroClear: !isMacroBlackout(input.macroEvents) },
    suggestedStrategy: 'trend',
    suggestedTimeframe: report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

// ─── Signal 4: Zone Bounce ────────────────────────────────────

function detectZoneBounce(input: SignalDetectorInput): DetectedSignal | null {
  const { symbol, live, report } = input;
  const price = live.price;
  if (!price || price <= 0) return null;

  // Increased distance: 3% instead of 2%
  const zone = (live.nearestZones ?? []).find(z => Math.abs(z.distancePct) <= 0.03 && z.pBounce >= 0.5);
  if (!zone) return null;

  const direction: 'long' | 'short' = zone.type === 'support' ? 'long' : 'short';
  const confidence = Math.min(0.9, zone.pBounce * 0.85 + 0.1);
  const { tp, sl } = suggestTPSL(direction, price);

  return {
    symbol,
    signal: { type: 'zone_bounce', confidence, sourceZone: zone.level, newsSentiment: 0, macroClear: !isMacroBlackout(input.macroEvents) },
    suggestedStrategy: 'reversion',
    suggestedTimeframe: report.recommendedTimeframe ?? '1h',
    suggestedDirection: direction,
    suggestedTp: tp,
    suggestedSl: sl,
  };
}

// ─── Filters ──────────────────────────────────────────────────

function applyFilters(signals: (DetectedSignal | null)[], input: SignalDetectorInput): DetectedSignal[] {
  const valid: DetectedSignal[] = [];
  for (const sig of signals) {
    if (!sig) continue;
    // Macro blackout: skip (but don't discard AIC signals if very confident)
    if (!sig.signal.macroClear && sig.signal.confidence < 0.8) continue;
    // Conflicting direction with existing mine
    const conflict = input.activeMineDirections.some(d => d !== sig.suggestedDirection);
    if (conflict) continue;
    valid.push(sig);
  }
  return valid;
}

// ─── Main ─────────────────────────────────────────────────────

export async function detectSignals(input: SignalDetectorInput): Promise<DetectedSignal[]> {
  const [aicSignal, ...rest] = await Promise.all([
    detectAICSignal(input),
    Promise.resolve(detectActiveRules(input)),
    Promise.resolve(detectTrend(input)),
    Promise.resolve(detectZoneBounce(input)),
  ]);

  const allSignals = [aicSignal, ...rest];
  const filtered = applyFilters(allSignals, input);
  return filtered.sort((a, b) => b.signal.confidence - a.signal.confidence);
}

// Export for testing
export const _internals = { detectAICSignal, detectActiveRules, detectTrend, detectZoneBounce, isMacroBlackout, applyFilters };
