import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnalyticReport } from '@/lib/analytics/types';

const store = new Map<string, any>();

vi.mock('@/lib/db/redis', () => ({
  async redisGet(key: string) {
    return store.get(key) ?? null;
  },
  async redisSet(key: string, value: any) {
    store.set(key, value);
  },
}));

beforeEach(() => store.clear());

describe('feedback weights', () => {
  it('clampWeight bounds output 0.5..2.0', async () => {
    const { clampWeight } = await import('@/lib/analytics/feedback/feedback-tracker');
    expect(clampWeight(0.1)).toBe(0.5);
    expect(clampWeight(5)).toBe(2.0);
    expect(clampWeight(1.2)).toBe(1.2);
    expect(clampWeight(NaN)).toBe(1.0);
  });

  it('computeWeight uses ratio observed/expected', async () => {
    const { computeWeight } = await import('@/lib/analytics/feedback/feedback-tracker');
    expect(computeWeight(60, 60)).toBe(1.0);
    expect(computeWeight(80, 60)).toBeCloseTo(80 / 60, 4);
    expect(computeWeight(30, 60)).toBeCloseTo(30 / 60, 4);
    expect(computeWeight(60, 0)).toBe(1.0);
  });

  it('recordTradeOutcome accumulates trades and computes weight after 5 samples', async () => {
    const { recordTradeOutcome, loadFeedback } = await import('@/lib/analytics/feedback/feedback-tracker');
    const symbol = 'BTC/USD';
    const ruleId = 'RSI<30+BB=BELOW_LOWER';
    // Inject a fake report so weight calc has expected WR
    store.set(`nexus:analytic:report:${symbol}`, {
      symbol,
      generatedAt: 0,
      datasetCoverage: { timeframes: [], candleCounts: {}, rangeStart: 0, rangeEnd: 0 },
      globalStats: { avgReturnPerCandle: {}, volatility: {}, maxGainObserved: 0, maxLossObserved: 0, bestRegimeForLong: '', bestRegimeForShort: '' },
      topRules: [{ id: ruleId, conditions: [], direction: 'long', occurrences: 50, winRate: 60, avgReturn: 1, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 0, confidenceScore: 70 }],
      reactionZones: [],
      indicatorReactivity: {},
      strategyFit: [],
      recommendedOperationMode: 'intraday',
      recommendedTimeframe: '1h',
      eventReactivity: [],
    });

    // 6 trades: 5 wins, 1 loss → wr 83% > expected 60% → weight ≈ 1.39
    for (let i = 0; i < 5; i++) await recordTradeOutcome(symbol, ruleId, 1, true);
    await recordTradeOutcome(symbol, ruleId, -1, false);

    const stats = await loadFeedback(symbol);
    expect(stats.totalTrades).toBe(6);
    expect(stats.wins).toBe(5);
    expect(stats.losses).toBe(1);
    const score = stats.ruleScores[ruleId];
    expect(score.trades).toBe(6);
    expect(score.weight).toBeGreaterThan(1.0);
    expect(score.weight).toBeLessThanOrEqual(2.0);
  });

  it('applyFeedbackWeights reorders topRules by weighted score', async () => {
    const { applyFeedbackWeights } = await import('@/lib/analytics/feedback/feedback-tracker');
    const report: AnalyticReport = {
      symbol: 'X',
      generatedAt: 0,
      datasetCoverage: { timeframes: [], candleCounts: {}, rangeStart: 0, rangeEnd: 0 },
      globalStats: { avgReturnPerCandle: {}, volatility: {}, maxGainObserved: 0, maxLossObserved: 0, bestRegimeForLong: '', bestRegimeForShort: '' },
      topRules: [
        { id: 'A', conditions: [], direction: 'long', occurrences: 10, winRate: 60, avgReturn: 1, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 0, confidenceScore: 80 },
        { id: 'B', conditions: [], direction: 'long', occurrences: 10, winRate: 60, avgReturn: 1, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 0, confidenceScore: 70 },
      ],
      reactionZones: [],
      indicatorReactivity: {},
      strategyFit: [],
      recommendedOperationMode: 'intraday',
      recommendedTimeframe: '1h',
      eventReactivity: [],
    };
    const out = applyFeedbackWeights(report, {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      lastUpdated: 0,
      ruleScores: {
        A: { weight: 0.5, trades: 10, wr: 30 },
        B: { weight: 2.0, trades: 10, wr: 90 },
      },
    });
    // B (70 × 2.0 = 140) deve precedere A (80 × 0.5 = 40)
    expect(out.topRules[0].id).toBe('B');
    expect(out.topRules[1].id).toBe('A');
  });
});
