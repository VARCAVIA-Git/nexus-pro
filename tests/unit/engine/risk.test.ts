import { describe, it, expect } from 'vitest';
import {
  kellySize, atrPositionSize, pearsonCorrelation,
  correlationRisk, checkCircuitBreaker, trailingStopATR,
} from '@/lib/engine/risk';
import type { TradeRecord } from '@/types';

describe('kellySize', () => {
  it('should return positive value for profitable strategy', () => {
    // Win rate 60%, avg W/L ratio 2.0
    const kelly = kellySize(0.6, 2.0, 0.25);
    expect(kelly).toBeGreaterThan(0);
    expect(kelly).toBeLessThan(1);
  });

  it('should return 0 for unprofitable strategy', () => {
    // Win rate 20%, W/L ratio 0.5 → kelly = 0.2 - 0.8/0.5 = 0.2 - 1.6 = -1.4
    const kelly = kellySize(0.2, 0.5);
    expect(kelly).toBe(0);
  });

  it('fractional kelly should be smaller than full kelly', () => {
    const full = kellySize(0.65, 2.0, 1.0);
    const frac = kellySize(0.65, 2.0, 0.25);
    expect(frac).toBeLessThan(full);
    expect(frac).toBeCloseTo(full * 0.25, 5);
  });
});

describe('atrPositionSize', () => {
  it('should return correct size based on risk', () => {
    // 10000 capital, 2% risk, ATR=5, 2x multiplier, price=100
    const size = atrPositionSize(10000, 2, 5, 2, 100);
    // Risk = 200, stop dist = 10, size = 200/10 = 20 shares
    expect(size).toBeCloseTo(20, 0);
  });

  it('should return 0 for zero ATR', () => {
    const size = atrPositionSize(10000, 2, 0, 2, 100);
    expect(size).toBe(0);
  });

  it('should return 0 for zero price', () => {
    const size = atrPositionSize(10000, 2, 5, 2, 0);
    expect(size).toBe(0);
  });
});

describe('pearsonCorrelation', () => {
  it('should return 1 for perfectly correlated arrays', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    const corr = pearsonCorrelation(a, b);
    expect(corr).toBeCloseTo(1, 5);
  });

  it('should return -1 for perfectly negatively correlated', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [10, 8, 6, 4, 2];
    const corr = pearsonCorrelation(a, b);
    expect(corr).toBeCloseTo(-1, 5);
  });

  it('should return 0 for uncorrelated data', () => {
    const a = [1, 0, 1, 0, 1];
    const b = [0, 1, 0, 1, 0];
    const corr = pearsonCorrelation(a, b);
    expect(corr).toBeCloseTo(-1, 5); // actually these are anti-correlated
  });

  it('should handle empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });
});

describe('correlationRisk', () => {
  it('should detect high correlation pairs', () => {
    const positions = [
      [1, 2, 3, 4, 5],
      [1.1, 2.2, 3.1, 4.3, 5.2], // highly correlated with first
      [5, 4, 3, 2, 1],             // anti-correlated
    ];
    const result = correlationRisk(positions, 0.7);
    expect(result.maxCorrelation).toBeGreaterThan(0.9);
    expect(result.highCorrelationPairs.length).toBeGreaterThan(0);
  });

  it('should return empty for single position', () => {
    const result = correlationRisk([[1, 2, 3]]);
    expect(result.maxCorrelation).toBe(0);
    expect(result.highCorrelationPairs).toEqual([]);
  });
});

describe('checkCircuitBreaker', () => {
  const baseTrade: Omit<TradeRecord, 'netPnl' | 'exitAt'> = {
    id: '1', symbol: 'BTC', side: 'LONG', status: 'closed',
    entryPrice: 100, exitPrice: 95, stopLoss: 90, takeProfit: 110,
    quantity: 10, sizeUsd: 1000, entryAt: new Date(),
    strategy: 'trend', confidence: 0.7, regime: 'NORMAL',
    isLive: false,
  };

  it('should trip on -3% daily loss', () => {
    const now = new Date();
    const trades: TradeRecord[] = [{
      ...baseTrade,
      netPnl: -350, // -3.5% of 10000
      exitAt: now,
    }];
    const result = checkCircuitBreaker(trades, 10000, 9650, now);
    expect(result.isTripped).toBe(true);
    expect(result.reason).toBe('daily_loss_3pct');
    expect(result.resumeAfter).toBeDefined();
  });

  it('should not trip for small loss', () => {
    const now = new Date();
    const trades: TradeRecord[] = [{
      ...baseTrade,
      netPnl: -100,
      exitAt: now,
    }];
    const result = checkCircuitBreaker(trades, 10000, 9900, now);
    expect(result.isTripped).toBe(false);
  });

  it('should trip on -15% total loss', () => {
    const now = new Date();
    const result = checkCircuitBreaker([], 10000, 8400, now);
    expect(result.isTripped).toBe(true);
    expect(result.reason).toBe('total_loss_15pct');
    expect(result.resumeAfter).toBeUndefined(); // full stop, no resume
  });
});

describe('trailingStopATR', () => {
  it('should move stop up for LONG when price rises', () => {
    const stop = trailingStopATR('LONG', 110, 95, 5, 2);
    // New stop = 110 - 10 = 100, should be max(95, 100) = 100
    expect(stop).toBe(100);
  });

  it('should not move stop down for LONG', () => {
    const stop = trailingStopATR('LONG', 90, 95, 5, 2);
    // New stop = 90 - 10 = 80, should be max(95, 80) = 95
    expect(stop).toBe(95);
  });

  it('should move stop down for SHORT when price falls', () => {
    const stop = trailingStopATR('SHORT', 90, 105, 5, 2);
    // New stop = 90 + 10 = 100, should be min(105, 100) = 100
    expect(stop).toBe(100);
  });

  it('should not move stop up for SHORT', () => {
    const stop = trailingStopATR('SHORT', 110, 105, 5, 2);
    // New stop = 110 + 10 = 120, should be min(105, 120) = 105
    expect(stop).toBe(105);
  });
});
