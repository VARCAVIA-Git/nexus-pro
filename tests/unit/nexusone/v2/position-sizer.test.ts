import { describe, it, expect } from 'vitest';
import { calculatePositionSize, SIZING } from '@/lib/nexusone/risk/position-sizer';

describe('position-sizer', () => {
  it('zero when stop distance is non-positive', () => {
    const out = calculatePositionSize({
      equity: 10_000, currentExposure: 0,
      entryPrice: 100, stopLoss: 100,
      historicalWinRate: 0.55, avgWinLossRatio: 1.5,
    });
    expect(out.notionalUsd).toBe(0);
    expect(out.reason).toMatch(/stop/);
  });

  it('caps at 25% of equity', () => {
    const out = calculatePositionSize({
      equity: 10_000, currentExposure: 0,
      entryPrice: 100, stopLoss: 99,
      historicalWinRate: 0.9, avgWinLossRatio: 10, // huge Kelly
    });
    expect(out.notionalUsd).toBeLessThanOrEqual(10_000 * SIZING.MAX_POSITION_PCT + 0.01);
  });

  it('risks at most 1.5% of equity per trade', () => {
    const out = calculatePositionSize({
      equity: 10_000, currentExposure: 0,
      entryPrice: 100, stopLoss: 95,
      historicalWinRate: 0.55, avgWinLossRatio: 1.5,
    });
    expect(out.riskUsd).toBeLessThanOrEqual(10_000 * SIZING.MAX_RISK_PER_TRADE + 0.01);
  });

  it('respects the 80% portfolio exposure cap', () => {
    const out = calculatePositionSize({
      equity: 10_000, currentExposure: 9_000,
      entryPrice: 100, stopLoss: 95,
      historicalWinRate: 0.55, avgWinLossRatio: 1.5,
    });
    // Only 1k of room under 80% cap.
    expect(out.notionalUsd).toBeLessThanOrEqual(1_000 + 0.01);
  });

  it('halves when sizingMultiplier=0.5', () => {
    const base = calculatePositionSize({
      equity: 10_000, currentExposure: 0,
      entryPrice: 100, stopLoss: 98,
      historicalWinRate: 0.55, avgWinLossRatio: 1.5,
    });
    const half = calculatePositionSize({
      equity: 10_000, currentExposure: 0,
      entryPrice: 100, stopLoss: 98,
      historicalWinRate: 0.55, avgWinLossRatio: 1.5, sizingMultiplier: 0.5,
    });
    expect(half.notionalUsd).toBeLessThan(base.notionalUsd);
  });
});
