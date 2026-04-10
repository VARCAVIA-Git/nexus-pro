import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis before importing
vi.mock('@/lib/db/redis', () => ({
  redisGet: vi.fn(),
}));

import { getAlpacaKeys } from '@/lib/broker/alpaca-keys';
import { redisGet } from '@/lib/db/redis';

const mockRedisGet = redisGet as ReturnType<typeof vi.fn>;

describe('getAlpacaKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear env vars
    delete process.env.ALPACA_LIVE_API_KEY;
    delete process.env.ALPACA_LIVE_SECRET_KEY;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
  });

  it('returns env live keys when available', async () => {
    process.env.ALPACA_LIVE_API_KEY = 'AK_LIVE';
    process.env.ALPACA_LIVE_SECRET_KEY = 'SK_LIVE';
    const result = await getAlpacaKeys();
    expect(result).toEqual({
      key: 'AK_LIVE',
      secret: 'SK_LIVE',
      baseUrl: 'https://api.alpaca.markets',
      mode: 'live',
    });
    expect(mockRedisGet).not.toHaveBeenCalled();
  });

  it('falls back to Redis keys when env live not set', async () => {
    mockRedisGet.mockResolvedValue({ liveKey: 'AK_REDIS', liveSecret: 'SK_REDIS', liveEnabled: true });
    const result = await getAlpacaKeys();
    expect(result).toEqual({
      key: 'AK_REDIS',
      secret: 'SK_REDIS',
      baseUrl: 'https://api.alpaca.markets',
      mode: 'live',
    });
  });

  it('skips Redis if liveEnabled is false', async () => {
    mockRedisGet.mockResolvedValue({ liveKey: 'AK_REDIS', liveSecret: 'SK_REDIS', liveEnabled: false });
    process.env.ALPACA_API_KEY = 'PK_PAPER';
    process.env.ALPACA_API_SECRET = 'SK_PAPER';
    const result = await getAlpacaKeys();
    expect(result?.mode).toBe('paper');
  });

  it('falls back to paper keys when no live available', async () => {
    mockRedisGet.mockResolvedValue(null);
    process.env.ALPACA_API_KEY = 'PK_PAPER';
    process.env.ALPACA_API_SECRET = 'SK_PAPER';
    const result = await getAlpacaKeys();
    expect(result).toEqual({
      key: 'PK_PAPER',
      secret: 'SK_PAPER',
      baseUrl: 'https://paper-api.alpaca.markets',
      mode: 'paper',
    });
  });

  it('returns null when no keys available', async () => {
    mockRedisGet.mockResolvedValue(null);
    const result = await getAlpacaKeys();
    expect(result).toBeNull();
  });

  it('handles Redis error gracefully', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis down'));
    process.env.ALPACA_API_KEY = 'PK_PAPER';
    process.env.ALPACA_API_SECRET = 'SK_PAPER';
    const result = await getAlpacaKeys();
    expect(result?.mode).toBe('paper');
  });
});
