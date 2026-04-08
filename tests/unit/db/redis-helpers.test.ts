import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch BEFORE importing the module under test
const fetchCalls: { body: any; result: any }[] = [];
let nextResults: any[] = [];

beforeEach(() => {
  fetchCalls.length = 0;
  nextResults = [];
  process.env.UPSTASH_REDIS_REST_URL = 'http://test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      const result = nextResults.shift();
      fetchCalls.push({ body, result });
      return {
        ok: true,
        json: async () => ({ result }),
      } as any;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function queueResult(r: any) {
  nextResults.push(r);
}

describe('redis helpers — Phase 2 additions', () => {
  it('redisLPush forwards LPUSH command', async () => {
    queueResult(3);
    const { redisLPush } = await import('@/lib/db/redis');
    const len = await redisLPush('q', 'BTC/USD');
    expect(len).toBe(3);
    expect(fetchCalls[0].body).toEqual(['LPUSH', 'q', 'BTC/USD']);
  });

  it('redisRPop returns null when empty', async () => {
    queueResult(null);
    const { redisRPop } = await import('@/lib/db/redis');
    const item = await redisRPop('q');
    expect(item).toBeNull();
    expect(fetchCalls[0].body).toEqual(['RPOP', 'q']);
  });

  it('redisRPop returns the popped value', async () => {
    queueResult('ETH/USD');
    const { redisRPop } = await import('@/lib/db/redis');
    const item = await redisRPop('q');
    expect(item).toBe('ETH/USD');
  });

  it('redisLRange returns array of strings', async () => {
    queueResult(['a', 'b', 'c']);
    const { redisLRange } = await import('@/lib/db/redis');
    const arr = await redisLRange('q', 0, -1);
    expect(arr).toEqual(['a', 'b', 'c']);
    expect(fetchCalls[0].body).toEqual(['LRANGE', 'q', '0', '-1']);
  });

  it('redisLLen returns 0 when nothing', async () => {
    queueResult(null);
    const { redisLLen } = await import('@/lib/db/redis');
    expect(await redisLLen('q')).toBe(0);
  });

  it('redisLRem forwards count + value', async () => {
    queueResult(1);
    const { redisLRem } = await import('@/lib/db/redis');
    const removed = await redisLRem('q', 0, 'BTC');
    expect(removed).toBe(1);
    expect(fetchCalls[0].body).toEqual(['LREM', 'q', '0', 'BTC']);
  });

  it('redisSAdd / redisSMembers / redisSIsMember', async () => {
    queueResult(1);
    queueResult(['BTC', 'ETH']);
    queueResult(1);
    queueResult(0);

    const { redisSAdd, redisSMembers, redisSIsMember } = await import('@/lib/db/redis');
    expect(await redisSAdd('s', 'BTC')).toBe(1);
    expect(await redisSMembers('s')).toEqual(['BTC', 'ETH']);
    expect(await redisSIsMember('s', 'BTC')).toBe(true);
    expect(await redisSIsMember('s', 'XYZ')).toBe(false);

    expect(fetchCalls[0].body).toEqual(['SADD', 's', 'BTC']);
    expect(fetchCalls[1].body).toEqual(['SMEMBERS', 's']);
  });

  it('redisExists returns boolean', async () => {
    queueResult(1);
    queueResult(0);
    const { redisExists } = await import('@/lib/db/redis');
    expect(await redisExists('foo')).toBe(true);
    expect(await redisExists('bar')).toBe(false);
  });

  it('redisSetNX returns true on OK', async () => {
    queueResult('OK');
    const { redisSetNX } = await import('@/lib/db/redis');
    const ok = await redisSetNX('lock', 'job-1', 60);
    expect(ok).toBe(true);
    expect(fetchCalls[0].body).toEqual(['SET', 'lock', 'job-1', 'NX', 'EX', '60']);
  });

  it('redisSetNX returns false when not OK', async () => {
    queueResult(null);
    const { redisSetNX } = await import('@/lib/db/redis');
    expect(await redisSetNX('lock', 'job', 60)).toBe(false);
  });

  it('redisIncr returns counter', async () => {
    queueResult(7);
    const { redisIncr } = await import('@/lib/db/redis');
    expect(await redisIncr('cnt')).toBe(7);
    expect(fetchCalls[0].body).toEqual(['INCR', 'cnt']);
  });

  it('redisGetRaw / redisSetRaw bypass JSON', async () => {
    queueResult(null);
    queueResult('hello');
    const { redisSetRaw, redisGetRaw } = await import('@/lib/db/redis');
    await redisSetRaw('k', 'hello');
    const v = await redisGetRaw('k');
    expect(v).toBe('hello');
    expect(fetchCalls[0].body).toEqual(['SET', 'k', 'hello']);
  });
});
