// ═══════════════════════════════════════════════════════════════
// Dynamic Position Manager — active management after entry
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import type { MarketRegime } from '../perception/regime-classifier';

export interface PositionAction {
  action: 'HOLD' | 'CLOSE_PARTIAL' | 'CLOSE_ALL' | 'MOVE_STOP';
  reason: string;
  percentage?: number;
  newStopPrice?: number;
}

export function managePosition(
  pos: { entryPrice: number; currentPrice: number; side: 'LONG' | 'SHORT'; stopLoss: number; candlesSinceEntry: number },
  candles: OHLCV[],
  regime: MarketRegime,
): PositionAction {
  if (candles.length < 14) return { action: 'HOLD', reason: 'Insufficient data' };

  // Compute ATR
  const atrSlice = candles.slice(-14);
  let atrSum = 0;
  for (let j = 1; j < atrSlice.length; j++) atrSum += Math.max(atrSlice[j].high - atrSlice[j].low, Math.abs(atrSlice[j].high - atrSlice[j - 1].close), Math.abs(atrSlice[j].low - atrSlice[j - 1].close));
  const atr = atrSum / Math.max(atrSlice.length - 1, 1);
  if (atr <= 0) return { action: 'HOLD', reason: 'Zero ATR' };

  const mult = pos.side === 'LONG' ? 1 : -1;
  const pnl = (pos.currentPrice - pos.entryPrice) * mult;
  const pnlATR = pnl / atr;
  const pnlPct = pos.entryPrice > 0 ? (pnl / pos.entryPrice) * 100 : 0;

  // Trail multiplier by regime
  const trail = regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN' ? 1.5 : regime === 'VOLATILE' ? 2.0 : 0.8;

  // 1. Regime change to EXHAUSTION while in profit → close all
  if (regime === 'EXHAUSTION' && pnl > 0) {
    return { action: 'CLOSE_ALL', reason: 'Regime EXHAUSTION, securing profit' };
  }

  // 2. Scale out at +3 ATR
  if (pnlATR >= 3) {
    return { action: 'CLOSE_PARTIAL', reason: `+${pnlATR.toFixed(1)} ATR — take partial profit`, percentage: 50 };
  }

  // 3. Scale out at +2 ATR
  if (pnlATR >= 2) {
    return { action: 'CLOSE_PARTIAL', reason: `+${pnlATR.toFixed(1)} ATR — scale out`, percentage: 25 };
  }

  // 4. Trail stop at +1 ATR
  if (pnlATR >= 1) {
    const newStop = pos.side === 'LONG' ? pos.currentPrice - atr * trail : pos.currentPrice + atr * trail;
    const isBetter = pos.side === 'LONG' ? newStop > pos.stopLoss : newStop < pos.stopLoss;
    if (isBetter) {
      return { action: 'MOVE_STOP', reason: `Trail ${trail}x ATR (${regime})`, newStopPrice: Math.round(newStop * 100) / 100 };
    }
  }

  // 5. Time stop: flat after 20 candles
  if (pos.candlesSinceEntry >= 20 && Math.abs(pnlPct) < 0.5) {
    return { action: 'CLOSE_ALL', reason: 'Time stop — flat after 20 candles' };
  }

  return { action: 'HOLD', reason: `P&L: ${pnlATR.toFixed(1)} ATR` };
}
