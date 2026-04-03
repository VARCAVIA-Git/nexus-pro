import type { OHLCV, Indicators, Signal, SignalResult, StrategyKey, Regime } from '@/types';
import { detectRegime } from './indicators';
import { detectPatterns, patternScore } from './patterns';

interface StrategyInput {
  candles: OHLCV[];
  indicators: Indicators;
  index: number;
}

type StrategyFn = (input: StrategyInput) => { signal: Signal; confidence: number };

// ── Momentum Strategy ──────────────────────────────────
const momentum: StrategyFn = ({ indicators, index }) => {
  const rsi = indicators.rsi[index];
  const macdH = indicators.macd.histogram[index];
  const stochK = indicators.stochastic.k[index];

  let score = 0;
  if (rsi < 30) score += 0.4;
  else if (rsi > 70) score -= 0.4;

  if (macdH > 0) score += 0.3;
  else if (macdH < 0) score -= 0.3;

  if (stochK < 20) score += 0.3;
  else if (stochK > 80) score -= 0.3;

  const signal: Signal = score > 0.3 ? 'BUY' : score < -0.3 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: Math.min(Math.abs(score), 1) };
};

// ── Trend Following Strategy ───────────────────────────
const trend: StrategyFn = ({ indicators, index }) => {
  const ema9 = indicators.ema9[index];
  const ema21 = indicators.ema21[index];
  const adx = indicators.adx[index];
  const sma50 = indicators.sma50[index];

  let score = 0;
  if (ema9 > ema21) score += 0.4;
  else score -= 0.4;

  if (adx > 25) score *= 1.3;
  else score *= 0.6;

  if (sma50 !== null && ema9 > sma50) score += 0.2;
  else if (sma50 !== null) score -= 0.2;

  const signal: Signal = score > 0.3 ? 'BUY' : score < -0.3 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: Math.min(Math.abs(score), 1) };
};

// ── Mean Reversion Strategy ────────────────────────────
const reversion: StrategyFn = ({ candles, indicators, index }) => {
  const close = candles[index].close;
  const bbUpper = indicators.bollinger.upper[index];
  const bbLower = indicators.bollinger.lower[index];
  const rsi = indicators.rsi[index];

  let score = 0;
  if (bbLower !== null && close < bbLower && rsi < 30) score += 0.7;
  else if (bbUpper !== null && close > bbUpper && rsi > 70) score -= 0.7;

  const signal: Signal = score > 0.3 ? 'BUY' : score < -0.3 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: Math.min(Math.abs(score), 1) };
};

// ── Breakout Strategy ──────────────────────────────────
const breakout: StrategyFn = ({ candles, indicators, index }) => {
  if (index < 20) return { signal: 'NEUTRAL', confidence: 0 };

  const close = candles[index].close;
  const volume = candles[index].volume;
  const atr = indicators.atr[index];

  // 20-bar high/low
  let high20 = -Infinity, low20 = Infinity, avgVol = 0;
  for (let j = index - 20; j < index; j++) {
    high20 = Math.max(high20, candles[j].high);
    low20 = Math.min(low20, candles[j].low);
    avgVol += candles[j].volume;
  }
  avgVol /= 20;

  let score = 0;
  const volSpike = avgVol > 0 ? volume / avgVol : 1;

  if (close > high20 && volSpike > 1.5) score += 0.7;
  else if (close < low20 && volSpike > 1.5) score -= 0.7;

  const signal: Signal = score > 0.3 ? 'BUY' : score < -0.3 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: Math.min(Math.abs(score), 1) };
};

// ── Pattern Strategy ───────────────────────────────────
const pattern: StrategyFn = ({ candles, index }) => {
  const patterns = detectPatterns(candles.slice(0, index + 1));
  const { signal, strength } = patternScore(patterns, index);
  return { signal, confidence: strength };
};

// ── Combined AI Strategy ───────────────────────────────
const combinedAi: StrategyFn = (input) => {
  const results = [
    { ...momentum(input), weight: 0.2 },
    { ...trend(input), weight: 0.25 },
    { ...reversion(input), weight: 0.2 },
    { ...breakout(input), weight: 0.15 },
    { ...pattern(input), weight: 0.2 },
  ];

  let score = 0;
  let totalConf = 0;
  for (const r of results) {
    const val = r.signal === 'BUY' ? r.confidence : r.signal === 'SELL' ? -r.confidence : 0;
    score += val * r.weight;
    totalConf += r.confidence * r.weight;
  }

  const signal: Signal = score > 0.15 ? 'BUY' : score < -0.15 ? 'SELL' : 'NEUTRAL';
  return { signal, confidence: Math.min(totalConf, 1) };
};

// ── Strategy Map ───────────────────────────────────────
const strategyMap: Record<StrategyKey, StrategyFn> = {
  combined_ai: combinedAi,
  momentum,
  trend,
  reversion,
  breakout,
  pattern,
};

/** Generate a signal for a given bar */
export function generateSignal(
  candles: OHLCV[],
  indicators: Indicators,
  index: number,
  strategyKey: StrategyKey,
): SignalResult {
  const fn = strategyMap[strategyKey];
  const { signal, confidence } = fn({ candles, indicators, index });
  const regime = detectRegime(indicators, index) as Regime;
  const patterns = detectPatterns(candles.slice(0, index + 1)).filter((p) => p.index === index);

  return {
    signal,
    confidence,
    strategy: strategyKey,
    indicators: {
      rsi: indicators.rsi[index],
      macdH: indicators.macd.histogram[index],
      adx: indicators.adx[index],
      atr: indicators.atr[index],
    },
    patterns,
    regime,
    timestamp: new Date(candles[index].date),
  };
}
