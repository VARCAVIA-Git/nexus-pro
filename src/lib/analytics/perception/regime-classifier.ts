// ═══════════════════════════════════════════════════════════════
// Market Regime Classifier — classifies current market conditions
// into 6 regimes, each with strategy recommendations
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { computeIndicators } from '../../core/indicators';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'BREAKOUT' | 'EXHAUSTION';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  details: string;
  recommendedStrategies: string[];
  avoidStrategies: string[];
  sizeMultiplier: number;
}

export function classifyRegime(candles: OHLCV[]): RegimeAnalysis {
  if (candles.length < 60) return { regime: 'RANGING', confidence: 30, details: 'Insufficient data', recommendedStrategies: ['combined_ai'], avoidStrategies: [], sizeMultiplier: 0.5 };

  const ind = computeIndicators(candles);
  const i = candles.length - 1;
  const close = candles[i].close;

  const adx = ind.adx[i] ?? 0;
  const adx5ago = ind.adx[Math.max(0, i - 5)] ?? 0;
  const rsi = ind.rsi[i] ?? 50;
  const atr = ind.atr[i] ?? 0;
  const ema9 = ind.ema9[i];
  const ema21 = ind.ema21[i];
  const sma50 = ind.sma50[i];
  const sma200 = ind.sma200[i];
  const bbWidth = ind.bollinger.width[i] ?? 0;

  // ATR ratio vs 50-period average
  const atrSlice = ind.atr.slice(Math.max(0, i - 50), i);
  const avgATR = atrSlice.length > 0 ? atrSlice.reduce((s, v) => s + v, 0) / atrSlice.length : atr;
  const atrRatio = avgATR > 0 ? atr / avgATR : 1;

  // Higher highs / lower lows (last 20 candles)
  const recent = candles.slice(-20);
  let higherHighs = 0, lowerLows = 0;
  for (let j = 5; j < recent.length; j += 5) {
    const prevHigh = Math.max(...recent.slice(j - 5, j).map(c => c.high));
    const currHigh = Math.max(...recent.slice(j, Math.min(j + 5, recent.length)).map(c => c.high));
    if (currHigh > prevHigh) higherHighs++; else lowerLows++;
  }

  // 30-period high/low
  const last30 = candles.slice(-30);
  const high30 = Math.max(...last30.map(c => c.high));
  const low30 = Math.min(...last30.map(c => c.low));

  // Volume check
  const avgVol = ind.volume.avg20[i] ?? 1;
  const volRatio = candles[i].volume / avgVol;

  // 1. EXHAUSTION: ADX was >30 now dropping + RSI divergence + volume declining
  const adxFalling = adx < adx5ago - 3;
  const rsiOverbought = rsi > 65;
  const volumeDecline = volRatio < 0.7;
  if (adx > 20 && adxFalling && (rsiOverbought || rsi < 35) && volumeDecline) {
    return { regime: 'EXHAUSTION', confidence: 70, details: 'ADX falling, RSI extreme, volume declining', recommendedStrategies: [], avoidStrategies: ['trend', 'breakout', 'momentum', 'combined_ai', 'reversion', 'pattern'], sizeMultiplier: 0 };
  }

  // 2. BREAKOUT: price breaks 30-period range + volume spike + ADX rising
  const breakUp = close > high30 * 0.998;
  const breakDown = close < low30 * 1.002;
  if ((breakUp || breakDown) && volRatio > 1.5 && adx > adx5ago) {
    return { regime: 'BREAKOUT', confidence: 75, details: `${breakUp ? 'Upside' : 'Downside'} breakout with volume`, recommendedStrategies: ['breakout', 'trend'], avoidStrategies: ['reversion'], sizeMultiplier: 1.2 };
  }

  // 3. VOLATILE: ATR > 2x average + BB expanding
  if (atrRatio > 2) {
    return { regime: 'VOLATILE', confidence: 70, details: `ATR ${atrRatio.toFixed(1)}x average, high volatility`, recommendedStrategies: ['combined_ai'], avoidStrategies: ['breakout', 'trend'], sizeMultiplier: 0.5 };
  }

  // 4. TRENDING_UP: SMA20 > SMA50, ADX > 25, higher highs
  if (sma50 !== null && ema21 > sma50 && adx > 25 && higherHighs >= lowerLows) {
    return { regime: 'TRENDING_UP', confidence: Math.min(50 + adx, 95), details: `ADX ${adx.toFixed(0)}, EMA21 > SMA50, making higher highs`, recommendedStrategies: ['trend', 'momentum', 'combined_ai'], avoidStrategies: ['reversion'], sizeMultiplier: 1.0 };
  }

  // 5. TRENDING_DOWN: SMA20 < SMA50, ADX > 25, lower lows
  if (sma50 !== null && ema21 < sma50 && adx > 25 && lowerLows >= higherHighs) {
    return { regime: 'TRENDING_DOWN', confidence: Math.min(50 + adx, 95), details: `ADX ${adx.toFixed(0)}, EMA21 < SMA50, making lower lows`, recommendedStrategies: ['reversion', 'pattern'], avoidStrategies: ['trend', 'breakout'], sizeMultiplier: 1.0 };
  }

  // 6. RANGING (default)
  return { regime: 'RANGING', confidence: 60, details: `ADX ${adx.toFixed(0)} (weak), price in range`, recommendedStrategies: ['reversion', 'combined_ai'], avoidStrategies: ['trend', 'breakout'], sizeMultiplier: 0.8 };
}
