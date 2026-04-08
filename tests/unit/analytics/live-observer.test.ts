import { describe, it, expect } from 'vitest';
import { evalCondition, matchTopRules, findNearestZones } from '@/lib/analytics/live-observer';
import type { MinedRule, ReactionZone } from '@/lib/analytics/types';

const baseCtx = {
  rsi: 50,
  bbPosition: 'AT_MID',
  macdSign: 0 as -1 | 0 | 1,
  adx: 20,
  stochK: 50,
  regime: 'RANGING',
  trendShort: 'FLAT' as const,
  trendMedium: 'FLAT' as const,
  trendLong: 'FLAT' as const,
  volume: 100,
  avgVolume: 100,
};

describe('evalCondition', () => {
  it('handles RSI bounds', () => {
    expect(evalCondition('RSI<30', { ...baseCtx, rsi: 25 })).toBe(true);
    expect(evalCondition('RSI<30', { ...baseCtx, rsi: 35 })).toBe(false);
    expect(evalCondition('RSI>70', { ...baseCtx, rsi: 75 })).toBe(true);
    expect(evalCondition('RSI>70', { ...baseCtx, rsi: 65 })).toBe(false);
  });

  it('handles BB positions', () => {
    expect(evalCondition('BB=BELOW_LOWER', { ...baseCtx, bbPosition: 'BELOW_LOWER' })).toBe(true);
    expect(evalCondition('BB=BELOW_LOWER', { ...baseCtx, bbPosition: 'AT_LOWER' })).toBe(false);
  });

  it('handles regime conditions', () => {
    expect(evalCondition('REGIME=VOLATILE', { ...baseCtx, regime: 'VOLATILE' })).toBe(true);
    expect(evalCondition('REGIME=TREND_UP', { ...baseCtx, regime: 'TRENDING_UP' })).toBe(true);
    expect(evalCondition('REGIME=RANGING', { ...baseCtx, regime: 'TRENDING_UP' })).toBe(false);
  });

  it('returns false for unknown conditions', () => {
    expect(evalCondition('NONEXISTENT', baseCtx)).toBe(false);
  });
});

describe('matchTopRules', () => {
  const rules: MinedRule[] = [
    { id: 'A', conditions: ['RSI<30', 'BB=BELOW_LOWER'], direction: 'long', occurrences: 50, winRate: 70, avgReturn: 1, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 1440, confidenceScore: 80 },
    { id: 'B', conditions: ['RSI>70'], direction: 'short', occurrences: 30, winRate: 60, avgReturn: -1, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 1440, confidenceScore: 65 },
    { id: 'C', conditions: ['REGIME=VOLATILE', 'TREND_M=DOWN'], direction: 'long', occurrences: 20, winRate: 75, avgReturn: 2, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 1440, confidenceScore: 70 },
  ];

  it('returns rules whose ALL conditions match', () => {
    const ctx = { ...baseCtx, rsi: 25, bbPosition: 'BELOW_LOWER' };
    const matches = matchTopRules(rules, ctx);
    expect(matches.length).toBe(1);
    expect(matches[0].ruleId).toBe('A');
    expect(matches[0].directionBias).toBe('long');
  });

  it('returns empty when no rule matches', () => {
    const ctx = { ...baseCtx, rsi: 50 };
    const matches = matchTopRules(rules, ctx);
    expect(matches.length).toBe(0);
  });

  it('sorts matches by confidence desc', () => {
    const ctx = { ...baseCtx, rsi: 25, bbPosition: 'BELOW_LOWER', regime: 'VOLATILE', trendMedium: 'DOWN' as const };
    const matches = matchTopRules(rules, ctx);
    // Both A (80) and C (70) match
    expect(matches.length).toBe(2);
    expect(matches[0].ruleId).toBe('A');
    expect(matches[1].ruleId).toBe('C');
  });
});

describe('findNearestZones', () => {
  const zones: ReactionZone[] = [
    { priceLevel: 100, type: 'support', strength: 80, touchCount: 10, bounceProbability: 0.7, breakoutProbability: 0.3, avgBounceMagnitude: 1, avgBreakoutMagnitude: 1, validUntil: 0 },
    { priceLevel: 105, type: 'resistance', strength: 70, touchCount: 8, bounceProbability: 0.6, breakoutProbability: 0.4, avgBounceMagnitude: 1, avgBreakoutMagnitude: 1, validUntil: 0 },
    { priceLevel: 200, type: 'resistance', strength: 50, touchCount: 5, bounceProbability: 0.5, breakoutProbability: 0.5, avgBounceMagnitude: 1, avgBreakoutMagnitude: 1, validUntil: 0 },
  ];

  it('returns zones within distance threshold', () => {
    const found = findNearestZones(zones, 102, 3, 0.05);
    expect(found.length).toBe(2);
    // Far zone (200) is excluded
    expect(found.some((z) => z.level === 200)).toBe(false);
  });

  it('respects max count', () => {
    const found = findNearestZones(zones, 102, 1, 0.05);
    expect(found.length).toBe(1);
  });

  it('returns empty when nothing within range', () => {
    const found = findNearestZones(zones, 1000, 3, 0.05);
    expect(found.length).toBe(0);
  });
});
