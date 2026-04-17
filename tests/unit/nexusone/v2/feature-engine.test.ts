import { describe, it, expect } from 'vitest';
import { computeFeatures, rsi, atr, adx, type OHLCVBar } from '@/lib/nexusone/core/feature-engine';

function makeFlatBars(n: number, price: number = 100): OHLCVBar[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: i * 900_000,
    open: price, high: price, low: price, close: price, volume: 1000,
  }));
}

function makeZigzagBars(n: number, base: number = 100, amp: number = 1): OHLCVBar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = base + (i % 2 === 0 ? amp : -amp);
    return { ts: i * 900_000, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 };
  });
}

describe('feature-engine RSI', () => {
  it('returns 100 when there are no losses', () => {
    const bars = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(bars, 14)).toBe(100);
  });
  it('returns a finite number for zigzag', () => {
    const bars = makeZigzagBars(60).map(b => b.close);
    const r = rsi(bars, 14);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
  });
});

describe('feature-engine ATR', () => {
  it('is 0 on flat bars', () => {
    const bars = makeFlatBars(30);
    expect(atr(bars, 14)).toBeCloseTo(0, 5);
  });
});

describe('feature-engine ADX', () => {
  it('returns a finite number on volatile bars', () => {
    const bars = makeZigzagBars(60, 100, 2);
    const a = adx(bars, 14);
    expect(Number.isFinite(a)).toBe(true);
  });
});

describe('feature-engine computeFeatures', () => {
  it('returns null when not enough bars', () => {
    expect(computeFeatures(makeFlatBars(10))).toBeNull();
  });
  it('produces a full snapshot with ≥ 55 bars', () => {
    const bars = makeZigzagBars(100, 100, 2);
    const f = computeFeatures(bars);
    expect(f).not.toBeNull();
    expect(f!.price).toBeGreaterThan(0);
    expect(Number.isFinite(f!.rsi_14)).toBe(true);
    expect(Number.isFinite(f!.ema_20)).toBe(true);
    expect(Number.isFinite(f!.ema_50)).toBe(true);
    expect(Number.isFinite(f!.atr_14)).toBe(true);
    expect(Number.isFinite(f!.atr_ratio)).toBe(true);
    expect(f!.bb_upper).toBeGreaterThan(f!.bb_lower);
  });
});
