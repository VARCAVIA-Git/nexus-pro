// ═══════════════════════════════════════════════════════════════
// Indicator Scanner — tests every indicator condition on historical data
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { computeIndicators } from '../../core/indicators';
import { loadWarehouse } from './data-warehouse';
import { redisSet, KEYS } from '@/lib/db/redis';

export interface IndicatorStudy {
  condition: string;
  asset: string;
  timeframe: string;
  totalOccurrences: number;
  avgReturn1d: number;
  winRate1d: number;
  avgReturn1w: number;
  winRate1w: number;
  sampleSize: number;
}

interface ConditionAccum {
  returns1d: number[];
  returns1w: number[];
}

/** Scan all indicator conditions for an asset+timeframe */
export async function scanIndicators(asset: string, tf: string): Promise<IndicatorStudy[]> {
  const candles = await loadWarehouse(asset, tf);
  if (candles.length < 70) return [];

  const indicators = computeIndicators(candles);
  const conditions: Record<string, ConditionAccum> = {};

  function record(name: string, ret1d: number, ret1w: number) {
    if (!conditions[name]) conditions[name] = { returns1d: [], returns1w: [] };
    conditions[name].returns1d.push(ret1d);
    conditions[name].returns1w.push(ret1w);
  }

  // Walk through history, skip warmup and leave room for future returns
  const lookAhead1d = tf === '1d' ? 1 : tf === '4h' ? 6 : tf === '1h' ? 24 : 96;
  const lookAhead1w = tf === '1d' ? 5 : tf === '4h' ? 30 : tf === '1h' ? 120 : 480;
  const maxLook = Math.max(lookAhead1d, lookAhead1w);

  for (let i = 50; i < candles.length - maxLook; i++) {
    const close = candles[i].close;
    const future1d = candles[Math.min(i + lookAhead1d, candles.length - 1)].close;
    const future1w = candles[Math.min(i + lookAhead1w, candles.length - 1)].close;
    const ret1d = (future1d - close) / close;
    const ret1w = (future1w - close) / close;

    const rsi = indicators.rsi[i];
    const macdH = indicators.macd.histogram[i];
    const prevMacdH = indicators.macd.histogram[i - 1];
    const adx = indicators.adx[i];
    const stochK = indicators.stochastic.k[i];
    const bbLower = indicators.bollinger.lower[i];
    const bbUpper = indicators.bollinger.upper[i];
    const squeeze = indicators.bollinger.squeeze[i];
    const ema9 = indicators.ema9[i];
    const sma50 = indicators.sma50[i];
    const volSpike = indicators.volume.spike[i];

    // Single indicator conditions
    if (rsi < 30) record('RSI_oversold', ret1d, ret1w);
    if (rsi > 70) record('RSI_overbought', ret1d, ret1w);
    if (rsi >= 40 && rsi <= 60) record('RSI_neutral', ret1d, ret1w);
    if (macdH > 0 && prevMacdH <= 0) record('MACD_cross_up', ret1d, ret1w);
    if (macdH < 0 && prevMacdH >= 0) record('MACD_cross_down', ret1d, ret1w);
    if (adx > 25) record('ADX_strong_trend', ret1d, ret1w);
    if (adx < 15) record('ADX_no_trend', ret1d, ret1w);
    if (stochK < 20) record('Stoch_oversold', ret1d, ret1w);
    if (stochK > 80) record('Stoch_overbought', ret1d, ret1w);
    if (squeeze) record('BB_squeeze', ret1d, ret1w);
    if (bbLower !== null && close < bbLower) record('BB_lower_touch', ret1d, ret1w);
    if (bbUpper !== null && close > bbUpper) record('BB_upper_touch', ret1d, ret1w);
    if (sma50 !== null && ema9 > sma50) record('EMA9_above_SMA50', ret1d, ret1w);
    if (sma50 !== null && ema9 < sma50) record('EMA9_below_SMA50', ret1d, ret1w);
    if (volSpike) record('Volume_spike', ret1d, ret1w);

    // Powerful combinations
    if (rsi < 30 && bbLower !== null && close <= bbLower * 1.01) record('RSI_oversold+BB_lower', ret1d, ret1w);
    if (rsi < 30 && volSpike) record('RSI_oversold+Volume_spike', ret1d, ret1w);
    if (macdH > 0 && prevMacdH <= 0 && adx > 25) record('MACD_cross_up+ADX_strong', ret1d, ret1w);
    if (macdH > 0 && prevMacdH <= 0 && sma50 !== null && ema9 > sma50) record('MACD_up+EMA_bullish', ret1d, ret1w);
    if (squeeze && volSpike) record('BB_squeeze+Volume_spike', ret1d, ret1w);
    if (adx > 25 && sma50 !== null && ema9 > sma50 && macdH > 0) record('Triple_bullish', ret1d, ret1w);
    if (rsi > 70 && bbUpper !== null && close >= bbUpper * 0.99) record('RSI_overbought+BB_upper', ret1d, ret1w);
  }

  // Aggregate into studies
  const studies: IndicatorStudy[] = [];
  for (const [condition, acc] of Object.entries(conditions)) {
    if (acc.returns1d.length < 5) continue;
    const n = acc.returns1d.length;
    studies.push({
      condition, asset, timeframe: tf,
      totalOccurrences: n,
      avgReturn1d: acc.returns1d.reduce((s, r) => s + r, 0) / n,
      winRate1d: acc.returns1d.filter(r => r > 0).length / n,
      avgReturn1w: acc.returns1w.reduce((s, r) => s + r, 0) / n,
      winRate1w: acc.returns1w.filter(r => r > 0).length / n,
      sampleSize: n,
    });
  }

  studies.sort((a, b) => b.winRate1d - a.winRate1d);
  redisSet(KEYS.scanResults(asset, tf), studies, 86400).catch(() => {});
  return studies;
}
