// ═══════════════════════════════════════════════════════════════
// Trap Detector — identifies bull traps, bear traps, fakeouts
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';

export interface TrapAnalysis {
  trapped: boolean;
  trapType: 'NONE' | 'BULL_TRAP' | 'BEAR_TRAP' | 'FAKEOUT' | 'STOP_HUNT';
  confidence: number;
  recommendation: string;
}

export function detectTrap(candles: OHLCV[], signal: 'BUY' | 'SELL'): TrapAnalysis {
  if (candles.length < 25) return { trapped: false, trapType: 'NONE', confidence: 0, recommendation: 'Insufficient data' };

  const last20 = candles.slice(-20);
  const high20 = Math.max(...last20.map(c => c.high));
  const low20 = Math.min(...last20.map(c => c.low));
  const avgVol = last20.reduce((s, c) => s + c.volume, 0) / 20;
  const lastC = candles[candles.length - 1];
  const prevC = candles[candles.length - 2];

  // Bull trap: prev closed above high20, last closed back below
  if (signal === 'BUY' && prevC.close > high20 && lastC.close < high20) {
    return { trapped: true, trapType: 'BULL_TRAP', confidence: 75, recommendation: 'Breakout failed — skip BUY' };
  }

  // Bear trap: prev closed below low20, last closed back above
  if (signal === 'SELL' && prevC.close < low20 && lastC.close > low20) {
    return { trapped: true, trapType: 'BEAR_TRAP', confidence: 75, recommendation: 'Breakdown failed — skip SELL' };
  }

  // Fakeout: breakout on low volume
  if (signal === 'BUY' && lastC.close > high20 && avgVol > 0 && lastC.volume < avgVol * 0.8) {
    return { trapped: true, trapType: 'FAKEOUT', confidence: 65, recommendation: 'Low volume breakout — likely fakeout' };
  }
  if (signal === 'SELL' && lastC.close < low20 && avgVol > 0 && lastC.volume < avgVol * 0.8) {
    return { trapped: true, trapType: 'FAKEOUT', confidence: 65, recommendation: 'Low volume breakdown — likely fakeout' };
  }

  // Stop hunt: long shadow, small body, range > 1.5x typical
  const body = Math.abs(lastC.close - lastC.open);
  const range = lastC.high - lastC.low;
  if (range > 0) {
    const bodyRatio = body / range;
    // Compute simple ATR
    let atrSum = 0;
    for (let j = candles.length - 14; j < candles.length; j++) {
      if (j > 0) atrSum += candles[j].high - candles[j].low;
    }
    const atr = atrSum / 14;

    if (bodyRatio < 0.3 && range > atr * 1.5) {
      return { trapped: true, trapType: 'STOP_HUNT', confidence: 60, recommendation: 'Possible stop hunt — wait' };
    }
  }

  return { trapped: false, trapType: 'NONE', confidence: 0, recommendation: 'Clear' };
}
