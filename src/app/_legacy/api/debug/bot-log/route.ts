import { NextResponse } from 'next/server';
import type { MultiBotConfig } from '@/types/bot';
import { redisGet, KEYS } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

// GET /api/debug/bot-log?botId=xxx — returns last 50 signal log entries for a specific bot
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('botId');

  if (!botId) {
    // Return list of all bots with basic info
    const configs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
    return NextResponse.json({
      bots: configs.map(c => ({ id: c.id, name: c.name, status: c.status, env: c.environment ?? 'demo', assets: c.assets })),
      usage: 'GET /api/debug/bot-log?botId=<id>',
    });
  }

  const state = await redisGet<any>(`nexus:bot:state:${botId}`);
  if (!state) {
    return NextResponse.json({ error: `No state found for bot ${botId}` }, { status: 404 });
  }

  const configs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
  const config = configs.find(c => c.id === botId);

  // Compute stats from closed trades
  const closed = state.closedTrades ?? [];
  const wins = closed.filter((t: any) => (t.netPnl ?? 0) > 0);
  const totalPnl = closed.reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0);

  return NextResponse.json({
    bot: {
      id: botId,
      name: config?.name ?? 'Unknown',
      status: config?.status ?? 'unknown',
      env: config?.environment ?? 'demo',
      assets: config?.assets ?? [],
      strategies: config?.strategies ?? [],
      mode: config?.operationMode ?? 'intraday',
    },
    state: {
      tickCount: state.tickCount ?? 0,
      lastTick: state.lastTick ?? null,
      initialEquity: state.initialEquity ?? 0,
      openPositions: (state.positions ?? []).map((p: any) => ({
        symbol: p.symbol, side: p.side, entryPrice: p.entryPrice,
        stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        quantity: p.quantity, strategy: p.strategy,
        entryTime: p.entryTime,
      })),
      closedTradeCount: closed.length,
      winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
      totalPnl: Math.round(totalPnl * 100) / 100,
      rejectedTrades: state.rejectedTrades ?? 0,
      profitLocks: state.profitLocks ?? 0,
    },
    // Last 50 signal log entries (newest first)
    signalLog: (state.signalLog ?? []).slice(-50).reverse().map((l: any) => ({
      time: l.time,
      symbol: l.symbol,
      signal: l.signal,
      confidence: l.confidence ? `${(l.confidence * 100).toFixed(1)}%` : '?',
      strategy: l.strategy,
      regime: l.regime,
      acted: l.acted,
      reason: l.reason ?? null,
    })),
    // Last 10 closed trades (newest first)
    recentTrades: closed.slice(-10).reverse().map((t: any) => ({
      symbol: t.symbol, side: t.side,
      entry: t.entryPrice, exit: t.exitPrice,
      pnl: Math.round((t.netPnl ?? 0) * 100) / 100,
      pnlPct: Math.round((t.pnlPct ?? 0) * 100) / 100,
      reason: t.exitReason, strategy: t.strategy,
      entryAt: t.entryAt, exitAt: t.exitAt,
    })),
  });
}
