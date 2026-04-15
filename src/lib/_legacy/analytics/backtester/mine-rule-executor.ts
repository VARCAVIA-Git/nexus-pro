// ═══════════════════════════════════════════════════════════════
// Mine Rule Executor
//
// Converts mined rules (combinations of conditions like
// "RSI<30 + BB=AT_LOWER + TREND_M=UP") into executable
// Strategy objects that can be used by the backtester and bot.
//
// This bridges the gap between AI analysis (which discovers
// profitable condition combos) and the bot (which needs
// executable shouldEnter/shouldExit/calculateSize).
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators, StrategyDecision, ExitDecision, Position } from '@/types';
import type { Strategy } from '@/lib/analytics/cognition/strategies';
import type { MinedRule } from '@/lib/research/deep-mapping/pattern-miner';

// ── Condition evaluators (same logic as pattern-miner.ts) ────

type ConditionFn = (candles: OHLCV[], ind: Indicators, i: number) => boolean;

function bbPosition(candles: OHLCV[], ind: Indicators, i: number): string {
  const price = candles[i].close;
  const lower = ind.bollinger.lower[i];
  const mid = ind.bollinger.mid[i];
  const upper = ind.bollinger.upper[i];
  if (lower === null || mid === null || upper === null) return 'AT_MID';
  if (price < lower * 0.998) return 'BELOW_LOWER';
  if (price < lower * 1.005) return 'AT_LOWER';
  if (price < mid * 0.998) return 'LOWER_HALF';
  if (price < mid * 1.002) return 'AT_MID';
  if (price < upper * 0.995) return 'UPPER_HALF';
  if (price < upper * 1.002) return 'AT_UPPER';
  return 'ABOVE_UPPER';
}

function macdSignal(ind: Indicators, i: number): string {
  const h = ind.macd.histogram[i] ?? 0;
  const hPrev = ind.macd.histogram[Math.max(0, i - 1)] ?? 0;
  if (h > 0 && hPrev <= 0) return 'CROSS_UP';
  if (h < 0 && hPrev >= 0) return 'CROSS_DOWN';
  return h > 0 ? 'ABOVE' : 'BELOW';
}

function slope(candles: OHLCV[], i: number, bars: number): number {
  if (i < bars || candles[i - bars].close <= 0) return 0;
  return (candles[i].close - candles[i - bars].close) / candles[i - bars].close;
}

function trendOf(s: number): string {
  if (s > 0.015) return 'STRONG_UP';
  if (s > 0.003) return 'UP';
  if (s < -0.015) return 'STRONG_DOWN';
  if (s < -0.003) return 'DOWN';
  return 'FLAT';
}

function volumeProfile(candles: OHLCV[], ind: Indicators, i: number): string {
  const avg20 = ind.volume.avg20[i] ?? 0;
  const vol = candles[i].volume;
  const ratio = avg20 > 0 ? vol / avg20 : 1;
  if (ratio > 2.5) return 'CLIMAX';
  if (ratio > 1.5) return 'HIGH';
  if (ratio < 0.5) return 'DRY';
  if (ratio < 0.8) return 'LOW';
  return 'NORMAL';
}

function regime(ind: Indicators, i: number, candles: OHLCV[]): string {
  const adx = ind.adx[i] ?? 0;
  const price = candles[i].close;
  const atr = ind.atr[i] ?? 0;
  const atrPct = price > 0 ? atr / price : 0;
  const s20 = slope(candles, i, 20);
  if (atrPct > 0.025) return 'VOLATILE';
  if (adx > 25 && s20 > 0.005) return 'TRENDING_UP';
  if (adx > 25 && s20 < -0.005) return 'TRENDING_DOWN';
  return 'RANGING';
}

/** Map condition ID to runtime evaluator */
const CONDITION_MAP: Record<string, ConditionFn> = {
  'RSI<30': (_c, ind, i) => ind.rsi[i] < 30,
  'RSI<40': (_c, ind, i) => ind.rsi[i] < 40,
  'RSI>60': (_c, ind, i) => ind.rsi[i] > 60,
  'RSI>70': (_c, ind, i) => ind.rsi[i] > 70,

  'BB=BELOW_LOWER': (c, ind, i) => bbPosition(c, ind, i) === 'BELOW_LOWER',
  'BB=AT_LOWER': (c, ind, i) => bbPosition(c, ind, i) === 'AT_LOWER',
  'BB=LOWER_HALF': (c, ind, i) => bbPosition(c, ind, i) === 'LOWER_HALF',
  'BB=AT_UPPER': (c, ind, i) => bbPosition(c, ind, i) === 'AT_UPPER',
  'BB=ABOVE_UPPER': (c, ind, i) => bbPosition(c, ind, i) === 'ABOVE_UPPER',

  'MACD=CROSS_UP': (_c, ind, i) => macdSignal(ind, i) === 'CROSS_UP',
  'MACD=CROSS_DOWN': (_c, ind, i) => macdSignal(ind, i) === 'CROSS_DOWN',
  'MACD=ABOVE': (_c, ind, i) => macdSignal(ind, i) === 'ABOVE',
  'MACD=BELOW': (_c, ind, i) => macdSignal(ind, i) === 'BELOW',

  'TREND_S=UP': (c, _ind, i) => { const t = trendOf(slope(c, i, 5)); return t === 'UP' || t === 'STRONG_UP'; },
  'TREND_S=DOWN': (c, _ind, i) => { const t = trendOf(slope(c, i, 5)); return t === 'DOWN' || t === 'STRONG_DOWN'; },
  'TREND_M=UP': (c, _ind, i) => { const t = trendOf(slope(c, i, 20)); return t === 'UP' || t === 'STRONG_UP'; },
  'TREND_M=DOWN': (c, _ind, i) => { const t = trendOf(slope(c, i, 20)); return t === 'DOWN' || t === 'STRONG_DOWN'; },
  'TREND_L=UP': (c, _ind, i) => { const t = trendOf(slope(c, i, 50)); return t === 'UP' || t === 'STRONG_UP'; },
  'TREND_L=DOWN': (c, _ind, i) => { const t = trendOf(slope(c, i, 50)); return t === 'DOWN' || t === 'STRONG_DOWN'; },

  'ADX>25': (_c, ind, i) => ind.adx[i] > 25,
  'ADX<15': (_c, ind, i) => ind.adx[i] < 15,

  'VOL=CLIMAX': (c, ind, i) => volumeProfile(c, ind, i) === 'CLIMAX',
  'VOL=HIGH': (c, ind, i) => volumeProfile(c, ind, i) === 'HIGH',
  'VOL=DRY': (c, ind, i) => volumeProfile(c, ind, i) === 'DRY',

  'STOCH<20': (_c, ind, i) => ind.stochastic.k[i] < 20,
  'STOCH>80': (_c, ind, i) => ind.stochastic.k[i] > 80,

  'REGIME=TREND_UP': (c, ind, i) => regime(ind, i, c) === 'TRENDING_UP',
  'REGIME=TREND_DN': (c, ind, i) => regime(ind, i, c) === 'TRENDING_DOWN',
  'REGIME=RANGING': (c, ind, i) => regime(ind, i, c) === 'RANGING',
  'REGIME=VOLATILE': (c, ind, i) => regime(ind, i, c) === 'VOLATILE',
};

// ── Strategy Builder ─────────────────────────────────────────

/**
 * Convert a mined rule into an executable Strategy object.
 * Returns null if any condition in the rule is unknown.
 */
export function buildMineRuleStrategy(rule: MinedRule): Strategy | null {
  const condFns: ConditionFn[] = [];
  for (const condId of rule.conditions) {
    const fn = CONDITION_MAP[condId];
    if (!fn) return null; // unknown condition, skip this rule
    condFns.push(fn);
  }

  const direction = rule.direction; // 'BUY' or 'SELL'
  const confidence = Math.min(0.95, (rule.wilson / 100) * 0.8 + 0.15);

  return {
    shouldEnter(candles: OHLCV[], ind: Indicators, i: number): StrategyDecision {
      if (i < 60) return { enter: false, side: 'LONG', confidence: 0 };

      // All conditions must be true
      for (const fn of condFns) {
        if (!fn(candles, ind, i)) {
          return { enter: false, side: 'LONG', confidence: 0 };
        }
      }

      return {
        enter: true,
        side: direction === 'BUY' ? 'LONG' : 'SHORT',
        confidence,
      };
    },

    shouldExit(pos: Position, candles: OHLCV[], ind: Indicators, i: number): ExitDecision {
      // Mined rules use TP/SL only (set by backtester/bot), no custom exit logic.
      // But add a safety: exit if RSI reverses hard
      const rsi = ind.rsi[i];
      if (pos.side === 'LONG' && rsi > 75) {
        return { exit: true, reason: 'mine_rule_rsi_overbought' };
      }
      if (pos.side === 'SHORT' && rsi < 25) {
        return { exit: true, reason: 'mine_rule_rsi_oversold' };
      }
      return { exit: false, reason: '' };
    },

    calculateSize(capital: number, riskPct: number, atr: number, price: number): number {
      const riskAmount = capital * (riskPct / 100);
      const stopDist = atr * 2;
      return stopDist > 0 ? Math.min(riskAmount / stopDist, capital * 0.2 / price) : 0;
    },
  };
}

/**
 * Evaluate a mined rule against current indicators (for live bot use).
 * Returns { match, direction, confidence } without needing candle history.
 */
export function evaluateMineRule(
  rule: MinedRule,
  candles: OHLCV[],
  indicators: Indicators,
  barIndex: number,
): { match: boolean; direction: 'BUY' | 'SELL'; confidence: number } {
  for (const condId of rule.conditions) {
    const fn = CONDITION_MAP[condId];
    if (!fn || !fn(candles, indicators, barIndex)) {
      return { match: false, direction: rule.direction, confidence: 0 };
    }
  }
  return {
    match: true,
    direction: rule.direction,
    confidence: Math.min(0.95, (rule.wilson / 100) * 0.8 + 0.15),
  };
}
