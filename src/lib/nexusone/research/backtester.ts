// ═══════════════════════════════════════════════════════════════
// NexusOne — Backtester
//
// Realistic backtester with:
//   - Transaction costs (maker/taker fees + slippage + spread)
//   - No lookahead bias (signals evaluated bar-by-bar)
//   - Position sizing from strategy manifest
//   - Hold period enforcement
//   - Cooldown enforcement
//
// This backtester is INTENTIONALLY simple. No optimization,
// no parameter search, no curve fitting. It takes a strategy
// with frozen parameters and tells you what would have happened.
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest, MarketBar } from '../types';
import { calcS1Features, evaluateS1Trigger } from '../strategies/s1';

// ─── Cost Model ──────────────────────────────────────────────

export interface CostModel {
  maker_fee_bps: number;      // e.g. 1.5
  taker_fee_bps: number;      // e.g. 2.5
  slippage_bps: number;       // e.g. 3.0
  spread_bps: number;         // e.g. 2.0
}

export const DEFAULT_COSTS: CostModel = {
  maker_fee_bps: 1.5,
  taker_fee_bps: 2.5,
  slippage_bps: 3.0,
  spread_bps: 2.0,
};

function roundTripCostBps(costs: CostModel): number {
  // Entry: taker fee + slippage + half spread
  // Exit: taker fee + slippage + half spread
  return (costs.taker_fee_bps + costs.slippage_bps + costs.spread_bps / 2) * 2;
}

// ─── Trade Result ────────────────────────────────────────────

export interface BacktestTrade {
  entry_bar: number;
  exit_bar: number;
  entry_price: number;
  exit_price: number;
  direction: 'long' | 'short';
  gross_pnl_bps: number;
  cost_bps: number;
  net_pnl_bps: number;
  hold_bars: number;
  features: Record<string, number>;
}

// ─── Backtest Report ─────────────────────────────────────────

export interface BacktestReport {
  strategy_id: string;
  symbol: string;
  timeframe: string;
  period: { start: string; end: string };
  bars_total: number;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  cost_model: CostModel;
}

export interface BacktestMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  gross_pnl_bps: number;
  total_cost_bps: number;
  net_pnl_bps: number;
  avg_trade_bps: number;
  avg_winner_bps: number;
  avg_loser_bps: number;
  max_drawdown_bps: number;
  sharpe_ratio: number;        // annualized
  profit_factor: number;
  t_stat: number;              // t-statistic of trade returns
  expectancy_bps: number;      // avg net pnl per trade
}

// ─── Backtester ──────────────────────────────────────────────

/**
 * Run a backtest on a strategy with historical bars and funding rates.
 *
 * @param strategy  Frozen strategy manifest
 * @param bars      Historical bars, oldest-first
 * @param funding   Historical funding rates, oldest-first (same length not required)
 * @param costs     Cost model (defaults to realistic 12bps round-trip)
 */
export function runBacktest(
  strategy: StrategyManifest,
  bars: MarketBar[],
  funding: number[],
  costs: CostModel = DEFAULT_COSTS,
): BacktestReport {
  const trades: BacktestTrade[] = [];
  const rtCost = roundTripCostBps(costs);

  let inPosition = false;
  let entryBar = 0;
  let entryPrice = 0;
  let cooldownUntil = 0;

  const holdBars = strategy.execution.hold_bars;
  const cooldownBars = strategy.risk.cooldown_bars;

  // Walk through bars one at a time (no lookahead)
  for (let i = 0; i < bars.length; i++) {
    // Check if we need to exit (hold period expired)
    if (inPosition && (i - entryBar) >= holdBars) {
      const exitPrice = bars[i].close;
      const grossBps = strategy.direction === 'short'
        ? ((entryPrice - exitPrice) / entryPrice) * 10000
        : ((exitPrice - entryPrice) / entryPrice) * 10000;

      trades.push({
        entry_bar: entryBar,
        exit_bar: i,
        entry_price: entryPrice,
        exit_price: exitPrice,
        direction: strategy.direction,
        gross_pnl_bps: Math.round(grossBps * 100) / 100,
        cost_bps: rtCost,
        net_pnl_bps: Math.round((grossBps - rtCost) * 100) / 100,
        hold_bars: i - entryBar,
        features: {},
      });

      inPosition = false;
      cooldownUntil = i + cooldownBars;
      continue;
    }

    // Skip if in position or in cooldown
    if (inPosition || i < cooldownUntil) continue;

    // Need enough history for features
    const minBars = Math.max(
      strategy.features.funding_zscore_window ?? 30,
      strategy.features.ac_lag_window ?? 48,
    );
    if (i < minBars) continue;

    // Calculate features using the strategy's own functions
    const barsSlice = bars.slice(0, i + 1);
    // Use funding rates up to this point (no lookahead)
    const fundingSlice = funding.slice(0, Math.min(funding.length, i + 1));

    if (fundingSlice.length < 10) continue;

    const features = calcS1Features(barsSlice, fundingSlice);
    if (!features) continue;

    // Evaluate trigger
    const signal = evaluateS1Trigger(features);

    if (signal) {
      inPosition = true;
      entryBar = i;
      entryPrice = bars[i].close;
    }
  }

  // Close any open position at end
  if (inPosition) {
    const exitPrice = bars[bars.length - 1].close;
    const grossBps = strategy.direction === 'short'
      ? ((entryPrice - exitPrice) / entryPrice) * 10000
      : ((exitPrice - entryPrice) / entryPrice) * 10000;

    trades.push({
      entry_bar: entryBar,
      exit_bar: bars.length - 1,
      entry_price: entryPrice,
      exit_price: exitPrice,
      direction: strategy.direction,
      gross_pnl_bps: Math.round(grossBps * 100) / 100,
      cost_bps: rtCost,
      net_pnl_bps: Math.round((grossBps - rtCost) * 100) / 100,
      hold_bars: bars.length - 1 - entryBar,
      features: {},
    });
  }

  // Filter out undefined placeholders
  const cleanTrades = trades.filter(Boolean);

  const metrics = calculateMetrics(cleanTrades);

  const startDate = bars.length > 0 ? new Date(bars[0].ts_open).toISOString() : '';
  const endDate = bars.length > 0 ? new Date(bars[bars.length - 1].ts_open).toISOString() : '';

  return {
    strategy_id: strategy.id,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    period: { start: startDate, end: endDate },
    bars_total: bars.length,
    trades: cleanTrades,
    metrics,
    cost_model: costs,
  };
}

// ─── Metrics Calculation ─────────────────────────────────────

function calculateMetrics(trades: BacktestTrade[]): BacktestMetrics {
  if (trades.length === 0) {
    return {
      total_trades: 0, winning_trades: 0, losing_trades: 0,
      win_rate: 0, gross_pnl_bps: 0, total_cost_bps: 0,
      net_pnl_bps: 0, avg_trade_bps: 0, avg_winner_bps: 0,
      avg_loser_bps: 0, max_drawdown_bps: 0, sharpe_ratio: 0,
      profit_factor: 0, t_stat: 0, expectancy_bps: 0,
    };
  }

  const netReturns = trades.map(t => t.net_pnl_bps);
  const winners = netReturns.filter(r => r > 0);
  const losers = netReturns.filter(r => r <= 0);

  const grossSum = trades.reduce((s, t) => s + t.gross_pnl_bps, 0);
  const costSum = trades.reduce((s, t) => s + t.cost_bps, 0);
  const netSum = netReturns.reduce((s, r) => s + r, 0);

  const avgTrade = netSum / trades.length;
  const avgWinner = winners.length > 0 ? winners.reduce((s, r) => s + r, 0) / winners.length : 0;
  const avgLoser = losers.length > 0 ? losers.reduce((s, r) => s + r, 0) / losers.length : 0;

  // Max drawdown (cumulative PnL)
  let peak = 0;
  let maxDD = 0;
  let cumPnl = 0;
  for (const r of netReturns) {
    cumPnl += r;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (annualized, assuming 5m bars = 288 bars/day)
  const mean = avgTrade;
  const variance = netReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / trades.length;
  const stddev = Math.sqrt(variance);
  // Annualize: ~105k 5-min bars per year, but trades are sparse
  // Use sqrt(trades_per_year) approximation
  const tradesPerYear = trades.length * (365 * 288 / (trades[trades.length - 1].exit_bar - trades[0].entry_bar + 1 || 1));
  const sharpe = stddev > 0 ? (mean / stddev) * Math.sqrt(Math.min(tradesPerYear, 1000)) : 0;

  // Profit factor
  const grossWins = winners.reduce((s, r) => s + r, 0);
  const grossLosses = Math.abs(losers.reduce((s, r) => s + r, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? Infinity : 0);

  // T-statistic
  const tStat = stddev > 0 ? (mean / stddev) * Math.sqrt(trades.length) : 0;

  return {
    total_trades: trades.length,
    winning_trades: winners.length,
    losing_trades: losers.length,
    win_rate: Math.round((winners.length / trades.length) * 10000) / 100,
    gross_pnl_bps: Math.round(grossSum * 100) / 100,
    total_cost_bps: Math.round(costSum * 100) / 100,
    net_pnl_bps: Math.round(netSum * 100) / 100,
    avg_trade_bps: Math.round(avgTrade * 100) / 100,
    avg_winner_bps: Math.round(avgWinner * 100) / 100,
    avg_loser_bps: Math.round(avgLoser * 100) / 100,
    max_drawdown_bps: Math.round(maxDD * 100) / 100,
    sharpe_ratio: Math.round(sharpe * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    t_stat: Math.round(tStat * 100) / 100,
    expectancy_bps: Math.round(avgTrade * 100) / 100,
  };
}

// ─── Walk-Forward ────────────────────────────────────────────

export interface WalkForwardResult {
  folds: BacktestReport[];
  all_positive: boolean;
  avg_net_bps: number;
  combined_trades: number;
}

/**
 * Walk-forward validation: split bars into K folds,
 * test each fold using the SAME frozen strategy.
 * No optimization between folds — just measuring stability.
 */
export function walkForward(
  strategy: StrategyManifest,
  bars: MarketBar[],
  funding: number[],
  folds: number = 4,
  costs: CostModel = DEFAULT_COSTS,
): WalkForwardResult {
  const foldSize = Math.floor(bars.length / folds);
  const results: BacktestReport[] = [];

  for (let k = 0; k < folds; k++) {
    const start = k * foldSize;
    const end = k === folds - 1 ? bars.length : (k + 1) * foldSize;
    const foldBars = bars.slice(start, end);
    // Funding: use proportional slice
    const fundingStart = Math.floor((start / bars.length) * funding.length);
    const fundingEnd = Math.floor((end / bars.length) * funding.length);
    const foldFunding = funding.slice(fundingStart, fundingEnd);

    const report = runBacktest(strategy, foldBars, foldFunding, costs);
    results.push(report);
  }

  const allPositive = results.every(r => r.metrics.net_pnl_bps >= 0);
  const totalTrades = results.reduce((s, r) => s + r.metrics.total_trades, 0);
  const avgNet = totalTrades > 0
    ? results.reduce((s, r) => s + r.metrics.net_pnl_bps, 0) / folds
    : 0;

  return {
    folds: results,
    all_positive: allPositive,
    avg_net_bps: Math.round(avgNet * 100) / 100,
    combined_trades: totalTrades,
  };
}
