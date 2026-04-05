import { NextResponse } from 'next/server';
import { redisLrange, KEYS } from '@/lib/db/redis';
import type { TradeRecord } from '@/types';

export const dynamic = 'force-dynamic';

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';

async function fetchAlpaca<T>(path: string): Promise<T | null> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${ALPACA_PAPER_URL}${path}`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const env = searchParams.get('env') ?? 'demo';

  // 1. Alpaca account data (always from paper for now)
  const account = await fetchAlpaca<{
    equity: string; cash: string; buying_power: string;
    portfolio_value: string; last_equity: string;
  }>('/v2/account');

  const alpacaPositions = await fetchAlpaca<Array<{
    symbol: string; side: string; qty: string;
    avg_entry_price: string; current_price: string;
    unrealized_pl: string; unrealized_plpc: string;
  }>>('/v2/positions') ?? [];

  // 2. Load trades from Redis
  const trades = await redisLrange<TradeRecord>(KEYS.trades, 0, 499);
  const closed = trades.filter((t) => t.status === 'closed' && t.netPnl !== undefined);

  // 3. Compute stats from real trades
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.netPnl ?? 0) <= 0);
  const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.netPnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0) / losses.length) : 0;

  // Sharpe from daily P&L
  const pnlByDay: Record<string, number> = {};
  for (const t of closed) {
    const d = t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : 'x';
    pnlByDay[d] = (pnlByDay[d] ?? 0) + (t.netPnl ?? 0);
  }
  const dayVals = Object.values(pnlByDay);
  const avgDay = dayVals.length > 0 ? dayVals.reduce((s, v) => s + v, 0) / dayVals.length : 0;
  const stdDev = dayVals.length > 1 ? Math.sqrt(dayVals.reduce((s, v) => s + (v - avgDay) ** 2, 0) / (dayVals.length - 1)) : 0;
  const sharpe = stdDev > 0 ? (avgDay / stdDev) * Math.sqrt(252) : 0;

  // Max drawdown from equity curve
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  const equityCurve = closed.reverse().map((t) => {
    equity += t.netPnl ?? 0;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
    return { date: t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : '', equity: Math.round(equity * 100) / 100 };
  });

  // Best/worst trade
  const bestTrade = closed.length > 0 ? Math.max(...closed.map((t) => t.netPnl ?? 0)) : 0;
  const worstTrade = closed.length > 0 ? Math.min(...closed.map((t) => t.netPnl ?? 0)) : 0;

  // Profit factor
  const grossWins = wins.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  return NextResponse.json({
    // Alpaca account
    balance: account ? parseFloat(account.equity) : 0,
    cash: account ? parseFloat(account.cash) : 0,
    buyingPower: account ? parseFloat(account.buying_power) : 0,
    // Open positions from Alpaca
    openPositions: alpacaPositions.map((p) => ({
      symbol: p.symbol, side: p.side === 'long' ? 'LONG' : 'SHORT',
      quantity: parseFloat(p.qty), entryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      pnl: parseFloat(p.unrealized_pl), pnlPct: parseFloat(p.unrealized_plpc) * 100,
    })),
    // Stats from real trades
    stats: {
      totalTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnl, avgWin, avgLoss,
      sharpe, maxDrawdown: maxDD,
      profitFactor: profitFactor === Infinity ? 999 : profitFactor,
      bestTrade, worstTrade,
      expectancy: closed.length > 0 ? totalPnl / closed.length : 0,
    },
    equityCurve,
    recentTrades: closed.slice(0, 10).map((t) => ({
      id: t.id, symbol: t.symbol, side: t.side,
      entryPrice: t.entryPrice, exitPrice: t.exitPrice,
      pnl: t.netPnl, pnlPct: t.pnlPct,
      strategy: t.strategy, date: t.exitAt,
    })),
    hasTrades: closed.length > 0,
    env,
  });
}
