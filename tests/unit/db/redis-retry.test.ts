import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let nextResults: any[] = [];
let attemptCount = 0;

beforeEach(() => {
  nextResults = [];
  attemptCount = 0;
  process.env.UPSTASH_REDIS_REST_URL = 'http://test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setupFetchSequence(seq: Array<{ type: 'ok' | 'error'; data?: any; err?: Error }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      attemptCount++;
      const next = seq.shift();
      if (!next) throw new Error('no-more-fetch-mock');
      if (next.type === 'error') throw next.err ?? new Error('socket hang up');
      return {
        ok: true,
        json: async () => ({ result: next.data ?? null }),
      } as any;
    }),
  );
}

describe('redis retry helpers', () => {
  it('retries on socket hang up and eventually succeeds', async () => {
    setupFetchSequence([
      { type: 'error', err: new Error('socket hang up') },
      { type: 'error', err: new Error('socket hang up') },
      { type: 'ok', data: 'PONG' },
    ]);
    const { redisPing } = await import('@/lib/db/redis');
    const ok = await redisPing();
    expect(ok).toBe(true);
    expect(attemptCount).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    setupFetchSequence([
      { type: 'error', err: new Error('socket hang up') },
      { type: 'error', err: new Error('socket hang up') },
      { type: 'error', err: new Error('socket hang up') },
    ]);
    // Cattura il warn per non sporcare l'output del test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { redisGet } = await import('@/lib/db/redis');
    const v = await redisGet('foo').catch((e) => `ERR:${e.message}`);
    expect(String(v)).toContain('socket hang up');
    expect(attemptCount).toBe(3);
    warnSpy.mockRestore();
  });

  it('does NOT retry on non-transient errors (HTTP 500)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ result: null }),
      }) as any),
    );
    const { redisGet } = await import('@/lib/db/redis');
    const r = await redisGet('foo').catch((e) => e.message);
    expect(String(r)).toContain('Redis error 500');
    // 1 sola chiamata, niente retry
    expect((globalThis.fetch as any).mock.calls.length).toBe(1);
  });
});
