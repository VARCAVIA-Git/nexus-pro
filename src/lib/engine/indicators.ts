import {
  RSI, MACD, BollingerBands, ATR, ADX, Stochastic,
  EMA, SMA, OBV, VWAP,
} from 'technicalindicators';
import type { OHLCV, Indicators, Regime } from '@/types';

// ── Pure helper: pad array to target length ───────────────
function pad<T>(arr: T[], len: number, fill: T): T[] {
  const diff = len - arr.length;
  return diff > 0 ? [...Array(diff).fill(fill), ...arr] : arr;
}

// ── RSI (14 periods) ──────────────────────────────────────
export function computeRSI(closes: number[], period = 14): number[] {
  return RSI.calculate({ values: closes, period });
}

// ── MACD (12, 26, 9) ─────────────────────────────────────
export function computeMACD(closes: number[]) {
  const raw = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  return {
    line: raw.map((m) => m.MACD ?? 0),
    signal: raw.map((m) => m.signal ?? 0),
    histogram: raw.map((m) => m.histogram ?? 0),
  };
}

// ── Bollinger Bands (20, 2σ) with squeeze detection ───────
export function computeBollinger(closes: number[], period = 20, stdDev = 2) {
  const bb = BollingerBands.calculate({ values: closes, period, stdDev });
  const mid = bb.map((b) => b.middle);
  const upper = bb.map((b) => b.upper);
  const lower = bb.map((b) => b.lower);

  // BB width = (upper - lower) / mid
  const width = bb.map((b) => b.middle > 0 ? (b.upper - b.lower) / b.middle : 0);

  // Squeeze: width below 5th percentile of its own history
  const sortedWidths = [...width].sort((a, b) => a - b);
  const p5Threshold = sortedWidths[Math.floor(sortedWidths.length * 0.05)] ?? 0;
  const squeeze = width.map((w) => w <= p5Threshold && w > 0);

  return { mid, upper, lower, width, squeeze };
}

// ── ATR (14 periods) ──────────────────────────────────────
export function computeATR(high: number[], low: number[], close: number[], period = 14): number[] {
  return ATR.calculate({ high, low, close, period });
}

// ── ADX (14 periods) ──────────────────────────────────────
export function computeADX(high: number[], low: number[], close: number[], period = 14): number[] {
  return ADX.calculate({ high, low, close, period }).map((a) => a.adx);
}

// ── Stochastic (14, 3, 3) ────────────────────────────────
export function computeStochastic(high: number[], low: number[], close: number[]) {
  const stoch = Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 });
  return {
    k: stoch.map((s) => s.k),
    d: stoch.map((s) => s.d),
  };
}

// ── EMA / SMA ─────────────────────────────────────────────
export function computeEMA(closes: number[], period: number): number[] {
  return EMA.calculate({ values: closes, period });
}

export function computeSMA(closes: number[], period: number): number[] {
  return SMA.calculate({ values: closes, period });
}

// ── Volume Analysis ───────────────────────────────────────
export function computeVolumeAnalysis(volumes: number[], period = 20) {
  const avg20: number[] = [];
  const spike: boolean[] = [];

  for (let i = 0; i < volumes.length; i++) {
    if (i < period) {
      const slice = volumes.slice(0, i + 1);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      avg20.push(avg);
      spike.push(false);
    } else {
      const slice = volumes.slice(i - period, i);
      const avg = slice.reduce((s, v) => s + v, 0) / period;
      avg20.push(avg);
      spike.push(avg > 0 && volumes[i] > avg * 1.5);
    }
  }

  return { raw: volumes, avg20, spike };
}

// ── OBV ───────────────────────────────────────────────────
export function computeOBV(close: number[], volume: number[]): number[] {
  return OBV.calculate({ close, volume });
}

// ── Full indicator computation ────────────────────────────
export function computeIndicators(candles: OHLCV[]): Indicators {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);
  const n = candles.length;

  const rsi = computeRSI(close);
  const macdRaw = computeMACD(close);
  const bb = computeBollinger(close);
  const atr = computeATR(high, low, close);
  const adx = computeADX(high, low, close);
  const stoch = computeStochastic(high, low, close);
  const ema9 = computeEMA(close, 9);
  const ema21 = computeEMA(close, 21);
  const sma20 = computeSMA(close, 20);
  const sma50 = computeSMA(close, 50);
  const sma200 = computeSMA(close, 200);
  const vol = computeVolumeAnalysis(volume);
  const obv = computeOBV(close, volume);

  // VWAP — may fail if no volume data
  let vwap: number[] = [];
  try {
    vwap = VWAP.calculate({ high, low, close, volume });
  } catch {
    vwap = [];
  }

  return {
    rsi: pad(rsi, n, 50),
    macd: {
      line: pad(macdRaw.line, n, 0),
      signal: pad(macdRaw.signal, n, 0),
      histogram: pad(macdRaw.histogram, n, 0),
    },
    bollinger: {
      mid: pad<number | null>(bb.mid, n, null),
      upper: pad<number | null>(bb.upper, n, null),
      lower: pad<number | null>(bb.lower, n, null),
      width: pad(bb.width, n, 0),
      squeeze: pad(bb.squeeze, n, false),
    },
    atr: pad(atr, n, 0),
    adx: pad(adx, n, 0),
    stochastic: {
      k: pad(stoch.k, n, 50),
      d: pad(stoch.d, n, 50),
    },
    ema9: pad(ema9, n, close[0] ?? 0),
    ema21: pad(ema21, n, close[0] ?? 0),
    sma20: pad<number | null>(sma20, n, null),
    sma50: pad<number | null>(sma50, n, null),
    sma200: pad<number | null>(sma200, n, null),
    volume: vol,
    obv: pad(obv, n, 0),
    vwap: pad(vwap, n, 0),
  };
}

// ── Regime Detection ──────────────────────────────────────
export function detectRegime(indicators: Indicators, i: number): Regime {
  const adx = indicators.adx[i] ?? 0;
  const sma50 = indicators.sma50[i];
  const sma200 = indicators.sma200[i];
  const bbWidth = indicators.bollinger.width[i] ?? 0;

  // High volatility: BB width in top 5% (use squeeze inverse)
  const widths = indicators.bollinger.width.slice(0, i + 1);
  const sorted = [...widths].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
  if (bbWidth > p95 && p95 > 0) return 'HIGH_VOL';

  // Sideways: ADX < 15
  if (adx < 15) return 'SIDEWAYS';

  // Bull/Bear: SMA50 vs SMA200
  if (sma50 !== null && sma200 !== null) {
    if (sma50 > sma200 && adx > 20) return 'BULL_TREND';
    if (sma50 < sma200 && adx > 20) return 'BEAR_TREND';
  }

  // Low vol: BB squeeze
  if (indicators.bollinger.squeeze[i]) return 'LOW_VOL';

  return 'NORMAL';
}
