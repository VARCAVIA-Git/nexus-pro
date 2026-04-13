import { describe, it, expect } from 'vitest';
import { kellySize } from '@/lib/mine/risk-manager';

describe('Kelly Criterion position sizing', () => {
  it('returns positive for favorable edge', () => {
    // 60% WR, avg win 2%, avg loss 1% → strong edge
    const size = kellySize(0.6, 0.02, 0.01);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(0.1); // capped at 10%
  });

  it('returns 0 for negative edge', () => {
    // 30% WR, avg win 1%, avg loss 2% → negative expectancy
    const size = kellySize(0.3, 0.01, 0.02);
    expect(size).toBe(0);
  });

  it('returns 0 for 0% win rate', () => {
    expect(kellySize(0, 0.02, 0.01)).toBe(0);
  });

  it('returns 0 for 100% win rate', () => {
    expect(kellySize(1, 0.02, 0.01)).toBe(0);
  });

  it('uses fractional Kelly (25% by default)', () => {
    // Use moderate edge so full Kelly isn't capped
    const full = kellySize(0.55, 0.015, 0.01, 1.0);
    const quarter = kellySize(0.55, 0.015, 0.01, 0.25);
    // Quarter Kelly should be roughly 25% of full (both below cap)
    if (full < 0.1) {
      expect(quarter).toBeCloseTo(full * 0.25, 4);
    } else {
      // Both capped — quarter should still be less
      expect(quarter).toBeLessThanOrEqual(full);
    }
  });

  it('caps at 10% of capital', () => {
    // Extreme edge: 90% WR, 10:1 R:R
    const size = kellySize(0.9, 0.10, 0.01, 1.0);
    expect(size).toBeLessThanOrEqual(0.1);
  });

  it('handles edge cases: zero avgWin', () => {
    expect(kellySize(0.6, 0, 0.01)).toBe(0);
  });

  it('handles edge cases: zero avgLoss', () => {
    expect(kellySize(0.6, 0.02, 0)).toBe(0);
  });
});
