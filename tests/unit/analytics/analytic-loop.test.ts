import { describe, it, expect, beforeEach, vi } from 'vitest';

const states = new Map<string, any>();
const setMembers = new Set<string>();
const observed: string[] = [];

vi.mock('@/lib/db/redis', () => {
  return {
    async redisGet(key: string) {
      return states.get(key) ?? null;
    },
    async redisSet(key: string, value: any) {
      states.set(key, value);
    },
    async redisDel(key: string) {
      states.delete(key);
    },
    async redisSMembers(key: string) {
      if (key === 'nexus:analytic:list') return Array.from(setMembers);
      return [];
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
    async redisLLen() {
      return 0;
    },
    async redisLRem() {
      return 0;
    },
    async redisSAdd(_k: string, m: string) {
      setMembers.add(m);
      return 1;
    },
    async redisSRem(_k: string, m: string) {
      setMembers.delete(m);
      return 1;
    },
    async redisSIsMember(_k: string, m: string) {
      return setMembers.has(m);
    },
    async redisExists() {
      return false;
    },
    async redisExpire() {
      return 1;
    },
    async redisIncr() {
      return 1;
    },
    async redisSetNX() {
      return true;
    },
    async redisGetRaw() {
      return null;
    },
    async redisSetRaw() {},
  };
});

vi.mock('@/lib/analytics/asset-analytic', () => {
  class FakeAA {
    constructor(public symbol: string) {}
    async observeLive() {
      observed.push(this.symbol);
    }
  }
  return {
    AssetAnalytic: FakeAA,
    runPipeline: vi.fn(),
  };
});

beforeEach(() => {
  states.clear();
  setMembers.clear();
  observed.length = 0;
});

describe('analytic-loop', () => {
  it('tickObservationLoop iterates only ready analytics', async () => {
    setMembers.add('BTC/USD');
    setMembers.add('ETH/USD');
    setMembers.add('SOL/USD');
    states.set('nexus:analytic:BTC/USD', { symbol: 'BTC/USD', assetClass: 'crypto', status: 'ready' });
    states.set('nexus:analytic:ETH/USD', { symbol: 'ETH/USD', assetClass: 'crypto', status: 'training' });
    states.set('nexus:analytic:SOL/USD', { symbol: 'SOL/USD', assetClass: 'crypto', status: 'ready' });

    const { tickObservationLoop } = await import('@/lib/analytics/analytic-loop');
    const n = await tickObservationLoop();
    expect(n).toBe(2);
    expect(observed.sort()).toEqual(['BTC/USD', 'SOL/USD']);
  });

  it('tickObservationLoop returns 0 when list is empty', async () => {
    const { tickObservationLoop } = await import('@/lib/analytics/analytic-loop');
    const n = await tickObservationLoop();
    expect(n).toBe(0);
  });

  it('tickQueueWorker delegates to processNext', async () => {
    const { tickQueueWorker } = await import('@/lib/analytics/analytic-loop');
    // queue mock returns null → processNext → false
    const ok = await tickQueueWorker();
    expect(ok).toBe(false);
  });
});
