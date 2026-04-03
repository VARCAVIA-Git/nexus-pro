import {
  RSI, MACD, BollingerBands, ATR, ADX, Stochastic,
  EMA, SMA, OBV, VWAP,
} from 'technicalindicators';
import type { OHLCV, Indicators } from '@/types';

export function computeIndicators(candles: OHLCV[]): Indicators {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);

  const rsi = RSI.calculate({ values: close, period: 14 });
  const macdRaw = MACD.calculate({ values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  const bb = BollingerBands.calculate({ values: close, period: 20, stdDev: 2 });
  const atr = ATR.calculate({ high, low, close, period: 14 });
  const adx = ADX.calculate({ high, low, close, period: 14 });
  const stoch = Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 });
  const ema9 = EMA.calculate({ values: close, period: 9 });
  const ema21 = EMA.calculate({ values: close, period: 21 });
  const sma20 = SMA.calculate({ values: close, period: 20 });
  const sma50 = SMA.calculate({ values: close, period: 50 });
  const obv = OBV.calculate({ close, volume });
  const vwap = VWAP.calculate({ high, low, close, volume });

  // Pad arrays to match candle length
  const pad = <T>(arr: T[], len: number, fill: T): T[] => {
    const diff = len - arr.length;
    return diff > 0 ? [...Array(diff).fill(fill), ...arr] : arr;
  };

  const n = candles.length;

  return {
    rsi: pad(rsi, n, 50),
    macd: {
      line: pad(macdRaw.map((m) => m.MACD ?? 0), n, 0),
      signal: pad(macdRaw.map((m) => m.signal ?? 0), n, 0),
      histogram: pad(macdRaw.map((m) => m.histogram ?? 0), n, 0),
    },
    bollinger: {
      mid: pad(bb.map((b) => b.middle), n, null),
      upper: pad(bb.map((b) => b.upper), n, null),
      lower: pad(bb.map((b) => b.lower), n, null),
    },
    atr: pad(atr, n, 0),
    adx: pad(adx.map((a) => a.adx), n, 0),
    stochastic: {
      k: pad(stoch.map((s) => s.k), n, 50),
      d: pad(stoch.map((s) => s.d), n, 50),
    },
    ema9: pad(ema9, n, close[0] ?? 0),
    ema21: pad(ema21, n, close[0] ?? 0),
    sma20: pad(sma20, n, null),
    sma50: pad(sma50, n, null),
    supertrend: pad([], n, 0), // SuperTrend needs custom impl or different API
    obv: pad(obv, n, 0),
    vwap: pad(vwap, n, 0),
  };
}

export function detectRegime(indicators: Indicators, i: number) {
  const adx = indicators.adx[i] ?? 0;
  const atr = indicators.atr[i] ?? 0;
  const atrPrev = indicators.atr[Math.max(0, i - 14)] ?? atr;
  const ema9 = indicators.ema9[i] ?? 0;
  const ema21 = indicators.ema21[i] ?? 0;

  const atrRatio = atrPrev > 0 ? atr / atrPrev : 1;

  if (atrRatio > 1.5) return 'HIGH_VOL' as const;
  if (atrRatio < 0.5) return 'LOW_VOL' as const;
  if (adx > 25 && ema9 > ema21) return 'BULL_TREND' as const;
  if (adx > 25 && ema9 < ema21) return 'BEAR_TREND' as const;
  return 'NORMAL' as const;
}
