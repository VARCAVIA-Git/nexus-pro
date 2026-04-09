import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Redis ───────────────────────────────────────────────

const kv = new Map<string, any>();
const sets = new Map<string, Set<string>>();
const lists = new Map<string, any[]>();

vi.mock('@/lib/db/redis', () => ({
  async redisSet(key: string, value: unknown) { kv.set(key, JSON.parse(JSON.stringify(value))); },
  async redisGet<T>(key: string): Promise<T | null> { return kv.get(key) ?? null; },
  async redisDel(key: string) { kv.delete(key); },
  async redisSAdd(key: string, member: string) {
    if (!sets.has(key)) sets.set(key, new Set());
    sets.get(key)!.add(member);
    return 1;
  },
  async redisSRem(key: string, member: string) {
    sets.get(key)?.delete(member);
    return 1;
  },
  async redisSMembers(key: string) { return [...(sets.get(key) ?? [])]; },
  async redisLpush(key: string, value: unknown, maxLen = 500) {
    if (!lists.has(key)) lists.set(key, []);
    const l = lists.get(key)!;
    l.unshift(JSON.parse(JSON.stringify(value)));
    while (l.length > maxLen) l.pop();
  },
  async redisLrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const l = lists.get(key) ?? [];
    return l.slice(start, stop + 1) as T[];
  },
  async redisGetRaw(key: string) { return kv.get(key) ?? null; },
  async redisSetRaw(key: string, value: string) { kv.set(key, value); },
}));

// ─── Mock execution ───────────────────────────────────────────

vi.mock('@/lib/mine/execution', () => ({
  async placeMarketOrder() {
    return { success: true, orderId: 'ord-test', filledPrice: 70000, filledQty: 0.01, status: 'filled', error: null };
  },
  async closePosition() {
    return { success: true, orderId: 'ord-exit', filledPrice: 73000, filledQty: 0.01, status: 'filled', error: null };
  },
  async getAccountInfo() {
    return { equity: 100000, buyingPower: 80000, cash: 90000 };
  },
  async getOrderStatus(orderId: string) {
    return { id: orderId, status: 'filled', filledPrice: 70000, filledQty: 0.01 };
  },
}));

import { executeMineeTick } from '@/lib/mine/mine-tick';
import type { DataLoaders } from '@/lib/mine/mine-tick';
import { setEngineEnabled, createMine, updateMine } from '@/lib/mine/mine-store';
import type { LiveContext, AnalyticReport, NewsDigest, MacroEvent } from '@/lib/analytics/types';

// ─── Helpers ──────────────────────────────────────────────────

function mockLoaders(overrides: Partial<DataLoaders> = {}): DataLoaders {
  return {
    loadLiveContext: vi.fn(async (): Promise<LiveContext> => ({
      updatedAt: Date.now(),
      price: 70000,
      regime: 'RANGING',
      activeRules: [],
      nearestZones: [],
      momentumScore: 0,
      volatilityPercentile: 50,
    })),
    loadReport: vi.fn(async (): Promise<AnalyticReport> => ({
      symbol: 'BTC/USD',
      generatedAt: Date.now(),
      datasetCoverage: { timeframes: ['1h'], candleCounts: {}, rangeStart: 0, rangeEnd: 0, lastCandleTimestamp: 0 },
      globalStats: {} as any,
      topRules: [],
      reactionZones: [],
      indicatorReactivity: {},
      strategyFit: [],
      recommendedOperationMode: 'intraday',
      recommendedTimeframe: '1h',
      eventReactivity: [],
    })),
    loadNews: vi.fn(async () => null),
    loadMacroEvents: vi.fn(async () => []),
    ...overrides,
  };
}

beforeEach(() => {
  kv.clear();
  sets.clear();
  lists.clear();
});

// ─── Tests ────────────────────────────────────────────────────

describe('mine-tick orchestrator', () => {
  it('returns skipped when engine disabled', async () => {
    const result = await executeMineeTick(mockLoaders());
    expect(result.enabled).toBe(false);
    expect(result.skipped).toBe('engine-disabled');
  });

  it('runs full tick when engine enabled with no signals', async () => {
    await setEngineEnabled(true);
    const result = await executeMineeTick(mockLoaders());
    expect(result.enabled).toBe(true);
    expect(result.monitored).toBe(0);
    expect(result.signalsDetected).toBe(0);
    expect(result.actionsExecuted).toBe(0);
    expect(result.elapsedMs).toBeLessThan(5000);
  });

  it('opens mine when signal detected (zone bounce)', async () => {
    await setEngineEnabled(true);
    kv.set('nexus:config:profile', 'aggressive'); // lower confidence threshold

    const loaders = mockLoaders({
      loadLiveContext: vi.fn(async () => ({
        updatedAt: Date.now(),
        price: 70000,
        regime: 'RANGING',
        activeRules: [],
        nearestZones: [
          { level: 69200, type: 'support' as const, distancePct: -0.011, pBounce: 0.8 },
        ],
        momentumScore: 0,
        volatilityPercentile: 50,
      })),
      loadReport: vi.fn(async () => ({
        symbol: 'BTC/USD',
        generatedAt: Date.now(),
        datasetCoverage: { timeframes: ['1h'], candleCounts: {}, rangeStart: 0, rangeEnd: 0, lastCandleTimestamp: 0 },
        globalStats: {} as any,
        topRules: [],
        reactionZones: [],
        indicatorReactivity: {},
        strategyFit: [{ strategyName: 'reversion', timeframe: '1h', totalTrades: 50, winRate: 0.6, avgReturn: 2, profitFactor: 1.8, sharpe: 1, maxDrawdown: 5, rank: 1 }],
        recommendedOperationMode: 'intraday' as const,
        recommendedTimeframe: '1h' as const,
        eventReactivity: [],
      })),
    });

    const result = await executeMineeTick(loaders);
    expect(result.enabled).toBe(true);
    // Signal detected for at least BTC/USD (since all 3 symbols get same mock)
    expect(result.signalsDetected).toBeGreaterThan(0);
  });

  it('closes mine when TP is hit', async () => {
    await setEngineEnabled(true);

    // Create a mine that has hit its TP
    const mine = await createMine({
      symbol: 'BTC/USD',
      status: 'open',
      strategy: 'reversion',
      timeframe: '1h',
      direction: 'long',
      entrySignal: { type: 'zone_bounce', confidence: 0.7, macroClear: true },
      entryPrice: 70000,
      entryTime: Date.now() - 3600_000,
      entryOrderId: 'ord-1',
      takeProfit: 72000,
      stopLoss: 68000,
      trailingStopPct: null,
      timeoutHours: 48,
      profile: 'moderate',
      allocatedCapital: 2000,
      quantity: 0.01,
      unrealizedPnl: 0,
      maxUnrealizedPnl: 0,
      ticksMonitored: 5,
      lastCheck: Date.now(),
      exitPrice: null,
      exitTime: null,
      exitOrderId: null,
      outcome: null,
      realizedPnl: null,
      notes: [],
    });

    const loaders = mockLoaders({
      loadLiveContext: vi.fn(async () => ({
        updatedAt: Date.now(),
        price: 73000, // above TP of 72000
        regime: 'TRENDING_UP',
        activeRules: [],
        nearestZones: [],
        momentumScore: 0.5,
        volatilityPercentile: 60,
      })),
    });

    const result = await executeMineeTick(loaders);
    expect(result.monitored).toBe(1);
    expect(result.actionsExecuted).toBeGreaterThanOrEqual(1);
  });

  it('completes tick in under 2s with mocks', async () => {
    await setEngineEnabled(true);
    const start = Date.now();
    await executeMineeTick(mockLoaders());
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
