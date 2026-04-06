// ═══════════════════════════════════════════════════════════════
// Smart Entry Timing — don't just know WHAT, know WHEN
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { MarketRegime } from './regime-classifier';

export interface EntryTiming {
  shouldEnterNow: boolean;
  reason: string;
  suggestedAction: 'ENTER_NOW' | 'WAIT_PULLBACK' | 'WAIT_VOLUME' | 'SKIP';
}

export function evaluateEntryTiming(candles: OHLCV[], currentPrice: number, signal: 'BUY' | 'SELL', regime: MarketRegime): EntryTiming {
  if (candles.length < 20) return { shouldEnterNow: true, reason: 'Insufficient data for timing', suggestedAction: 'ENTER_NOW' };

  const last = candles[candles.length - 1];
  const range = last.high - last.low;

  if (range <= 0) return { shouldEnterNow: true, reason: 'Zero range candle', suggestedAction: 'ENTER_NOW' };

  const pricePos = (currentPrice - last.low) / range;

  // 1. Pullback check
  if (signal === 'BUY' && pricePos > 0.85) {
    return { shouldEnterNow: false, reason: `Price at ${(pricePos * 100).toFixed(0)}% of candle — wait pullback`, suggestedAction: 'WAIT_PULLBACK' };
  }
  if (signal === 'SELL' && pricePos < 0.15) {
    return { shouldEnterNow: false, reason: `Price at ${(pricePos * 100).toFixed(0)}% of candle — wait bounce`, suggestedAction: 'WAIT_PULLBACK' };
  }

  // 2. Volume check — only if volume looks real (varies significantly, not synthetic)
  const vols = candles.slice(-20).map(c => c.volume);
  const avgVol = vols.reduce((s, v) => s + v, 0) / 20;
  const volStdDev = Math.sqrt(vols.reduce((s, v) => s + (v - avgVol) ** 2, 0) / 20);
  const volumeLooksReal = avgVol > 0 && volStdDev / avgVol > 0.1; // Real volume has >10% coefficient of variation
  if (volumeLooksReal && last.volume < avgVol * 0.7) {
    return { shouldEnterNow: false, reason: 'Volume below 70% average', suggestedAction: 'WAIT_VOLUME' };
  }

  // 3. Volatility spike
  const atrSlice = candles.slice(-14);
  let atrSum = 0;
  for (let j = 1; j < atrSlice.length; j++) atrSum += Math.max(atrSlice[j].high - atrSlice[j].low, Math.abs(atrSlice[j].high - atrSlice[j - 1].close), Math.abs(atrSlice[j].low - atrSlice[j - 1].close));
  const atr = atrSum / Math.max(atrSlice.length - 1, 1);
  if (range > atr * 2.5) {
    return { shouldEnterNow: false, reason: `Candle range ${(range / atr).toFixed(1)}x ATR — too volatile`, suggestedAction: 'SKIP' };
  }

  return { shouldEnterNow: true, reason: 'Timing checks passed', suggestedAction: 'ENTER_NOW' };
}
