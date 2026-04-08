import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake Redis used by the mocked db module.
const store = new Map<string, string>();
const lists = new Map<string, string[]>();
const sets = new Map<string, Set<string>>();

function reset() {
  store.clear();
  lists.clear();
  sets.clear();
}

vi.mock('@/lib/db/redis', () => {
  return {
    async redisGet<T>(key: string): Promise<T | null> {
      const v = store.get(key);
      if (v === undefined) return null;
      try {
        return JSON.parse(v) as T;
      } catch {
        return null;
      }
    },
    async redisSet(key: string, value: unknown) {
      store.set(key, JSON.stringify(value));
    },
    async redisDel(key: string) {
      store.delete(key);
      lists.delete(key);
      sets.delete(key);
    },
    async redisLPush(key: string, value: string) {
      const arr = lists.get(key) ?? [];
      arr.unshift(value);
      lists.set(key, arr);
      return arr.length;
    },
    async redisRPop(key: string) {
      const arr = lists.get(key);
      if (!arr || arr.length === 0) return null;
      return arr.pop() ?? null;
    },
    async redisLRange(key: string, start: number, stop: number) {
      const arr = lists.get(key) ?? [];
      const end = stop === -1 ? arr.length : stop + 1;
      return arr.slice(start, end);
    },
    async redisLLen(key: string) {
      return (lists.get(key) ?? []).length;
    },
    async redisLRem(key: string, count: number, value: string) {
      const arr = lists.get(key);
      if (!arr) return 0;
      const filtered = arr.filter((v) => v !== value);
      lists.set(key, filtered);
      return arr.length - filtered.length;
    },
    async redisSAdd(key: string, member: string) {
      const s = sets.get(key) ?? new Set<string>();
      const had = s.has(member);
      s.add(member);
      sets.set(key, s);
      return had ? 0 : 1;
    },
    async redisSRem(key: string, member: string) {
      const s = sets.get(key);
      if (!s) return 0;
      return s.delete(member) ? 1 : 0;
    },
    async redisSMembers(key: string) {
      return Array.from(sets.get(key) ?? []);
    },
    async redisSIsMember(key: string, member: string) {
      return sets.get(key)?.has(member) ?? false;
    },
    async redisExists(key: string) {
      return store.has(key) || lists.has(key) || sets.has(key);
    },
    async redisExpire() {
      return 1;
    },
    async redisIncr(key: string) {
      const cur = parseInt(store.get(key) ?? '0', 10);
      const next = cur + 1;
      store.set(key, String(next));
      return next;
    },
    async redisSetNX(key: string, value: string) {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    async redisGetRaw(key: string) {
      return store.get(key) ?? null;
    },
    async redisSetRaw(key: string, value: string) {
      store.set(key, value);
    },
  };
});

// Avoid pulling the full pipeline (heavy imports). Stub asset-analytic so processNext
// doesn't need real data-collector + computeIndicators trees.
vi.mock('@/lib/analytics/asset-analytic', () => {
  return {
    runPipeline: vi.fn(async (symbol: string) => {
      // Simulate "training done"
      const k = `nexus:analytic:${symbol}`;
      const cur = store.get(k);
      if (cur) {
        const s = JSON.parse(cur);
        s.status = 'ready';
        s.lastTrainedAt = Date.now();
        store.set(k, JSON.stringify(s));
      }
    }),
    AssetAnalytic: class {},
  };
});

beforeEach(() => {
  reset();
});

describe('analytic-queue', () => {
  it('enqueue is idempotent', async () => {
    const { enqueue } = await import('@/lib/analytics/analytic-queue');
    const a = await enqueue('BTC/USD', 'crypto');
    const b = await enqueue('BTC/USD', 'crypto');
    expect(a.position).toBeGreaterThan(0);
    // seconda enqueue restituisce posizione esistente, non ne pusha un'altra
    const items = lists.get('nexus:analytic:queue') ?? [];
    expect(items.filter((s) => s === 'BTC/USD').length).toBe(1);
    expect(b.position).toBeGreaterThan(0);
  });

  it('enqueue marks state queued and adds to list', async () => {
    const { enqueue } = await import('@/lib/analytics/analytic-queue');
    await enqueue('ETH/USD', 'crypto');
    const state = JSON.parse(store.get('nexus:analytic:ETH/USD')!);
    expect(state.status).toBe('queued');
    expect(state.assetClass).toBe('crypto');
    expect(sets.get('nexus:analytic:list')?.has('ETH/USD')).toBe(true);
  });

  it('processNext returns false when queue empty', async () => {
    const { processNext } = await import('@/lib/analytics/analytic-queue');
    const r = await processNext();
    expect(r).toBe(false);
  });

  it('processNext acquires lock and processes one job', async () => {
    const { enqueue, processNext } = await import('@/lib/analytics/analytic-queue');
    await enqueue('SOL/USD', 'crypto');
    const ok = await processNext();
    expect(ok).toBe(true);

    // After processing, the runPipeline mock marked state as ready
    const state = JSON.parse(store.get('nexus:analytic:SOL/USD')!);
    expect(state.status).toBe('ready');
    // Lock has been released
    expect(store.has('nexus:analytic:lock')).toBe(false);
  });

  it('processNext refuses concurrent execution (lock held)', async () => {
    const { enqueue, processNext } = await import('@/lib/analytics/analytic-queue');
    await enqueue('AVAX/USD', 'crypto');
    // Hold the lock
    store.set('nexus:analytic:lock', 'other-job');
    const ok = await processNext();
    expect(ok).toBe(false);
    // Queue is still intact
    expect(lists.get('nexus:analytic:queue')).toEqual(['AVAX/USD']);
  });

  it('updateJobProgress writes phase + progress to job key', async () => {
    const { enqueue, updateJobProgress, getJobStatus } = await import(
      '@/lib/analytics/analytic-queue'
    );
    await enqueue('BTC/USD', 'crypto');
    await updateJobProgress('BTC/USD', 'mining', 60, 'Mining 1234/4060');
    const job = await getJobStatus('BTC/USD');
    expect(job?.phase).toBe('mining');
    expect(job?.progress).toBe(60);
    expect(job?.message).toMatch(/Mining/);
  });

  it('markFailed updates state to failed and increments counter', async () => {
    const { enqueue, markFailed } = await import('@/lib/analytics/analytic-queue');
    await enqueue('LINK/USD', 'crypto');
    await markFailed('LINK/USD', new Error('boom'));
    const state = JSON.parse(store.get('nexus:analytic:LINK/USD')!);
    expect(state.status).toBe('failed');
    expect(state.failureCount).toBe(1);
  });

  it('resetStuck clears stale queued entries older than 2h', async () => {
    const { enqueue, resetStuck } = await import('@/lib/analytics/analytic-queue');
    await enqueue('BTC/USD', 'crypto');
    // Force createdAt 3h ago
    const k = 'nexus:analytic:BTC/USD';
    const s = JSON.parse(store.get(k)!);
    s.createdAt = Date.now() - 3 * 60 * 60 * 1000;
    s.lastTrainedAt = null;
    s.status = 'queued';
    store.set(k, JSON.stringify(s));

    const cleaned = await resetStuck();
    expect(cleaned).toBe(1);
    expect(store.has(k)).toBe(false);
    expect(sets.get('nexus:analytic:list')?.has('BTC/USD')).toBe(false);
  });

  it('resetStuck keeps fresh queued entries', async () => {
    const { enqueue, resetStuck } = await import('@/lib/analytics/analytic-queue');
    await enqueue('ETH/USD', 'crypto');
    // createdAt is now (recent)
    const cleaned = await resetStuck();
    expect(cleaned).toBe(0);
    expect(store.has('nexus:analytic:ETH/USD')).toBe(true);
  });
});
