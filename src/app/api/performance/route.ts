import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { NextResponse } from 'next/server';
import { redisLrange, KEYS } from '@/lib/db/redis';
import type { TradeRecord } from '@/types';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Load trades from Redis
  const trades = await redisLrange<TradeRecord>(KEYS.trades, 0, 499);
  const closed = trades.filter((t) => t.status === 'closed' && t.netPnl !== undefined);

  if (closed.length === 0) {
    return NextResponse.json({
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, avgTradePnl: 0,
      dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0,
      sharpeRatio: 0, equityCurve: [],
      recentTrades: [],
    });
  }

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now); monthStart.setDate(weekStart.getDate() - 30);

  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.netPnl ?? 0) <= 0);
  const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);

  // Time-based P&L
  const dailyTrades = closed.filter((t) => t.exitAt && new Date(t.exitAt) >= dayStart);
  const weeklyTrades = closed.filter((t) => t.exitAt && new Date(t.exitAt) >= weekStart);
  const monthlyTrades = closed.filter((t) => t.exitAt && new Date(t.exitAt) >= monthStart);

  const dailyPnl = dailyTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const weeklyPnl = weeklyTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const monthlyPnl = monthlyTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);

  // Rolling win rate (last 30 trades)
  const recent30 = closed.slice(0, 30);
  const recentWins = recent30.filter((t) => (t.netPnl ?? 0) > 0).length;
  const rollingWinRate = recent30.length > 0 ? (recentWins / recent30.length) * 100 : 0;

  // Equity curve from trades
  let equity = 0;
  const equityCurve = closed.reverse().map((t) => {
    equity += t.netPnl ?? 0;
    return {
      date: t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : '',
      equity: Math.round(equity * 100) / 100,
      pnl: Math.round((t.netPnl ?? 0) * 100) / 100,
    };
  });

  // Sharpe ratio (simplified: daily returns from P&L)
  const dailyReturns: number[] = [];
  const pnlByDay: Record<string, number> = {};
  for (const t of closed) {
    const date = t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : 'unknown';
    pnlByDay[date] = (pnlByDay[date] ?? 0) + (t.netPnl ?? 0);
  }
  const dayValues = Object.values(pnlByDay);
  const avgDailyPnl = dayValues.length > 0 ? dayValues.reduce((s, v) => s + v, 0) / dayValues.length : 0;
  const stdDev = dayValues.length > 1
    ? Math.sqrt(dayValues.reduce((s, v) => s + (v - avgDailyPnl) ** 2, 0) / (dayValues.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgDailyPnl / stdDev) * Math.sqrt(252) : 0;

  return NextResponse.json({
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    rollingWinRate,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgTradePnl: closed.length > 0 ? Math.round((totalPnl / closed.length) * 100) / 100 : 0,
    dailyPnl: Math.round(dailyPnl * 100) / 100,
    weeklyPnl: Math.round(weeklyPnl * 100) / 100,
    monthlyPnl: Math.round(monthlyPnl * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    equityCurve,
    recentTrades: closed.slice(0, 20).map((t) => ({
      symbol: t.symbol, side: t.side,
      entryPrice: t.entryPrice, exitPrice: t.exitPrice,
      pnl: t.netPnl, pnlPct: t.pnlPct,
      strategy: t.strategy, exitReason: t.exitReason,
      exitAt: t.exitAt,
    })),
  });
}
