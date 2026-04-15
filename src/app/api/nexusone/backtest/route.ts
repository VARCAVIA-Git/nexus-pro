// NexusOne — Backtest API
// Runs S1 backtest on historical data from Alpaca + Binance

import { NextResponse } from 'next/server';
import { runBacktest, walkForward, DEFAULT_COSTS } from '@/lib/nexusone/research/backtester';
import { strategyS1 } from '@/lib/nexusone/strategies/s1';
import { fetchBars } from '@/lib/nexusone/data/market-data';
import { fetchFundingRateValues } from '@/lib/nexusone/data/binance-funding';
import type { MarketBar } from '@/lib/nexusone/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'full'; // full | walkforward
  const days = parseInt(url.searchParams.get('days') ?? '60');
  const limit = Math.min(days * 288, 10000); // 288 5-min bars per day, max 10k

  try {
    // Fetch historical data
    const [rawBars, funding] = await Promise.all([
      fetchBars('BTC/USD', '5m', limit),
      fetchFundingRateValues('BTC/USD', 500),
    ]);

    // Convert to MarketBar format
    const bars: MarketBar[] = rawBars.map(b => ({
      venue: 'alpaca',
      symbol: 'BTC-USD',
      timeframe: '5m',
      ts_open: b.ts_open,
      ts_close: b.ts_open + 5 * 60_000,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    if (bars.length < 100) {
      return NextResponse.json({
        error: 'Insufficient data',
        bars_fetched: bars.length,
        funding_fetched: funding.length,
      }, { status: 400 });
    }

    if (mode === 'walkforward') {
      const result = walkForward(strategyS1, bars, funding, 4, DEFAULT_COSTS);
      return NextResponse.json({
        mode: 'walkforward',
        bars: bars.length,
        funding: funding.length,
        folds: result.folds.map(f => ({
          period: f.period,
          trades: f.metrics.total_trades,
          net_pnl_bps: f.metrics.net_pnl_bps,
          win_rate: f.metrics.win_rate,
          sharpe: f.metrics.sharpe_ratio,
        })),
        all_positive: result.all_positive,
        avg_net_bps: result.avg_net_bps,
        combined_trades: result.combined_trades,
      });
    }

    // Full backtest
    const report = runBacktest(strategyS1, bars, funding, DEFAULT_COSTS);

    return NextResponse.json({
      mode: 'full',
      strategy: report.strategy_id,
      symbol: report.symbol,
      period: report.period,
      bars: report.bars_total,
      funding_rates: funding.length,
      metrics: report.metrics,
      cost_model: report.cost_model,
      trades_sample: report.trades.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
