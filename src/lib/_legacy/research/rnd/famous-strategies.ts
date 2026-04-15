// ═══════════════════════════════════════════════════════════════
// Famous Trading Strategies — implementations of legendary trader methods
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

export interface FamousStrategy {
  id: string;
  name: string;
  author: string;
  description: string;
  timeframe: string;
  entryRule: string;
  exitRule: string;
  /** Per-bar entry: returns 'long'|'short'|null at index i */
  entryAt: (i: number, candles: OHLCV[]) => 'long' | 'short' | null;
  /** Per-bar exit: returns true if position should close at index i */
  exitAt?: (i: number, candles: OHLCV[], entryIdx: number, side: 'long' | 'short') => boolean;
  /** Legacy full backtest (still used for stats) */
  test: (candles: OHLCV[]) => { trades: number; winRate: number; totalReturn: number; sharpe: number };
}

// Helper: simple backtest framework
function simpleBacktest(candles: OHLCV[], shouldEnter: (i: number, c: OHLCV[]) => 'long' | 'short' | null, shouldExit: (i: number, c: OHLCV[], entryIdx: number, side: string) => boolean): { trades: number; winRate: number; totalReturn: number; sharpe: number } {
  const returns: number[] = [];
  let pos: { idx: number; price: number; side: string } | null = null;

  for (let i = 50; i < candles.length; i++) {
    if (pos) {
      if (shouldExit(i, candles, pos.idx, pos.side)) {
        const ret = pos.side === 'long' ? (candles[i].close - pos.price) / pos.price : (pos.price - candles[i].close) / pos.price;
        returns.push(ret);
        pos = null;
      }
    } else {
      const sig = shouldEnter(i, candles);
      if (sig) pos = { idx: i, price: candles[i].close, side: sig };
    }
  }

  const wins = returns.filter(r => r > 0).length;
  const total = returns.reduce((s, r) => s + r, 0);
  const avg = returns.length > 0 ? total / returns.length : 0;
  const std = returns.length > 1 ? Math.sqrt(returns.reduce((s, r) => s + (r - avg) ** 2, 0) / (returns.length - 1)) : 0;

  return {
    trades: returns.length,
    winRate: returns.length > 0 ? Math.round((wins / returns.length) * 100) : 0,
    totalReturn: Math.round(total * 10000) / 100,
    sharpe: std > 0 ? Math.round((avg / std) * Math.sqrt(252) * 100) / 100 : 0,
  };
}

// EMA helper
function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result = [vals[0]];
  for (let i = 1; i < vals.length; i++) result.push(vals[i] * k + result[i - 1] * (1 - k));
  return result;
}

// RSI helper
function rsi(closes: number[], period = 14): number[] {
  const result = new Array(closes.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period && i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ── Per-bar entry/exit functions (extracted for reuse by strategy-runner) ──

const turtleEntry = (i: number, c: OHLCV[]): 'long' | null => {
  if (i < 21) return null;
  let h20 = -Infinity;
  for (let j = i - 20; j < i; j++) h20 = Math.max(h20, c[j].high);
  return c[i].close > h20 ? 'long' : null;
};
const turtleExit = (i: number, c: OHLCV[], ei: number) => {
  if (i < 11) return false;
  let l10 = Infinity;
  for (let j = i - 10; j < i; j++) l10 = Math.min(l10, c[j].low);
  return c[i].close < l10 || i - ei > 30;
};

function buildMacdRsiEvaluators(candles: OHLCV[]) {
  const closes = candles.map(c => c.close);
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signal[i]);
  const rsiVals = rsi(closes);
  return {
    entry: (i: number) => i > 0 && hist[i] > 0 && hist[i - 1] <= 0 && rsiVals[i] > 50 ? 'long' as const : null,
    exit: (i: number, _c: OHLCV[], ei: number) => (i > 0 && hist[i] < 0 && hist[i - 1] >= 0) || rsiVals[i] < 40 || i - ei > 50,
  };
}

function buildBBSqueezeEvaluators(candles: OHLCV[]) {
  const closes = candles.map(c => c.close);
  const period = 20;
  return {
    entry: (i: number) => {
      if (i < period + 20) return null;
      const slice = closes.slice(i - period, i);
      const avg = slice.reduce((s, v) => s + v, 0) / period;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period);
      const width = avg > 0 ? std * 2 / avg : 0;
      const widths: number[] = [];
      for (let j = i - 20; j < i; j++) {
        const sl = closes.slice(j - period, j);
        const a = sl.reduce((s, v) => s + v, 0) / period;
        const sd = Math.sqrt(sl.reduce((s, v) => s + (v - a) ** 2, 0) / period);
        widths.push(a > 0 ? sd * 2 / a : 0);
      }
      const minWidth = Math.min(...widths);
      if (width < minWidth * 1.2 && closes[i] > avg + std * 1.5) return 'long' as const;
      return null;
    },
    exit: (i: number, _c: OHLCV[], ei: number) => {
      if (i < period) return false;
      const slice = closes.slice(i - period, i);
      const avg = slice.reduce((s, v) => s + v, 0) / period;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period);
      return closes[i] < avg - std * 2 || i - ei > 30;
    },
  };
}

function buildEmaRibbonEvaluators(candles: OHLCV[]) {
  const closes = candles.map(c => c.close);
  const e8 = ema(closes, 8), e13 = ema(closes, 13), e21 = ema(closes, 21), e34 = ema(closes, 34);
  return {
    entry: (i: number) => i > 0 && e8[i] > e13[i] && e13[i] > e21[i] && e21[i] > e34[i] && closes[i] <= e8[i] * 1.005 ? 'long' as const : null,
    exit: (i: number) => e8[i] < e13[i],
  };
}

function buildRsiDivergenceEvaluators(candles: OHLCV[]) {
  const closes = candles.map(c => c.close);
  const rsiVals = rsi(closes);
  return {
    entry: (i: number) => {
      if (i < 20) return null;
      if (closes[i] < closes[i - 10] && rsiVals[i] > rsiVals[i - 10] && rsiVals[i] < 45) return 'long' as const;
      return null;
    },
    exit: (i: number, _c: OHLCV[], ei: number) => rsiVals[i] > 70 || i - ei > 40,
  };
}

const volBreakoutEntry = (i: number, c: OHLCV[]): 'long' | null => {
  if (i < 25) return null;
  let h20 = -Infinity, avgVol = 0;
  for (let j = i - 20; j < i; j++) { h20 = Math.max(h20, c[j].high); avgVol += c[j].volume; }
  avgVol /= 20;
  return c[i].close > h20 && (avgVol === 0 || c[i].volume > avgVol * 1.5) ? 'long' : null;
};
const volBreakoutExit = (i: number, c: OHLCV[], ei: number) => {
  const entry = c[ei].close;
  return c[i].close < entry * 0.95 || i - ei > 20;
};

export const FAMOUS_STRATEGIES: FamousStrategy[] = [
  {
    id: 'turtle', name: 'Turtle Trading', author: 'Richard Dennis',
    description: 'Breakout dei massimi/minimi a 20 giorni con ATR sizing',
    timeframe: '1d', entryRule: 'Prezzo supera high 20 giorni', exitRule: 'Prezzo sotto low 10 giorni',
    entryAt: turtleEntry,
    exitAt: turtleExit,
    test: (candles) => simpleBacktest(candles, turtleEntry, turtleExit),
  },
  {
    id: 'macd_rsi', name: 'MACD + RSI Combo', author: 'Gerald Appel',
    description: 'MACD crossover confermato da RSI',
    timeframe: '4h', entryRule: 'MACD cross up + RSI > 50', exitRule: 'MACD cross down o RSI < 40',
    entryAt: (i, c) => buildMacdRsiEvaluators(c).entry(i),
    exitAt: (i, c, ei) => buildMacdRsiEvaluators(c).exit(i, c, ei),
    test: (candles) => {
      const ev = buildMacdRsiEvaluators(candles);
      return simpleBacktest(candles, (i) => ev.entry(i), (i, c, ei) => ev.exit(i, c, ei));
    },
  },
  {
    id: 'bb_squeeze', name: 'Bollinger Squeeze', author: 'John Bollinger',
    description: 'Entra dopo compressione di volatilità',
    timeframe: '1h', entryRule: 'BB width ai minimi → breakout sopra upper band', exitRule: 'Prezzo tocca banda opposta',
    entryAt: (i, c) => buildBBSqueezeEvaluators(c).entry(i),
    exitAt: (i, c, ei) => buildBBSqueezeEvaluators(c).exit(i, c, ei),
    test: (candles) => {
      const ev = buildBBSqueezeEvaluators(candles);
      return simpleBacktest(candles, (i) => ev.entry(i), (i, c, ei) => ev.exit(i, c, ei));
    },
  },
  {
    id: 'ema_ribbon', name: 'EMA Ribbon Scalping', author: 'Classic',
    description: 'Scalping con nastro di EMA allineate',
    timeframe: '5m', entryRule: 'EMA 8 > 13 > 21 > 34 + pullback alla EMA 8', exitRule: 'EMA 8 cross sotto EMA 13',
    entryAt: (i, c) => buildEmaRibbonEvaluators(c).entry(i),
    exitAt: (i, c) => buildEmaRibbonEvaluators(c).exit(i),
    test: (candles) => {
      const ev = buildEmaRibbonEvaluators(candles);
      return simpleBacktest(candles, (i) => ev.entry(i), (i) => ev.exit(i));
    },
  },
  {
    id: 'rsi_divergence', name: 'RSI Divergence', author: 'J. Welles Wilder',
    description: 'Divergenza tra prezzo e RSI',
    timeframe: '1h', entryRule: 'Prezzo fa lower low ma RSI fa higher low', exitRule: 'RSI > 70',
    entryAt: (i, c) => buildRsiDivergenceEvaluators(c).entry(i),
    exitAt: (i, c, ei) => buildRsiDivergenceEvaluators(c).exit(i, c, ei),
    test: (candles) => {
      const ev = buildRsiDivergenceEvaluators(candles);
      return simpleBacktest(candles, (i) => ev.entry(i), (i, c, ei) => ev.exit(i, c, ei));
    },
  },
  {
    id: 'breakout_vol', name: 'Volume Breakout', author: 'Classic',
    description: 'Breakout con conferma volume',
    timeframe: '4h', entryRule: 'Rottura high 20 periodi + volume > 1.5x media', exitRule: 'Stop -5% o 20 bar',
    entryAt: volBreakoutEntry,
    exitAt: volBreakoutExit,
    test: (candles) => simpleBacktest(candles, volBreakoutEntry, volBreakoutExit),
  },
];
