import type {
  OHLCV, TradingConfig, StrategyKey, BacktestResult, TradeRecord,
  Side, Position, MonteCarloResult, WalkForwardResult, Indicators,
} from '@/types';
import { computeIndicators } from '../core/indicators';
import { getStrategy, generateSignal } from '../analytics/cognition/strategies';
import { trailingStopATR } from '../analytics/action/risk';
import { nanoid } from 'nanoid';

// ═══════════════════════════════════════════════════════════════
// CORE BACKTEST ENGINE
// ═══════════════════════════════════════════════════════════════

export function runBacktest(
  candles: OHLCV[],
  config: TradingConfig,
  strategyKey: StrategyKey,
  symbol = '',
  precomputedIndicators?: Indicators,
): BacktestResult {
  if (candles.length < 60) {
    return emptyResult(config);
  }

  const indicators = precomputedIndicators ?? computeIndicators(candles);
  const strategy = getStrategy(strategyKey);
  const trades: TradeRecord[] = [];
  let capital = config.capital;
  const equity: number[] = [];
  let openPosition: Position | null = null;
  let cooldown = 0;
  let peakCapital = config.capital;

  // Start at bar 50 — enough warmup for all indicators used by strategies
  // (RSI=14, MACD=35, BB=20, ADX=28, Stochastic=17, SMA50=50)
  // SMA200 is padded with null but strategies don't use it directly
  const startBar = 50;
  const effectiveStart = Math.min(startBar, candles.length - 10);

  for (let i = effectiveStart; i < candles.length; i++) {
    const bar = candles[i];
    const price = bar.close;

    // ── Check exit conditions ──────────────────────
    if (openPosition) {
      const atr = indicators.atr[i];

      // Strategy-based exit
      const exitDecision = strategy.shouldExit(openPosition, candles, indicators, i);

      // Hard stop / take profit
      let exitReason = '';
      let exitPrice = price;

      if (openPosition.side === 'LONG') {
        if (price <= openPosition.stopLoss) { exitReason = 'stop_loss'; exitPrice = openPosition.stopLoss; }
        else if (price >= openPosition.takeProfit) { exitReason = 'take_profit'; exitPrice = openPosition.takeProfit; }
      } else {
        if (price >= openPosition.stopLoss) { exitReason = 'stop_loss'; exitPrice = openPosition.stopLoss; }
        else if (price <= openPosition.takeProfit) { exitReason = 'take_profit'; exitPrice = openPosition.takeProfit; }
      }

      // Trailing stop update
      if (!exitReason && config.trailingStop && atr > 0) {
        openPosition.stopLoss = trailingStopATR(
          openPosition.side, price, openPosition.stopLoss, atr, config.trailingPct || 2,
        );
      }

      // Strategy exit
      if (!exitReason && exitDecision.exit) {
        exitReason = exitDecision.reason;
        exitPrice = price;
      }

      if (exitReason) {
        const mult = openPosition.side === 'LONG' ? 1 : -1;
        const grossPnl = (exitPrice - openPosition.entryPrice) * openPosition.quantity * mult;
        const commission = openPosition.sizeUsd * config.commissionPct / 100 * 2;
        const slippageCost = exitPrice * config.slippagePct / 100 * openPosition.quantity;
        const netPnl = grossPnl - commission - slippageCost;

        trades.push({
          id: nanoid(),
          symbol,
          side: openPosition.side,
          status: 'closed',
          entryPrice: openPosition.entryPrice,
          exitPrice,
          stopLoss: openPosition.stopLoss,
          takeProfit: openPosition.takeProfit,
          quantity: openPosition.quantity,
          sizeUsd: openPosition.sizeUsd,
          grossPnl,
          commission: commission + slippageCost,
          netPnl,
          pnlPct: openPosition.sizeUsd > 0 ? (netPnl / openPosition.sizeUsd) * 100 : 0,
          entryAt: new Date(candles[openPosition.entryIndex].date),
          exitAt: new Date(bar.date),
          durationBars: i - openPosition.entryIndex,
          strategy: strategyKey,
          confidence: openPosition.confidence,
          regime: openPosition.regime,
          exitReason,
          isLive: false,
        });

        capital += netPnl;
        openPosition = null;
        cooldown = config.cooldownBars;
      }
    }

    // ── Check entry conditions ─────────────────────
    if (!openPosition && cooldown <= 0 && capital > 0) {
      const decision = strategy.shouldEnter(candles, indicators, i);

      if (decision.enter && decision.confidence > 0.3) {
        const atr = indicators.atr[i];
        const qty = strategy.calculateSize(capital, config.riskPerTrade, atr, price);

        if (qty > 0) {
          const slippage = price * (config.slippagePct / 100);
          const entryPrice = decision.side === 'LONG' ? price + slippage : price - slippage;
          const sizeUsd = qty * entryPrice;

          if (sizeUsd <= capital * 0.95) {
            const atrStop = atr * 2;
            const pctStop = entryPrice * (config.stopLossPct / 100);
            const stopDist = Math.min(atrStop, pctStop);

            openPosition = {
              id: nanoid(),
              symbol,
              side: decision.side,
              entryPrice,
              stopLoss: decision.side === 'LONG'
                ? entryPrice - stopDist
                : entryPrice + stopDist,
              takeProfit: decision.side === 'LONG'
                ? entryPrice + stopDist * (config.takeProfitPct / config.stopLossPct)
                : entryPrice - stopDist * (config.takeProfitPct / config.stopLossPct),
              quantity: qty,
              sizeUsd,
              entryIndex: i,
              strategy: strategyKey,
              confidence: decision.confidence,
              regime: indicators.adx[i] > 25 ? 'BULL_TREND' : 'NORMAL',
              barsBelowEma21: 0,
            };
          }
        }
      }
    }

    if (cooldown > 0) cooldown--;
    equity.push(capital);

    // Max drawdown circuit breaker (track peak incrementally)
    if (capital > peakCapital) peakCapital = capital;
    const dd = peakCapital > 0 ? ((peakCapital - capital) / peakCapital) * 100 : 0;
    if (dd >= config.maxDrawdownLimit) break;
  }

  // Close remaining open position at last price
  if (openPosition) {
    const lastPrice = candles[candles.length - 1].close;
    const mult = openPosition.side === 'LONG' ? 1 : -1;
    const grossPnl = (lastPrice - openPosition.entryPrice) * openPosition.quantity * mult;
    const commission = openPosition.sizeUsd * config.commissionPct / 100 * 2;
    const netPnl = grossPnl - commission;

    trades.push({
      id: nanoid(),
      symbol,
      side: openPosition.side,
      status: 'closed',
      entryPrice: openPosition.entryPrice,
      exitPrice: lastPrice,
      stopLoss: openPosition.stopLoss,
      takeProfit: openPosition.takeProfit,
      quantity: openPosition.quantity,
      sizeUsd: openPosition.sizeUsd,
      grossPnl, commission, netPnl,
      pnlPct: openPosition.sizeUsd > 0 ? (netPnl / openPosition.sizeUsd) * 100 : 0,
      entryAt: new Date(candles[openPosition.entryIndex].date),
      exitAt: new Date(candles[candles.length - 1].date),
      durationBars: candles.length - 1 - openPosition.entryIndex,
      strategy: strategyKey,
      confidence: openPosition.confidence,
      regime: openPosition.regime,
      exitReason: 'end_of_data',
      isLive: false,
    });
    capital += netPnl;
  }

  return computeMetrics(trades, equity, config);
}

// ═══════════════════════════════════════════════════════════════
// MONTE CARLO SIMULATION
// ═══════════════════════════════════════════════════════════════

export function runMonteCarlo(
  trades: TradeRecord[],
  initialCapital: number,
  numSimulations = 200,
): MonteCarloResult {
  const pnls = trades.map((t) => t.netPnl ?? 0);
  if (pnls.length === 0) {
    return {
      simulations: numSimulations,
      probabilityOfProfit: 0,
      percentiles: {
        p5: { final: initialCapital, maxDD: 0 },
        p25: { final: initialCapital, maxDD: 0 },
        p50: { final: initialCapital, maxDD: 0 },
        p75: { final: initialCapital, maxDD: 0 },
        p95: { final: initialCapital, maxDD: 0 },
      },
    };
  }

  const results: { final: number; maxDD: number }[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    // Shuffle the trade PnLs (Fisher-Yates)
    const shuffled = [...pnls];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    // Walk through shuffled trades
    let capital = initialCapital;
    let peak = capital;
    let maxDD = 0;

    for (const pnl of shuffled) {
      capital += pnl;
      peak = Math.max(peak, capital);
      const dd = peak > 0 ? ((peak - capital) / peak) * 100 : 0;
      maxDD = Math.max(maxDD, dd);
    }

    results.push({ final: capital, maxDD });
  }

  // Sort by final capital
  results.sort((a, b) => a.final - b.final);
  const profitableCount = results.filter((r) => r.final > initialCapital).length;

  const percentile = (p: number) => {
    const idx = Math.floor(results.length * p);
    return results[Math.min(idx, results.length - 1)];
  };

  return {
    simulations: numSimulations,
    probabilityOfProfit: profitableCount / numSimulations,
    percentiles: {
      p5: percentile(0.05),
      p25: percentile(0.25),
      p50: percentile(0.50),
      p75: percentile(0.75),
      p95: percentile(0.95),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// WALK-FORWARD ANALYSIS
// ═══════════════════════════════════════════════════════════════

export function runWalkForward(
  candles: OHLCV[],
  config: TradingConfig,
  strategyKey: StrategyKey,
  numWindows = 4,
  symbol = '',
): WalkForwardResult {
  const windowSize = Math.floor(candles.length / (numWindows + 1));
  if (windowSize < 100) {
    return { windows: [], robustnessPct: 0 };
  }

  const windows: WalkForwardResult['windows'] = [];

  for (let w = 0; w < numWindows; w++) {
    // Train: 2/3 of window, Test: 1/3
    const trainStart = w * windowSize;
    const trainEnd = trainStart + Math.floor(windowSize * 2);
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + windowSize, candles.length);

    if (testEnd <= testStart || trainEnd > candles.length) break;

    const trainCandles = candles.slice(trainStart, trainEnd);
    const testCandles = candles.slice(testStart, testEnd);

    if (trainCandles.length < 60 || testCandles.length < 30) break;

    const trainResult = runBacktest(trainCandles, config, strategyKey, symbol);
    const testResult = runBacktest(testCandles, config, strategyKey, symbol);

    // Robust if test performance doesn't degrade more than 50% from train
    const robust =
      testResult.winRate >= trainResult.winRate * 0.5 &&
      testResult.returnPct > -10;

    windows.push({
      window: w + 1,
      trainWinRate: trainResult.winRate,
      testWinRate: testResult.winRate,
      trainReturn: trainResult.returnPct,
      testReturn: testResult.returnPct,
      robust,
    });
  }

  const robustCount = windows.filter((w) => w.robust).length;
  const robustnessPct = windows.length > 0 ? (robustCount / windows.length) * 100 : 0;

  return { windows, robustnessPct };
}

// ═══════════════════════════════════════════════════════════════
// FULL BACKTEST WITH MONTE CARLO + WALK-FORWARD
// ═══════════════════════════════════════════════════════════════

export function runFullBacktest(
  candles: OHLCV[],
  config: TradingConfig,
  strategyKey: StrategyKey,
  symbol = '',
): BacktestResult {
  const result = runBacktest(candles, config, strategyKey, symbol);

  if (result.trades.length >= 5) {
    result.monteCarlo = runMonteCarlo(result.trades, config.capital, 200);
  }

  if (candles.length >= 500) {
    result.walkForward = runWalkForward(candles, config, strategyKey, 4, symbol);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// METRICS COMPUTATION
// ═══════════════════════════════════════════════════════════════

function computeMetrics(
  trades: TradeRecord[],
  equity: number[],
  config: TradingConfig,
): BacktestResult {
  const finalCapital = equity[equity.length - 1] ?? config.capital;
  const wins = trades.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.netPnl ?? 0) <= 0);
  const totalPnl = finalCapital - config.capital;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.netPnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0) / losses.length) : 0;
  const totalCommissions = trades.reduce((s, t) => s + (t.commission ?? 0), 0);

  // Max consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if ((t.netPnl ?? 0) > 0) { cw++; cl = 0; maxConsecWins = Math.max(maxConsecWins, cw); }
    else { cl++; cw = 0; maxConsecLosses = Math.max(maxConsecLosses, cl); }
  }

  // Max drawdown from equity
  let peakEq = equity[0] ?? config.capital;
  let maxDrawdown = 0;
  for (const eq of equity) {
    peakEq = Math.max(peakEq, eq);
    const dd = peakEq > 0 ? ((peakEq - eq) / peakEq) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  // Sharpe / Sortino from daily returns
  const returns = equity.slice(1).map((eq, i) => equity[i] > 0 ? (eq - equity[i]) / equity[i] : 0);
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length || 1));
  const downDev = Math.sqrt(
    returns.filter((r) => r < 0).reduce((s, r) => s + r ** 2, 0) / (returns.length || 1),
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  const sortinoRatio = downDev > 0 ? (avgReturn / downDev) * Math.sqrt(252) : 0;
  const calmarRatio = maxDrawdown > 0 ? ((totalPnl / config.capital) * 100) / maxDrawdown : 0;
  const profitFactor = avgLoss > 0 && losses.length > 0
    ? (avgWin * wins.length) / (avgLoss * losses.length)
    : avgWin > 0 ? Infinity : 0;

  return {
    trades,
    equity,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    returnPct: config.capital > 0 ? (totalPnl / config.capital) * 100 : 0,
    profitFactor,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxDrawdown,
    expectancy: trades.length > 0 ? totalPnl / trades.length : 0,
    avgWin,
    avgLoss,
    maxConsecWins,
    maxConsecLosses,
    initialCapital: config.capital,
    finalCapital,
    totalCommissions,
  };
}

function emptyResult(config: TradingConfig): BacktestResult {
  return {
    trades: [], equity: [config.capital],
    totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    totalPnl: 0, returnPct: 0, profitFactor: 0,
    sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
    maxDrawdown: 0, expectancy: 0, avgWin: 0, avgLoss: 0,
    maxConsecWins: 0, maxConsecLosses: 0,
    initialCapital: config.capital, finalCapital: config.capital,
    totalCommissions: 0,
  };
}
