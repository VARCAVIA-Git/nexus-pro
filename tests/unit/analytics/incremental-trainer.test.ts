import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MinedRule } from '@/lib/analytics/types';

const store = new Map<string, any>();
const setMembers = new Set<string>();

vi.mock('@/lib/db/redis', () => ({
  async redisGet(k: string) {
    return store.get(k) ?? null;
  },
  async redisSet(k: string, v: any) {
    store.set(k, v);
  },
  async redisDel(k: string) {
    store.delete(k);
  },
  async redisSMembers() {
    return Array.from(setMembers);
  },
  async redisLPush() {
    return 1;
  },
  async redisRPop() {
    return null;
  },
  async redisLRange() {
    return [];
  },
}));

// Stub data-collector to avoid network
let mockHistory: any = { '15m': [], '1h': [], '4h': [], '1d': [] };
vi.mock('@/lib/research/deep-mapping/data-collector', () => ({
  async downloadCompleteHistory() {
    return mockHistory;
  },
}));

vi.mock('@/lib/research/deep-mapping/candle-analyzer', () => ({
  analyzeAllCandles: (candles: any[]) =>
    candles.length >= 50
      ? candles.slice(50).map((c, i) => ({
          index: i,
          date: c.date,
          rsi14: 50,
          futureRet24h: i % 2 === 0 ? 0.01 : -0.01,
        }))
      : [],
}));

vi.mock('@/lib/research/deep-mapping/pattern-miner', () => ({
  minePatterns: () => [
    { id: 'NEW1', conditions: ['RSI<30'], direction: 'BUY', occurrences: 30, winRate: 65, avgReturn: 1.2, wilsonLB: 60, wilson: 65, edgeScore: 1 },
    { id: 'EXISTING', conditions: ['RSI>70'], direction: 'SELL', occurrences: 25, winRate: 60, avgReturn: -0.8, wilsonLB: 55, wilson: 60, edgeScore: 1 },
  ],
}));

beforeEach(() => {
  store.clear();
  setMembers.clear();
  mockHistory = { '15m': [], '1h': [], '4h': [], '1d': [] };
});

describe('mergeRulesIncremental', () => {
  it('keeps existing rule when re-mined, applies new stats', async () => {
    const { mergeRulesIncremental } = await import('@/lib/analytics/incremental-trainer');
    const existing: MinedRule[] = [
      { id: 'EXISTING', conditions: ['RSI>70'], direction: 'short', occurrences: 20, winRate: 55, avgReturn: -0.5, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 1440, confidenceScore: 70 },
    ];
    const fresh = [
      { id: 'EXISTING', conditions: ['RSI>70'], direction: 'SELL' as const, occurrences: 25, winRate: 60, avgReturn: -0.8, wilson: 60 },
    ];
    const m = mergeRulesIncremental(existing, fresh);
    expect(m.added).toBe(0);
    expect(m.removed).toBe(0);
    expect(m.rules.find((r) => r.id === 'EXISTING')?.confidenceScore).toBe(60);
  });

  it('decays rules not present in fresh mining', async () => {
    const { mergeRulesIncremental } = await import('@/lib/analytics/incremental-trainer');
    const existing: MinedRule[] = [
      { id: 'OLD', conditions: ['RSI>70'], direction: 'short', occurrences: 20, winRate: 55, avgReturn: -0.5, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 1440, confidenceScore: 80 },
    ];
    const m = mergeRulesIncremental(existing, []);
    expect(m.decayed).toBe(1);
    expect(m.rules.find((r) => r.id === 'OLD')?.confidenceScore).toBe(72); // 80 * 0.9
  });

  it('removes decayed rules below 30 confidence', async () => {
    const { mergeRulesIncremental } = await import('@/lib/analytics/incremental-trainer');
    const existing: MinedRule[] = [
      { id: 'WEAK', conditions: ['x'], direction: 'long', occurrences: 10, winRate: 30, avgReturn: 0, avgWin: 0, avgLoss: 0, expectedHoldingMinutes: 0, confidenceScore: 32 },
    ];
    const m = mergeRulesIncremental(existing, []);
    // 32 * 0.9 = 28.8 → round 29 < 30 → removed
    expect(m.removed).toBe(1);
    expect(m.rules.find((r) => r.id === 'WEAK')).toBeUndefined();
  });

  it('adds new rules from fresh that did not exist', async () => {
    const { mergeRulesIncremental } = await import('@/lib/analytics/incremental-trainer');
    const fresh = [
      { id: 'BRAND_NEW', conditions: ['RSI<40'], direction: 'BUY' as const, occurrences: 30, winRate: 65, avgReturn: 1.5, wilson: 70 },
    ];
    const m = mergeRulesIncremental([], fresh);
    expect(m.added).toBe(1);
    expect(m.rules[0].id).toBe('BRAND_NEW');
    expect(m.rules[0].direction).toBe('long');
  });
});

describe('runIncrementalTrain', () => {
  it('skips when no report exists', async () => {
    const { runIncrementalTrain } = await import('@/lib/analytics/incremental-trainer');
    const r = await runIncrementalTrain('UNKNOWN');
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('no-report');
  });

  it('skips when not enough new candles', async () => {
    store.set('nexus:analytic:report:BTC/USD', {
      symbol: 'BTC/USD',
      generatedAt: Date.now(),
      datasetCoverage: { timeframes: ['1h'], candleCounts: { '1h': 100 }, rangeStart: 0, rangeEnd: 0, lastCandleTimestamp: Date.now() },
      globalStats: {} as any,
      topRules: [],
      reactionZones: [],
      indicatorReactivity: {},
      strategyFit: [],
      recommendedOperationMode: 'intraday',
      recommendedTimeframe: '1h',
      eventReactivity: [],
    });
    // Mock history con 0 nuove candele
    mockHistory = { '15m': [], '1h': [{ date: new Date(Date.now() - 86400000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], '4h': [], '1d': [] };
    const { runIncrementalTrain } = await import('@/lib/analytics/incremental-trainer');
    const r = await runIncrementalTrain('BTC/USD');
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('not-enough-new-candles');
  });
});

describe('scheduleAutoRetrain', () => {
  it('schedules full retrain after 7 days', async () => {
    setMembers.add('BTC/USD');
    store.set('nexus:analytic:BTC/USD', {
      symbol: 'BTC/USD',
      assetClass: 'crypto',
      status: 'ready',
      createdAt: Date.now() - 30 * 86400000,
      lastTrainedAt: Date.now() - 8 * 86400000,
      lastObservedAt: null,
      nextScheduledRefresh: null,
      trainingJobId: null,
      failureCount: 0,
      reportVersion: 1,
    });

    // Mock enqueue
    vi.doMock('@/lib/analytics/analytic-queue', () => ({
      enqueue: vi.fn(async () => ({ position: 1, etaSeconds: 60 })),
    }));

    const { scheduleAutoRetrain } = await import('@/lib/analytics/incremental-trainer');
    const r = await scheduleAutoRetrain();
    expect(r.scheduled).toBe('BTC/USD');
    expect(r.reason).toBe('full-7d');
  });
});
