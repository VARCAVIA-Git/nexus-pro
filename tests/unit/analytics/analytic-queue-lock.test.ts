import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake Redis
const store = new Map<string, string>();

vi.mock('@/lib/db/redis', () => ({
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
  },
  async redisGetRaw(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  },
  async redisSetNX(key: string, value: string): Promise<boolean> {
    if (store.has(key)) return false;
    store.set(key, value);
    return true;
  },
  async redisLPush() { return 1; },
  async redisRPop() { return null; },
  async redisLRange() { return []; },
  async redisLLen() { return 0; },
  async redisLRem() { return 0; },
  async redisSAdd() { return 1; },
  async redisSRem() { return 1; },
  async redisSMembers() { return []; },
}));

beforeEach(() => {
  store.clear();
});

describe('analytic-queue lock primitives — Phase 4 hardening', () => {
  it('acquireLock returns a token when free', async () => {
    const { acquireLock, LOCK_TTL_SECONDS } = await import('@/lib/analytics/analytic-queue');
    expect(LOCK_TTL_SECONDS).toBe(600);
    const token = await acquireLock('cron');
    expect(token).not.toBeNull();
    // The stored value is JSON of the same string (because redisSetNX stores
    // the raw string, and redisGetRaw returns it back).
    expect(store.get('nexus:analytic:lock')).toBe(token);
  });

  it('releaseLock clears the lock when token matches', async () => {
    const { acquireLock, releaseLock } = await import('@/lib/analytics/analytic-queue');
    const token = (await acquireLock('cron'))!;
    expect(store.has('nexus:analytic:lock')).toBe(true);
    await releaseLock(token);
    expect(store.has('nexus:analytic:lock')).toBe(false);
  });

  it('releaseLock with wrong token does NOT clear', async () => {
    const { acquireLock, releaseLock } = await import('@/lib/analytics/analytic-queue');
    await acquireLock('cron');
    await releaseLock('not-the-real-token');
    expect(store.has('nexus:analytic:lock')).toBe(true);
  });

  it('acquireLock returns null when a fresh lock already exists', async () => {
    const { acquireLock } = await import('@/lib/analytics/analytic-queue');
    const t1 = await acquireLock('cron');
    expect(t1).not.toBeNull();
    const t2 = await acquireLock('cron');
    expect(t2).toBeNull();
  });

  it('acquireLock auto-releases stale lock (lockedAt > TTL ago) and re-acquires', async () => {
    const { acquireLock, LOCK_TTL_SECONDS } = await import('@/lib/analytics/analytic-queue');
    // Pre-populate a stale lock (lockedAt 20 min ago, TTL is 10 min)
    const staleValue = JSON.stringify({
      owner: 'cron',
      lockedAt: Date.now() - (LOCK_TTL_SECONDS + 600) * 1000,
    });
    store.set('nexus:analytic:lock', staleValue);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await acquireLock('cron');
    expect(token).not.toBeNull();
    // The lock has been replaced with a fresh one
    expect(store.get('nexus:analytic:lock')).toBe(token);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('acquireLock auto-releases legacy-format lock (raw uuid string)', async () => {
    const { acquireLock } = await import('@/lib/analytics/analytic-queue');
    // Phase 2 wrote uuid strings, not JSON. The new acquire must accept and clear them.
    store.set('nexus:analytic:lock', 'job-1234567890-abcdef12');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await acquireLock('cron');
    expect(token).not.toBeNull();
    expect(store.get('nexus:analytic:lock')).toBe(token);
    warnSpy.mockRestore();
  });

  it('acquireLock keeps fresh lock untouched (lockedAt < TTL ago)', async () => {
    const { acquireLock, LOCK_TTL_SECONDS } = await import('@/lib/analytics/analytic-queue');
    const freshValue = JSON.stringify({
      owner: 'cron',
      lockedAt: Date.now() - (LOCK_TTL_SECONDS - 60) * 1000, // 1 min before TTL
    });
    store.set('nexus:analytic:lock', freshValue);
    const token = await acquireLock('cron');
    expect(token).toBeNull();
    expect(store.get('nexus:analytic:lock')).toBe(freshValue); // unchanged
  });

  it('lock value is JSON with owner and lockedAt fields', async () => {
    const { acquireLock } = await import('@/lib/analytics/analytic-queue');
    const token = (await acquireLock('manual'))!;
    const parsed = JSON.parse(token);
    expect(parsed.owner).toBe('manual');
    expect(typeof parsed.lockedAt).toBe('number');
    expect(parsed.lockedAt).toBeGreaterThan(0);
  });
});
