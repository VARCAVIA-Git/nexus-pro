import type { OHLCV, TradingConfig, StrategyKey, BacktestResult, TradeRecord, Side } from '@/types';
import { computeIndicators } from './indicators';
import { generateSignal } from './strategies';
import { nanoid } from 'nanoid';

export function runBacktest(
  candles: OHLCV[],
  config: TradingConfig,
  strategyKey: StrategyKey,
): BacktestResult {
  const indicators = computeIndicators(candles);
  const trades: TradeRecord[] = [];
  let capital = config.capital;
  const equity: number[] = [];
  let openTrade: TradeRecord | null = null;
  let cooldown = 0;

  for (let i = 50; i < candles.length; i++) {
    const bar = candles[i];
    const price = bar.close;

    // Check exit conditions for open trade
    if (openTrade) {
      let exitReason: string | undefined;
      let exitPrice = price;

      if (openTrade.side === 'LONG') {
        if (price <= openTrade.stopLoss) { exitReason = 'stop_loss'; exitPrice = openTrade.stopLoss; }
        else if (price >= openTrade.takeProfit) { exitReason = 'take_profit'; exitPrice = openTrade.takeProfit; }
      } else {
        if (price >= openTrade.stopLoss) { exitReason = 'stop_loss'; exitPrice = openTrade.stopLoss; }
        else if (price <= openTrade.takeProfit) { exitReason = 'take_profit'; exitPrice = openTrade.takeProfit; }
      }

      // Trailing stop
      if (!exitReason && config.trailingStop && openTrade.side === 'LONG') {
        const newStop = price * (1 - config.trailingPct / 100);
        if (newStop > openTrade.stopLoss) {
          openTrade.stopLoss = newStop;
        }
      }

      if (exitReason) {
        const mult = openTrade.side === 'LONG' ? 1 : -1;
        const grossPnl = (exitPrice - openTrade.entryPrice) * openTrade.quantity * mult;
        const commission = openTrade.sizeUsd * config.commissionPct / 100 * 2;
        const netPnl = grossPnl - commission;

        openTrade = {
          ...openTrade,
          exitPrice,
          exitAt: new Date(bar.date),
          exitReason,
          grossPnl,
          commission,
          netPnl,
          pnlPct: (netPnl / openTrade.sizeUsd) * 100,
          status: 'closed',
          durationBars: i - (trades.length > 0 ? 50 : 50),
        };
        trades.push(openTrade);
        capital += netPnl;
        openTrade = null;
        cooldown = config.cooldownBars;
      }
    }

    // Generate signal and open new trade
    if (!openTrade && cooldown <= 0) {
      const signal = generateSignal(candles, indicators, i, strategyKey);

      if (signal.signal !== 'NEUTRAL' && signal.confidence > 0.3) {
        const side: Side = signal.signal === 'BUY' ? 'LONG' : 'SHORT';
        const riskAmount = capital * (config.riskPerTrade / 100);
        const sizeUsd = Math.min(riskAmount, capital * 0.95);
        const quantity = sizeUsd / price;
        const slippage = price * (config.slippagePct / 100);
        const entryPrice = side === 'LONG' ? price + slippage : price - slippage;

        openTrade = {
          id: nanoid(),
          symbol: '',
          side,
          status: 'open',
          entryPrice,
          stopLoss: side === 'LONG'
            ? entryPrice * (1 - config.stopLossPct / 100)
            : entryPrice * (1 + config.stopLossPct / 100),
          takeProfit: side === 'LONG'
            ? entryPrice * (1 + config.takeProfitPct / 100)
            : entryPrice * (1 - config.takeProfitPct / 100),
          quantity,
          sizeUsd,
          entryAt: new Date(bar.date),
          strategy: strategyKey,
          confidence: signal.confidence,
          regime: signal.regime,
          isLive: false,
        };
      }
    }

    if (cooldown > 0) cooldown--;
    equity.push(capital);

    // Max drawdown circuit breaker
    const peak = Math.max(...equity);
    const dd = ((peak - capital) / peak) * 100;
    if (dd >= config.maxDrawdownLimit) break;
  }

  // Close any remaining open trade at last price
  if (openTrade) {
    const lastPrice = candles[candles.length - 1].close;
    const mult = openTrade.side === 'LONG' ? 1 : -1;
    const grossPnl = (lastPrice - openTrade.entryPrice) * openTrade.quantity * mult;
    const commission = openTrade.sizeUsd * config.commissionPct / 100 * 2;
    const netPnl = grossPnl - commission;
    openTrade = {
      ...openTrade,
      exitPrice: lastPrice,
      exitAt: new Date(candles[candles.length - 1].date),
      exitReason: 'end_of_data',
      grossPnl, commission, netPnl,
      pnlPct: (netPnl / openTrade.sizeUsd) * 100,
      status: 'closed',
    };
    trades.push(openTrade);
    capital += netPnl;
  }

  // Compute metrics
  const wins = trades.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.netPnl ?? 0) <= 0);
  const totalPnl = capital - config.capital;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.netPnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0) / losses.length) : 0;
  const totalCommissions = trades.reduce((s, t) => s + (t.commission ?? 0), 0);

  // Max consecutive
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
    const dd = ((peakEq - eq) / peakEq) * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  // Sharpe / Sortino (simplified daily returns)
  const returns = equity.slice(1).map((eq, i) => (eq - equity[i]) / equity[i]);
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length || 1));
  const downDev = Math.sqrt(returns.filter((r) => r < 0).reduce((s, r) => s + r ** 2, 0) / (returns.length || 1));
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  const sortinoRatio = downDev > 0 ? (avgReturn / downDev) * Math.sqrt(252) : 0;
  const calmarRatio = maxDrawdown > 0 ? ((totalPnl / config.capital) * 100) / maxDrawdown : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length || 1) : avgWin > 0 ? Infinity : 0;

  return {
    trades,
    equity,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    returnPct: (totalPnl / config.capital) * 100,
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
    finalCapital: capital,
    totalCommissions,
  };
}
