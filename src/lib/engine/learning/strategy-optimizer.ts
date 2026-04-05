// ═══════════════════════════════════════════════════════════════
// Strategy Optimizer — finds optimal parameters per asset+strategy
// ═══════════════════════════════════════════════════════════════

import type { TradeOutcome, OptimizedParams, ConditionStats } from './types';
import { loadOutcomes } from './outcome-tracker';

function calcWinRate(trades: TradeOutcome[]): number {
  if (trades.length === 0) return 0;
  return (trades.filter(t => t.won).length / trades.length) * 100;
}

function calcAvgPnlPct(trades: TradeOutcome[]): number {
  if (trades.length === 0) return 0;
  return trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length;
}

/** Find optimal stop loss percentage */
function findOptimalSL(outcomes: TradeOutcome[]): number {
  const losers = outcomes.filter(t => !t.won && t.pnlPercent < 0);
  if (losers.length < 10) return 3; // default

  // Find the SL that would have cut losses without stopping out winners
  const losses = losers.map(t => Math.abs(t.pnlPercent));
  losses.sort((a, b) => a - b);

  // 70th percentile of losses = good SL level
  const idx = Math.floor(losses.length * 0.7);
  return Math.round(losses[idx] * 10) / 10;
}

/** Find optimal take profit percentage */
function findOptimalTP(outcomes: TradeOutcome[]): number {
  const winners = outcomes.filter(t => t.won && t.pnlPercent > 0);
  if (winners.length < 10) return 6; // default

  const gains = winners.map(t => t.pnlPercent);
  gains.sort((a, b) => a - b);

  // 60th percentile of wins = good TP level (captures most wins)
  const idx = Math.floor(gains.length * 0.6);
  return Math.round(gains[idx] * 10) / 10;
}

/** Find optimal confidence threshold */
function findOptimalConfidence(outcomes: TradeOutcome[]): number {
  let bestThreshold = 0.70;
  let bestScore = 0; // winRate * avgPnl

  for (let threshold = 0.50; threshold <= 0.90; threshold += 0.05) {
    const trades = outcomes.filter(o => o.entryContext.masterScore >= threshold * 100);
    if (trades.length >= 10) {
      const wr = calcWinRate(trades);
      const avgPnl = calcAvgPnlPct(trades);
      const score = wr * Math.max(avgPnl, 0);
      if (score > bestScore) {
        bestScore = score;
        bestThreshold = threshold;
      }
    }
  }

  return bestThreshold;
}

/** Optimize a strategy for a specific asset */
export async function optimizeStrategy(strategy: string, asset: string): Promise<OptimizedParams> {
  const allOutcomes = await loadOutcomes(asset);
  const outcomes = allOutcomes.filter(o => o.entryContext.strategy === strategy);

  // Default params
  const defaultWR = calcWinRate(allOutcomes);
  const defaultPnl = calcAvgPnlPct(allOutcomes);

  if (outcomes.length < 15) {
    return {
      strategy, asset,
      optimalStopLoss: 3, optimalTakeProfit: 6, optimalConfidence: 0.70,
      improvement: { winRateDelta: 0, pnlDelta: 0 },
      sampleSize: outcomes.length,
    };
  }

  const optimalSL = findOptimalSL(outcomes);
  const optimalTP = findOptimalTP(outcomes);
  const optimalConf = findOptimalConfidence(outcomes);

  // Simulate improvement: filter trades that would have been taken with optimized params
  const optimizedTrades = outcomes.filter(o =>
    o.entryContext.masterScore >= optimalConf * 100 &&
    Math.abs(o.pnlPercent) <= optimalSL * 2, // proxy for reasonable SL
  );

  const optimizedWR = calcWinRate(optimizedTrades);
  const optimizedPnl = calcAvgPnlPct(optimizedTrades);

  return {
    strategy, asset,
    optimalStopLoss: optimalSL,
    optimalTakeProfit: optimalTP,
    optimalConfidence: optimalConf,
    improvement: {
      winRateDelta: Math.round((optimizedWR - defaultWR) * 10) / 10,
      pnlDelta: Math.round((optimizedPnl - defaultPnl) * 100) / 100,
    },
    sampleSize: outcomes.length,
  };
}

/** Optimize all strategies for an asset */
export async function optimizeAllStrategies(asset: string): Promise<OptimizedParams[]> {
  const strategies = ['combined_ai', 'trend', 'momentum', 'reversion', 'breakout', 'pattern'];
  const results: OptimizedParams[] = [];

  for (const s of strategies) {
    results.push(await optimizeStrategy(s, asset));
  }

  return results.filter(r => r.sampleSize >= 10).sort((a, b) => b.improvement.winRateDelta - a.improvement.winRateDelta);
}
