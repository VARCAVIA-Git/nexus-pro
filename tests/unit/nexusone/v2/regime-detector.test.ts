import { describe, it, expect } from 'vitest';
import { classifyRaw } from '@/lib/nexusone/core/regime-detector';
import type { Features } from '@/lib/nexusone/core/feature-engine';

function f(over: Partial<Features>): Features {
  return {
    bb_upper: 105, bb_middle: 100, bb_lower: 95, bb_width: 0.04, bb_percent_b: 0.5,
    rsi_14: 50, volume_ratio: 1, adx_14: 10,
    ema_20: 100, ema_50: 100, price_vs_ema50: 0,
    atr_14: 1, atr_ratio: 1,
    price: 100, ts: Date.now(),
    ...over,
  };
}

describe('regime-detector classifyRaw', () => {
  it('RANGING when ADX<20 and narrow BB', () => {
    expect(classifyRaw(f({ adx_14: 10, bb_width: 0.03 }))).toBe('RANGING');
  });
  it('TRENDING_UP when ADX>25 + price>EMA50 + EMA20>EMA50', () => {
    const x = f({ adx_14: 30, price: 110, ema_20: 108, ema_50: 100 });
    expect(classifyRaw(x)).toBe('TRENDING_UP');
  });
  it('TRENDING_DOWN when ADX>25 + price<EMA50 + EMA20<EMA50', () => {
    const x = f({ adx_14: 30, price: 90, ema_20: 92, ema_50: 100 });
    expect(classifyRaw(x)).toBe('TRENDING_DOWN');
  });
  it('CHOPPY when ADX in 20-25 and ATR ratio high', () => {
    expect(classifyRaw(f({ adx_14: 22, atr_ratio: 2.5 }))).toBe('CHOPPY');
  });
});
