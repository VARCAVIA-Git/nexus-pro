// ═══════════════════════════════════════════════════════════════
// Strategy Runner — unified adapter for custom + famous strategies
// Both types are wrapped into a uniform RunnableStrategy interface
// that can be evaluated bar-by-bar in a single robust backtest loop.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators, StrategyKey } from '@/types';
import { strategyMap } from '@/lib/engine/strategies';
import { FAMOUS_STRATEGIES } from './famous-strategies';

export interface RunnableStrategy {
  name: string;
  type: 'custom' | 'famous';
  /** Evaluate at a specific bar index. Returns BUY/SELL/HOLD with confidence (0-100). */
  run: (candles: OHLCV[], i: number) => { direction: 'BUY' | 'SELL' | 'HOLD'; confidence: number };
}

/**
 * Build the unified list of all 12 strategies (6 custom + 6 famous).
 * Custom strategies use pre-computed indicators (passed in).
 * Famous strategies use their own per-bar entry functions.
 */
export function getAllRunnableStrategies(indicators: Indicators): RunnableStrategy[] {
  const all: RunnableStrategy[] = [];

  // ── Custom strategies (require pre-computed indicators) ──
  const customKeys: StrategyKey[] = ['trend', 'reversion', 'breakout', 'momentum', 'pattern', 'combined_ai'];
  for (const key of customKeys) {
    const strat = strategyMap[key];
    if (!strat) continue;
    all.push({
      name: key,
      type: 'custom',
      run: (candles, i) => {
        try {
          const d = strat.shouldEnter(candles, indicators, i);
          if (!d.enter) return { direction: 'HOLD', confidence: 0 };
          return {
            direction: d.side === 'LONG' ? 'BUY' : 'SELL',
            confidence: Math.round(d.confidence * 100),
          };
        } catch {
          return { direction: 'HOLD', confidence: 0 };
        }
      },
    });
  }

  // ── Famous strategies (use their entryAt function) ──
  for (const fs of FAMOUS_STRATEGIES) {
    all.push({
      name: `${fs.name} (${fs.author})`,
      type: 'famous',
      run: (candles, i) => {
        try {
          const sig = fs.entryAt(i, candles);
          if (sig === 'long') return { direction: 'BUY', confidence: 70 };
          if (sig === 'short') return { direction: 'SELL', confidence: 70 };
          return { direction: 'HOLD', confidence: 0 };
        } catch {
          return { direction: 'HOLD', confidence: 0 };
        }
      },
    });
  }

  console.log(`[STRATEGY-RUNNER] Built ${all.length} strategies: ${all.map(s => `${s.name}(${s.type})`).join(', ')}`);
  return all;
}

// ── Robust simple backtest with intracandle SL/TP and time stop ──

export interface SimpleBacktestResult {
  totalReturn: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * Robust per-bar backtest:
 * - Pre-computed indicators captured by strategy.run via closure
 * - Intracandle SL/TP using high/low (not just close)
 * - Time stop after 30 bars
 * - 2% position sizing (compound)
 */
export function simpleBacktest(
  candles: OHLCV[],
  strategy: RunnableStrategy,
  slPct: number,
  tpPct: number,
): SimpleBacktestResult {
  const initialCapital = 10000;
  let capital = initialCapital;
  let maxCapital = capital;
  let maxDrawdown = 0;
  const tradePnls: number[] = [];

  let position: { side: 'long' | 'short'; entry: number; idx: number } | null = null;

  // Start at bar 50 — enough warmup for indicators (RSI, MACD, BB, ADX, SMA50)
  for (let i = 50; i < candles.length; i++) {
    const c = candles[i];

    // ── Manage open position ──
    if (position) {
      let pnl: number | null = null;
      if (position.side === 'long') {
        const worstCase = (c.low - position.entry) / position.entry;
        const bestCase = (c.high - position.entry) / position.entry;
        if (worstCase <= -slPct) pnl = -slPct;
        else if (bestCase >= tpPct) pnl = tpPct;
        else if (i - position.idx >= 30) pnl = (c.close - position.entry) / position.entry;
      } else {
        const worstCase = (position.entry - c.high) / position.entry;
        const bestCase = (position.entry - c.low) / position.entry;
        if (worstCase <= -slPct) pnl = -slPct;
        else if (bestCase >= tpPct) pnl = tpPct;
        else if (i - position.idx >= 30) pnl = (position.entry - c.close) / position.entry;
      }

      if (pnl !== null) {
        const tradeSize = capital * 0.02;
        capital += tradeSize * pnl;
        tradePnls.push(pnl * 100);
        if (capital > maxCapital) maxCapital = capital;
        const dd = ((capital - maxCapital) / maxCapital) * 100;
        if (dd < maxDrawdown) maxDrawdown = dd;
        position = null;
      }
    }

    // ── Look for new entry ──
    if (!position) {
      const sig = strategy.run(candles, i);
      if (sig.direction === 'BUY' && sig.confidence > 40) {
        position = { side: 'long', entry: c.close, idx: i };
      } else if (sig.direction === 'SELL' && sig.confidence > 40) {
        position = { side: 'short', entry: c.close, idx: i };
      }
    }
  }

  // Stats
  const wins = tradePnls.filter(p => p > 0);
  const losses = tradePnls.filter(p => p <= 0);
  const winRate = tradePnls.length > 0 ? (wins.length / tradePnls.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const avgReturn = tradePnls.length > 0 ? tradePnls.reduce((a, b) => a + b, 0) / tradePnls.length : 0;
  const stdReturn = tradePnls.length > 1
    ? Math.sqrt(tradePnls.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (tradePnls.length - 1))
    : 1;
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  const totalReturn = ((capital - initialCapital) / initialCapital) * 100;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalTrades: tradePnls.length,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
  };
}
