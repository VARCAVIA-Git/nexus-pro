import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock env vars
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.AIC_BTC_URL = 'http://localhost:8080';
  process.env.AIC_ETH_URL = 'http://localhost:8081';
  process.env.AIC_SECRET_TOKEN = '';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

import {
  getAICStatus,
  isAICHealthy,
  getLatestSignal,
  getActiveSignals,
  getConfluence,
  getRegime,
  getResearch,
  sendFeedback,
} from '@/lib/mine/aic-client';

// ─── Mock fetch ───────────────────────────────────────────────

function mockFetchOk(data: any) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => data,
  })));
}

function mockFetchFail() {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Connection refused'); }));
}

function mockFetchStatus(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })));
}

// ─── Tests ────────────────────────────────────────────────────

describe('aic-client', () => {
  describe('getAICStatus', () => {
    it('returns status when AIC is online', async () => {
      mockFetchOk({
        status: 'online',
        symbol: 'BTC/USDT',
        price: 70000,
        confluence: { bias: 'BULLISH', score: 0.75 },
        active_tfs: ['1h', '4h'],
        ts: '2026-04-09T10:00:00Z',
      });
      const status = await getAICStatus('BTC/USD');
      expect(status).not.toBeNull();
      expect(status!.status).toBe('online');
    });

    it('returns null when AIC is down', async () => {
      mockFetchFail();
      const status = await getAICStatus('BTC/USD');
      expect(status).toBeNull();
    });

    it('returns null for unsupported symbol', async () => {
      const status = await getAICStatus('DOGE/USD');
      expect(status).toBeNull();
    });
  });

  describe('isAICHealthy', () => {
    it('returns true when online', async () => {
      mockFetchOk({ status: 'online' });
      expect(await isAICHealthy('BTC/USD')).toBe(true);
    });

    it('returns false when down', async () => {
      mockFetchFail();
      expect(await isAICHealthy('BTC/USD')).toBe(false);
    });
  });

  describe('getLatestSignal', () => {
    it('returns signal from AIC', async () => {
      mockFetchOk({
        action: 'LONG',
        entry: 68420.5,
        TP: [69100, 70250, 72000],
        SL: 67300,
        timeout_minutes: 45,
        confidence: 0.81,
        'expected_profit_%': 2.65,
        setup_name: 'RSI_MACD_Volume_4h',
      });
      const signal = await getLatestSignal('BTC/USD');
      expect(signal).not.toBeNull();
      expect(signal!.action).toBe('LONG');
      expect(signal!.confidence).toBe(0.81);
      expect(signal!.setup_name).toBe('RSI_MACD_Volume_4h');
    });

    it('returns null on 404', async () => {
      mockFetchStatus(404);
      expect(await getLatestSignal('BTC/USD')).toBeNull();
    });
  });

  describe('getActiveSignals', () => {
    it('returns array of signals', async () => {
      mockFetchOk([
        { action: 'LONG', confidence: 0.8, setup_name: 'setup1' },
        { action: 'SHORT', confidence: 0.6, setup_name: 'setup2' },
      ]);
      const signals = await getActiveSignals('BTC/USD');
      expect(signals).toHaveLength(2);
    });

    it('returns empty array on error', async () => {
      mockFetchFail();
      expect(await getActiveSignals('BTC/USD')).toEqual([]);
    });
  });

  describe('getConfluence', () => {
    it('returns confluence data', async () => {
      mockFetchOk({
        confluence: { bias: 'BULLISH', score: 0.78, aligned_count: 3 },
      });
      const conf = await getConfluence('BTC/USD');
      expect(conf).not.toBeNull();
      expect(conf!.bias).toBe('BULLISH');
    });
  });

  describe('getRegime', () => {
    it('returns regime data', async () => {
      mockFetchOk({ regime: 'BULL', confidence: 0.85 });
      const regime = await getRegime('BTC/USD');
      expect(regime!.regime).toBe('BULL');
    });
  });

  describe('getResearch', () => {
    it('returns research data', async () => {
      mockFetchOk({
        funding_rate_current: 0.012,
        funding_sentiment: 'NEUTRAL',
        fear_greed_index: 62,
      });
      const research = await getResearch('BTC/USD');
      expect(research!.fear_greed_index).toBe(62);
    });
  });

  describe('sendFeedback', () => {
    it('sends feedback successfully', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
      const result = await sendFeedback('BTC/USD', {
        mineId: 'mine-1',
        symbol: 'BTC/USD',
        strategy: 'trend',
        timeframe: '4h',
        direction: 'long',
        entryPrice: 70000,
        exitPrice: 73000,
        pnlPct: 4.28,
        outcome: 'tp_hit',
        durationHours: 12,
        entrySignal: { type: 'pattern_match', confidence: 0.8, macroClear: true },
        closedAt: Date.now(),
        setup_name: 'RSI_MACD_Volume_4h',
        original_confidence: 0.81,
        regime_at_entry: 'BULL',
        confluence_at_entry: 0.78,
      });
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetchFail();
      const result = await sendFeedback('BTC/USD', {
        mineId: 'mine-1', symbol: 'BTC/USD', strategy: 'trend',
        timeframe: '4h', direction: 'long', entryPrice: 70000,
        exitPrice: 73000, pnlPct: 4.28, outcome: 'tp_hit',
        durationHours: 12, closedAt: Date.now(),
        entrySignal: { type: 'pattern_match', confidence: 0.8, macroClear: true },
        setup_name: 'test', original_confidence: 0.8,
      });
      expect(result).toBe(false);
    });
  });
});
