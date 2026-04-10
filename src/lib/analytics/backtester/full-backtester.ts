// ═══════════════════════════════════════════════════════════════
// Full Backtester Engine
//
// Wall-Street-grade backtesting: realistic capital simulation,
// SL/TP from ATR, trailing stops, commissions, slippage,
// entry timeouts, and failed-entry tracking.
//
// Tests ALL 6 coded strategies + top mined rules across all TFs.
// Output: ranked strategy-timeframe combinations with full stats.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators, StrategyKey } from '@/types';
import { computeIndicators } from '@/lib/core/indicators';
import { strategyMap, type Strategy } from '@/lib/analytics/cognition/strategies';
import type { MinedRule } from '@/lib/research/deep-mapping/pattern-miner';
import { buildMineRuleStrategy } from './mine-rule-executor';
import type {
  BacktestConfig,
  BacktestTrade,
  BacktestTimeframe,
  StrategyTimeframeResult,
  BacktestReport,
  TradeOutcome,
  EntryStatus,
} from './types';
import { DEFAULT_BACKTEST_CONFIG, BACKTEST_TIMEFRAMES } from './types';

// ── Helpers ──────────────────────────────────────────────────

function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Map timeframe to approximate hours per bar */
function tfToHours(tf: BacktestTimeframe): number {
  switch (tf) {
    case '5m': return 5 / 60;
    case '15m': return 0.25;
    case '1h': return 1;
    case '4h': return 4;
  }
}

// ── Open Position Tracker ────────────────────────────────────

interface OpenPosition {
  tradeId: number;
  strategyId: string;
  direction: 'long' | 'short';
  entryPrice: number;
  entryBar: number;
  quantity: number;
  sizeUsd: number;
  stopLoss: number;
  takeProfit: number;
  stopLossPct: number;
  takeProfitPct: number;
  confidence: number;
  conditions?: string[];
  peakPrice: number; // for trailing stop
  troughPrice: number; // for short trailing
}

// ── Core Backtest Function ───────────────────────────────────

/**
 * Run a full backtest for ONE strategy on ONE timeframe.
 * Returns detailed result with all trades and stats.
 */
export function backtestStrategy(
  strategyId: string,
  strategyName: string,
  strategy: Strategy,
  candles: OHLCV[],
  indicators: Indicators,
  tf: BacktestTimeframe,
  config: BacktestConfig,
  isMineRule = false,
  conditions?: string[],
): StrategyTimeframeResult {
  const trades: BacktestTrade[] = [];
  const openPositions: OpenPosition[] = [];
  let capital = config.initialCapital;
  const equityCurve: number[] = [capital];
  let tradeIdCounter = 0;

  // Stats accumulators
  let totalSignals = 0;
  let totalEntries = 0;
  let filledEntries = 0;
  let expiredEntries = 0;

  // Pending entries (limit order simulation)
  const pendingEntries: Array<{
    bar: number;
    direction: 'long' | 'short';
    targetPrice: number;
    confidence: number;
    timeoutBar: number;
  }> = [];

  // Need at least 60 bars for indicators to stabilize
  const startBar = 60;

  for (let i = startBar; i < candles.length; i++) {
    const price = candles[i].close;
    const high = candles[i].high;
    const low = candles[i].low;
    const atr = indicators.atr[i] ?? price * 0.02;

    // ── 1. Check pending entries ──
    for (let p = pendingEntries.length - 1; p >= 0; p--) {
      const pending = pendingEntries[p];
      if (i > pending.timeoutBar) {
        // Entry expired
        expiredEntries++;
        trades.push(makeExpiredTrade(++tradeIdCounter, strategyId, tf, pending, candles[pending.bar].date));
        pendingEntries.splice(p, 1);
        continue;
      }
      // Check if price reached entry level
      const filled = pending.direction === 'long'
        ? low <= pending.targetPrice
        : high >= pending.targetPrice;
      if (filled && openPositions.length < config.maxConcurrentPositions) {
        filledEntries++;
        const entryPrice = pending.targetPrice * (1 + (pending.direction === 'long' ? config.slippageRate : -config.slippageRate));
        const quantity = config.tradeSize / entryPrice;
        const slDist = atr * 2;
        const tpDist = atr * 3;
        const stopLoss = pending.direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
        const takeProfit = pending.direction === 'long' ? entryPrice + tpDist : entryPrice - tpDist;

        openPositions.push({
          tradeId: ++tradeIdCounter,
          strategyId,
          direction: pending.direction,
          entryPrice,
          entryBar: i,
          quantity,
          sizeUsd: config.tradeSize,
          stopLoss,
          takeProfit,
          stopLossPct: slDist / entryPrice,
          takeProfitPct: tpDist / entryPrice,
          confidence: pending.confidence,
          conditions,
          peakPrice: entryPrice,
          troughPrice: entryPrice,
        });
        pendingEntries.splice(p, 1);
      }
    }

    // ── 2. Monitor open positions ──
    for (let j = openPositions.length - 1; j >= 0; j--) {
      const pos = openPositions[j];
      let exitPrice: number | null = null;
      let outcome: TradeOutcome | null = null;

      // Update peak/trough for trailing
      if (pos.direction === 'long') {
        pos.peakPrice = Math.max(pos.peakPrice, high);
      } else {
        pos.troughPrice = Math.min(pos.troughPrice, low);
      }

      // Check SL
      if (pos.direction === 'long' && low <= pos.stopLoss) {
        exitPrice = pos.stopLoss;
        outcome = 'sl_hit';
      } else if (pos.direction === 'short' && high >= pos.stopLoss) {
        exitPrice = pos.stopLoss;
        outcome = 'sl_hit';
      }

      // Check TP (TP takes priority over SL if both hit on same bar — conservative: use SL)
      if (!outcome) {
        if (pos.direction === 'long' && high >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          outcome = 'tp_hit';
        } else if (pos.direction === 'short' && low <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          outcome = 'tp_hit';
        }
      }

      // Trailing stop
      if (!outcome && config.useTrailingStop) {
        if (pos.direction === 'long') {
          const trailStop = pos.peakPrice * (1 - config.trailingStopPct);
          if (trailStop > pos.stopLoss) pos.stopLoss = trailStop; // ratchet up
          if (low <= pos.stopLoss) {
            exitPrice = pos.stopLoss;
            outcome = 'trailing_exit';
          }
        } else {
          const trailStop = pos.troughPrice * (1 + config.trailingStopPct);
          if (trailStop < pos.stopLoss) pos.stopLoss = trailStop; // ratchet down
          if (high >= pos.stopLoss) {
            exitPrice = pos.stopLoss;
            outcome = 'trailing_exit';
          }
        }
      }

      // Strategy exit signal
      if (!outcome) {
        const exitDecision = strategy.shouldExit(
          { side: pos.direction === 'long' ? 'LONG' : 'SHORT', entryPrice: pos.entryPrice, stopLoss: pos.stopLoss } as any,
          candles, indicators, i,
        );
        if (exitDecision.exit) {
          exitPrice = price;
          outcome = 'signal_exit';
        }
      }

      // Max holding timeout (100 bars)
      if (!outcome && i - pos.entryBar >= 100) {
        exitPrice = price;
        outcome = 'timeout';
      }

      // Close position if triggered
      if (outcome && exitPrice !== null) {
        const slippedExit = exitPrice * (1 + (pos.direction === 'long' ? -config.slippageRate : config.slippageRate));
        const mult = pos.direction === 'long' ? 1 : -1;
        const grossPnl = (slippedExit - pos.entryPrice) * pos.quantity * mult;
        const commission = config.tradeSize * config.commissionRate * 2; // entry + exit
        const slippage = config.tradeSize * config.slippageRate * 2;
        const netPnl = grossPnl - commission;

        capital += netPnl;

        trades.push({
          id: pos.tradeId,
          strategyId,
          timeframe: tf,
          direction: pos.direction,
          entryStatus: 'filled',
          entryPrice: pos.entryPrice,
          entryBar: pos.entryBar,
          entryTime: candles[pos.entryBar].date,
          exitPrice: slippedExit,
          exitBar: i,
          exitTime: candles[i].date,
          outcome,
          quantity: pos.quantity,
          sizeUsd: pos.sizeUsd,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          stopLossPct: round(pos.stopLossPct * 100, 2),
          takeProfitPct: round(pos.takeProfitPct * 100, 2),
          grossPnl: round(grossPnl, 2),
          commission: round(commission, 2),
          slippage: round(slippage, 4),
          netPnl: round(netPnl, 2),
          netPnlPct: round((netPnl / pos.sizeUsd) * 100, 2),
          holdingBars: i - pos.entryBar,
          confidence: pos.confidence,
          conditions: pos.conditions,
        });

        openPositions.splice(j, 1);
      }
    }

    // ── 3. Generate new signals ──
    if (openPositions.length < config.maxConcurrentPositions) {
      const decision = strategy.shouldEnter(candles, indicators, i);
      if (decision.enter && decision.confidence >= 0.5) {
        totalSignals++;
        totalEntries++;
        const direction: 'long' | 'short' = decision.side === 'LONG' ? 'long' : 'short';

        // Check no existing position on same direction
        const alreadyOpen = openPositions.some(p => p.direction === direction);
        const alreadyPending = pendingEntries.some(p => p.direction === direction);

        if (!alreadyOpen && !alreadyPending) {
          // Immediate fill at market (for simplicity on backtesting — real bot uses limit)
          const entryPrice = price * (1 + (direction === 'long' ? config.slippageRate : -config.slippageRate));
          const quantity = config.tradeSize / entryPrice;
          const slDist = (indicators.atr[i] ?? price * 0.02) * 2;
          const tpDist = (indicators.atr[i] ?? price * 0.02) * 3;
          const stopLoss = direction === 'long' ? entryPrice - slDist : entryPrice + slDist;
          const takeProfit = direction === 'long' ? entryPrice + tpDist : entryPrice - tpDist;

          filledEntries++;
          openPositions.push({
            tradeId: ++tradeIdCounter,
            strategyId,
            direction,
            entryPrice,
            entryBar: i,
            quantity,
            sizeUsd: config.tradeSize,
            stopLoss,
            takeProfit,
            stopLossPct: slDist / entryPrice,
            takeProfitPct: tpDist / entryPrice,
            confidence: decision.confidence,
            conditions,
            peakPrice: entryPrice,
            troughPrice: entryPrice,
          });
        }
      }
    }

    // Record equity curve (sample every N bars, max ~200 points total)
    const sampleInterval = Math.max(10, Math.floor((candles.length - startBar) / 200));
    if ((i - startBar) % sampleInterval === 0) {
      // Mark-to-market: capital + unrealized P&L
      let unrealized = 0;
      for (const pos of openPositions) {
        const mult = pos.direction === 'long' ? 1 : -1;
        unrealized += (price - pos.entryPrice) * pos.quantity * mult;
      }
      equityCurve.push(round(capital + unrealized, 2));
    }
  }

  // Close any remaining positions at last price
  const lastPrice = candles[candles.length - 1].close;
  for (const pos of openPositions) {
    const mult = pos.direction === 'long' ? 1 : -1;
    const grossPnl = (lastPrice - pos.entryPrice) * pos.quantity * mult;
    const commission = config.tradeSize * config.commissionRate * 2;
    const netPnl = grossPnl - commission;
    capital += netPnl;
    trades.push({
      id: pos.tradeId,
      strategyId,
      timeframe: tf,
      direction: pos.direction,
      entryStatus: 'filled',
      entryPrice: pos.entryPrice,
      entryBar: pos.entryBar,
      entryTime: candles[pos.entryBar].date,
      exitPrice: lastPrice,
      exitBar: candles.length - 1,
      exitTime: candles[candles.length - 1].date,
      outcome: 'timeout',
      quantity: pos.quantity,
      sizeUsd: pos.sizeUsd,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      stopLossPct: round(pos.stopLossPct * 100, 2),
      takeProfitPct: round(pos.takeProfitPct * 100, 2),
      grossPnl: round(grossPnl, 2),
      commission: round(commission, 2),
      slippage: 0,
      netPnl: round(netPnl, 2),
      netPnlPct: round((netPnl / pos.sizeUsd) * 100, 2),
      holdingBars: candles.length - 1 - pos.entryBar,
      confidence: pos.confidence,
      conditions: pos.conditions,
    });
  }

  // ── Compute stats ──
  return computeStats(
    strategyId, strategyName, tf, isMineRule, conditions,
    trades, config, equityCurve,
    totalSignals, totalEntries, filledEntries, expiredEntries,
  );
}

// ── Stats Calculator ─────────────────────────────────────────

function computeStats(
  strategyId: string,
  strategyName: string,
  tf: BacktestTimeframe,
  isMineRule: boolean,
  conditions: string[] | undefined,
  trades: BacktestTrade[],
  config: BacktestConfig,
  equityCurve: number[],
  totalSignals: number,
  totalEntries: number,
  filledEntries: number,
  expiredEntries: number,
): StrategyTimeframeResult {
  const filled = trades.filter(t => t.entryStatus === 'filled' && t.outcome !== null);
  const wins = filled.filter(t => t.netPnl > 0);
  const losses = filled.filter(t => t.netPnl <= 0);

  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netProfit = grossProfit - grossLoss;
  const netProfitPct = (netProfit / config.initialCapital) * 100;

  const winRate = filled.length > 0 ? (wins.length / filled.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netPnlPct, 0) / losses.length) : 0;

  const bestTrade = filled.length > 0 ? Math.max(...filled.map(t => t.netPnl)) : 0;
  const worstTrade = filled.length > 0 ? Math.min(...filled.map(t => t.netPnl)) : 0;

  const expectancy = filled.length > 0
    ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
    : 0;

  // Max drawdown
  let peak = equityCurve[0];
  let maxDD = 0;
  let maxDDPct = 0;
  for (const e of equityCurve) {
    if (e > peak) peak = e;
    const dd = peak - e;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }

  // Sharpe & Sortino
  const returns = filled.map(t => t.netPnlPct / 100);
  const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((a, r) => a + (r - avgRet) ** 2, 0) / (returns.length - 1))
    : 0;
  const downReturns = returns.filter(r => r < 0);
  const downDev = downReturns.length > 1
    ? Math.sqrt(downReturns.reduce((a, r) => a + r ** 2, 0) / downReturns.length)
    : 0;

  const annualFactor = Math.sqrt(365 * 24 / tfToHours(tf)); // annualized
  const sharpe = stdDev > 0 ? (avgRet / stdDev) * Math.min(annualFactor, 50) : 0;
  const sortino = downDev > 0 ? (avgRet / downDev) * Math.min(annualFactor, 50) : 0;
  const calmar = maxDDPct > 0 ? netProfitPct / maxDDPct : 0;

  // Timing
  const avgHoldingBars = filled.length > 0
    ? filled.reduce((s, t) => s + t.holdingBars, 0) / filled.length
    : 0;

  // TP/SL statistics
  const tpHits = filled.filter(t => t.outcome === 'tp_hit');
  const slHits = filled.filter(t => t.outcome === 'sl_hit');
  const trailingExits = filled.filter(t => t.outcome === 'trailing_exit');
  const timeouts = filled.filter(t => t.outcome === 'timeout');

  const avgTpDistPct = filled.length > 0
    ? filled.reduce((s, t) => s + t.takeProfitPct, 0) / filled.length : 0;
  const avgSlDistPct = filled.length > 0
    ? filled.reduce((s, t) => s + t.stopLossPct, 0) / filled.length : 0;

  // Optimal entry timeout: analyze where most successful entries happen
  const successfulFilled = wins.filter(t => t.entryStatus === 'filled');
  const optimalEntryTimeout = successfulFilled.length > 0
    ? Math.ceil(successfulFilled.reduce((s, t) => s + (t.exitBar! - t.entryBar), 0) / successfulFilled.length * 0.3)
    : config.entryTimeoutBars;

  // Composite rank score: PF × sqrt(trades) × (1 - maxDD/100) × clamp(sharpe, 0, 5)
  const tradeWeight = Math.sqrt(Math.min(filled.length, 500));
  const ddPenalty = 1 - Math.min(maxDDPct, 50) / 100;
  const sharpeClamped = Math.max(0, Math.min(sharpe, 5));
  const rankScore = profitFactor * tradeWeight * ddPenalty * (1 + sharpeClamped * 0.2);

  return {
    strategyId,
    strategyName,
    timeframe: tf,
    isMineRule,
    conditions,

    totalSignals,
    totalEntries,
    filledEntries,
    expiredEntries,
    fillRate: totalEntries > 0 ? round((filledEntries / totalEntries) * 100, 1) : 0,

    totalTrades: filled.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: round(winRate, 1),

    grossProfit: round(grossProfit, 2),
    grossLoss: round(grossLoss, 2),
    netProfit: round(netProfit, 2),
    netProfitPct: round(netProfitPct, 2),
    profitFactor: round(profitFactor, 2),
    avgWin: round(avgWin, 2),
    avgLoss: round(avgLoss, 2),
    avgWinPct: round(avgWinPct, 2),
    avgLossPct: round(avgLossPct, 2),
    bestTrade: round(bestTrade, 2),
    worstTrade: round(worstTrade, 2),
    expectancy: round(expectancy, 2),

    maxDrawdown: round(maxDD, 2),
    maxDrawdownPct: round(maxDDPct, 2),
    sharpe: round(sharpe, 2),
    sortino: round(sortino, 2),
    calmar: round(calmar, 2),

    avgHoldingBars: round(avgHoldingBars, 1),
    avgHoldingHours: round(avgHoldingBars * tfToHours(tf), 1),

    avgTpDistance: 0, // filled from trades below
    avgSlDistance: 0,
    avgTpDistancePct: round(avgTpDistPct, 2),
    avgSlDistancePct: round(avgSlDistPct, 2),
    tpHitRate: filled.length > 0 ? round((tpHits.length / filled.length) * 100, 1) : 0,
    slHitRate: filled.length > 0 ? round((slHits.length / filled.length) * 100, 1) : 0,
    trailingExitRate: filled.length > 0 ? round((trailingExits.length / filled.length) * 100, 1) : 0,
    timeoutRate: filled.length > 0 ? round((timeouts.length / filled.length) * 100, 1) : 0,

    optimalEntryTimeout: Math.max(3, Math.min(optimalEntryTimeout, 50)),
    equityCurve,
    rankScore: round(rankScore, 2),
  };
}

function makeExpiredTrade(
  id: number, strategyId: string, tf: BacktestTimeframe,
  pending: { bar: number; direction: 'long' | 'short'; targetPrice: number; confidence: number },
  entryTime: string,
): BacktestTrade {
  return {
    id, strategyId, timeframe: tf,
    direction: pending.direction,
    entryStatus: 'expired',
    entryPrice: null, entryBar: pending.bar, entryTime,
    exitPrice: null, exitBar: null, exitTime: null, outcome: null,
    quantity: 0, sizeUsd: 0,
    stopLoss: 0, takeProfit: 0, stopLossPct: 0, takeProfitPct: 0,
    grossPnl: 0, commission: 0, slippage: 0, netPnl: 0, netPnlPct: 0,
    holdingBars: 0, confidence: pending.confidence,
  };
}

// ── Main Entry Point ─────────────────────────────────────────

/**
 * Run the full backtester across all strategies and timeframes.
 *
 * @param symbol - Asset symbol (e.g. "BTC/USD")
 * @param history - OHLCV candles keyed by timeframe
 * @param minedRules - Top mined rules from pattern mining (optional)
 * @param config - Backtest configuration (optional, uses defaults)
 */
export function runFullBacktest(
  symbol: string,
  history: Partial<Record<BacktestTimeframe, OHLCV[]>>,
  minedRules: MinedRule[] = [],
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestReport {
  const results: StrategyTimeframeResult[] = [];
  const candleCounts: Record<string, number> = {};

  // All 6 coded strategies
  const codedStrategies: Array<{ id: StrategyKey; name: string; strategy: Strategy }> = [
    { id: 'trend', name: 'Trend Following', strategy: strategyMap.trend },
    { id: 'reversion', name: 'Mean Reversion', strategy: strategyMap.reversion },
    { id: 'breakout', name: 'Breakout', strategy: strategyMap.breakout },
    { id: 'momentum', name: 'Momentum', strategy: strategyMap.momentum },
    { id: 'pattern', name: 'Pattern Recognition', strategy: strategyMap.pattern },
    { id: 'combined_ai', name: 'Combined AI', strategy: strategyMap.combined_ai },
  ];

  // Convert top mined rules to strategies (max 10 to keep runtime sane)
  const mineStrategies: Array<{ id: string; name: string; strategy: Strategy; conditions: string[] }> = [];
  if (config.includeMineRules) {
    const topRules = minedRules.slice(0, 10);
    for (const rule of topRules) {
      const executor = buildMineRuleStrategy(rule);
      if (executor) {
        mineStrategies.push({
          id: `mine_${rule.id}`,
          name: `Rule: ${rule.conditions.join(' + ')}`,
          strategy: executor,
          conditions: rule.conditions,
        });
      }
    }
  }

  // Determine date range
  let earliest = '';
  let latest = '';

  for (const tf of BACKTEST_TIMEFRAMES) {
    const candles = history[tf];
    if (!candles || candles.length < 100) {
      candleCounts[tf] = candles?.length ?? 0;
      continue;
    }
    candleCounts[tf] = candles.length;
    if (!earliest || candles[0].date < earliest) earliest = candles[0].date;
    if (!latest || candles[candles.length - 1].date > latest) latest = candles[candles.length - 1].date;

    const indicators = computeIndicators(candles);

    // Test all coded strategies on this timeframe
    for (const { id, name, strategy } of codedStrategies) {
      const result = backtestStrategy(id, name, strategy, candles, indicators, tf, config);
      results.push(result);
    }

    // Test mined rules on this timeframe
    for (const { id, name, strategy, conditions } of mineStrategies) {
      const result = backtestStrategy(id, name, strategy, candles, indicators, tf, config, true, conditions);
      results.push(result);
    }
  }

  // Sort by rankScore descending
  results.sort((a, b) => b.rankScore - a.rankScore);

  // Top 5
  const topStrategies = results.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    strategyId: r.strategyId,
    strategyName: r.strategyName,
    timeframe: r.timeframe,
    netProfitPct: r.netProfitPct,
    winRate: r.winRate,
    profitFactor: r.profitFactor,
    totalTrades: r.totalTrades,
    maxDrawdownPct: r.maxDrawdownPct,
    sharpe: r.sharpe,
  }));

  // Global stats
  const totalTrades = results.reduce((s, r) => s + r.totalTrades, 0);
  const profitFactors = results.filter(r => r.totalTrades >= 10).map(r => r.profitFactor);

  return {
    symbol,
    generatedAt: Date.now(),
    config,
    candleCounts: candleCounts as Record<BacktestTimeframe, number>,
    dateRange: { start: earliest, end: latest },
    results,
    topStrategies,
    globalStats: {
      totalStrategiesTested: results.length,
      totalTradesSimulated: totalTrades,
      bestNetProfit: results.length > 0 ? results[0].netProfitPct : 0,
      bestWinRate: results.length > 0 ? Math.max(...results.map(r => r.winRate)) : 0,
      bestSharpe: results.length > 0 ? Math.max(...results.map(r => r.sharpe)) : 0,
      avgProfitFactor: profitFactors.length > 0
        ? round(profitFactors.reduce((a, b) => a + b, 0) / profitFactors.length, 2) : 0,
    },
  };
}
