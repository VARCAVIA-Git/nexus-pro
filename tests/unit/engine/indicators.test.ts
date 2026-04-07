import { describe, it, expect } from 'vitest';
import {
  computeRSI, computeMACD, computeBollinger, computeATR,
  computeADX, computeStochastic, computeEMA, computeSMA,
  computeVolumeAnalysis, computeOBV, computeIndicators, detectRegime,
} from '@/lib/core/indicators';
import { generateOHLCV } from '@/lib/core/data-generator';
import type { OHLCV } from '@/types';

// Generate test data with a known seed
const candles = generateOHLCV({ startPrice: 100, days: 300, seed: 42 });
const close = candles.map((c) => c.close);
const high = candles.map((c) => c.high);
const low = candles.map((c) => c.low);
const volume = candles.map((c) => c.volume);

describe('RSI', () => {
  it('should return values between 0 and 100', () => {
    const rsi = computeRSI(close);
    expect(rsi.length).toBeGreaterThan(0);
    for (const v of rsi) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('should use 14-period by default', () => {
    const rsi14 = computeRSI(close, 14);
    const rsiDefault = computeRSI(close);
    expect(rsi14.length).toBe(rsiDefault.length);
  });

  it('should return fewer values than input (warmup period)', () => {
    const rsi = computeRSI(close);
    expect(rsi.length).toBeLessThan(close.length);
    expect(rsi.length).toBe(close.length - 14);
  });
});

describe('MACD', () => {
  it('should return line, signal, and histogram arrays', () => {
    const macd = computeMACD(close);
    expect(macd.line.length).toBeGreaterThan(0);
    expect(macd.signal.length).toBe(macd.line.length);
    expect(macd.histogram.length).toBe(macd.line.length);
  });

  it('histogram should equal line - signal (after warmup)', () => {
    const macd = computeMACD(close);
    // First few values may have 0 histogram before signal line is ready
    const start = Math.min(10, macd.line.length);
    for (let i = start; i < macd.line.length; i++) {
      expect(macd.histogram[i]).toBeCloseTo(macd.line[i] - macd.signal[i], 4);
    }
  });
});

describe('Bollinger Bands', () => {
  it('should return mid, upper, lower, width, squeeze', () => {
    const bb = computeBollinger(close);
    expect(bb.mid.length).toBeGreaterThan(0);
    expect(bb.upper.length).toBe(bb.mid.length);
    expect(bb.lower.length).toBe(bb.mid.length);
    expect(bb.width.length).toBe(bb.mid.length);
    expect(bb.squeeze.length).toBe(bb.mid.length);
  });

  it('upper should always be >= mid >= lower', () => {
    const bb = computeBollinger(close);
    for (let i = 0; i < bb.mid.length; i++) {
      expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.mid[i]);
      expect(bb.mid[i]).toBeGreaterThanOrEqual(bb.lower[i]);
    }
  });

  it('width should be positive', () => {
    const bb = computeBollinger(close);
    for (const w of bb.width) {
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('squeeze should be boolean array', () => {
    const bb = computeBollinger(close);
    for (const s of bb.squeeze) {
      expect(typeof s).toBe('boolean');
    }
  });
});

describe('ATR', () => {
  it('should return positive values', () => {
    const atr = computeATR(high, low, close);
    expect(atr.length).toBeGreaterThan(0);
    for (const v of atr) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ADX', () => {
  it('should return values between 0 and 100', () => {
    const adx = computeADX(high, low, close);
    expect(adx.length).toBeGreaterThan(0);
    for (const v of adx) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('Stochastic', () => {
  it('should return %K and %D between 0 and 100', () => {
    const stoch = computeStochastic(high, low, close);
    expect(stoch.k.length).toBeGreaterThan(0);
    expect(stoch.d.length).toBe(stoch.k.length);
    for (const v of stoch.k) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('EMA & SMA', () => {
  it('EMA should return correct number of values', () => {
    const ema9 = computeEMA(close, 9);
    expect(ema9.length).toBe(close.length - 8);
  });

  it('SMA should return correct number of values', () => {
    const sma20 = computeSMA(close, 20);
    expect(sma20.length).toBe(close.length - 19);

    const sma200 = computeSMA(close, 200);
    expect(sma200.length).toBe(close.length - 199);
  });

  it('SMA should be the mean of the window', () => {
    const sma = computeSMA(close, 5);
    // Check first SMA value manually
    const expected = (close[0] + close[1] + close[2] + close[3] + close[4]) / 5;
    expect(sma[0]).toBeCloseTo(expected, 5);
  });
});

describe('Volume Analysis', () => {
  it('should detect volume spikes (>1.5x avg)', () => {
    const vol = computeVolumeAnalysis(volume);
    expect(vol.raw.length).toBe(volume.length);
    expect(vol.avg20.length).toBe(volume.length);
    expect(vol.spike.length).toBe(volume.length);

    // At least some spikes should be detected in 300 days
    const spikeCount = vol.spike.filter(Boolean).length;
    expect(spikeCount).toBeGreaterThan(0);
  });

  it('spike should only be true when volume > 1.5x average', () => {
    const vol = computeVolumeAnalysis(volume);
    for (let i = 20; i < vol.spike.length; i++) {
      if (vol.spike[i]) {
        expect(volume[i]).toBeGreaterThan(vol.avg20[i] * 1.5);
      }
    }
  });
});

describe('computeIndicators', () => {
  it('should return all indicators with correct array lengths', () => {
    const ind = computeIndicators(candles);
    const n = candles.length;

    expect(ind.rsi.length).toBe(n);
    expect(ind.macd.line.length).toBe(n);
    expect(ind.bollinger.mid.length).toBe(n);
    expect(ind.atr.length).toBe(n);
    expect(ind.adx.length).toBe(n);
    expect(ind.stochastic.k.length).toBe(n);
    expect(ind.ema9.length).toBe(n);
    expect(ind.ema21.length).toBe(n);
    expect(ind.sma20.length).toBe(n);
    expect(ind.sma50.length).toBe(n);
    expect(ind.sma200.length).toBe(n);
    expect(ind.volume.raw.length).toBe(n);
    expect(ind.obv.length).toBe(n);
  });
});

describe('detectRegime', () => {
  it('should return a valid regime', () => {
    const ind = computeIndicators(candles);
    const validRegimes = ['BULL_TREND', 'BEAR_TREND', 'HIGH_VOL', 'LOW_VOL', 'SIDEWAYS', 'NORMAL'];

    for (let i = 200; i < candles.length; i += 10) {
      const regime = detectRegime(ind, i);
      expect(validRegimes).toContain(regime);
    }
  });
});
