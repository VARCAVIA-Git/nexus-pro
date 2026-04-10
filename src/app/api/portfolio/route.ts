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

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_URL = 'https://api.alpaca.markets';

function getAlpacaCreds(mode: string): { url: string; key: string; secret: string } | null {
  if (mode === 'real') {
    const key = process.env.ALPACA_LIVE_API_KEY;
    const secret = process.env.ALPACA_LIVE_SECRET_KEY;
    if (!key || !secret) return null; // Live keys not configured
    return { url: ALPACA_LIVE_URL, key, secret };
  }
  // Demo/paper
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) return null;
  return { url: ALPACA_PAPER_URL, key, secret };
}

async function fetchAlpaca<T>(creds: { url: string; key: string; secret: string }, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${creds.url}${path}`, {
      headers: { 'APCA-API-KEY-ID': creds.key, 'APCA-API-SECRET-KEY': creds.secret },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('env') ?? searchParams.get('mode') ?? 'demo';

  // Get broker credentials for this mode
  const creds = getAlpacaCreds(mode);

  if (!creds) {
    // For real mode without live keys: return disconnected state
    if (mode === 'real') {
      return NextResponse.json({
        connected: false,
        message: 'Live API keys non configurate. Vai a Connessioni per configurarle.',
        balance: 0, cash: 0, buyingPower: 0,
        openPositions: [],
        stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, bestTrade: 0, worstTrade: 0, expectancy: 0 },
        equityCurve: [], recentTrades: [], hasTrades: false, env: mode,
      });
    }
    // Demo without paper keys
    return NextResponse.json({
      connected: false, message: 'Paper API keys non configurate.',
      balance: 0, cash: 0, buyingPower: 0, openPositions: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, bestTrade: 0, worstTrade: 0, expectancy: 0 },
      equityCurve: [], recentTrades: [], hasTrades: false, env: mode,
    });
  }

  // Fetch from the correct Alpaca environment
  const account = await fetchAlpaca<{
    equity: string; cash: string; buying_power: string;
  }>(creds, '/v2/account');

  const alpacaPositions = await fetchAlpaca<Array<{
    symbol: string; side: string; qty: string;
    avg_entry_price: string; current_price: string;
    unrealized_pl: string; unrealized_plpc: string;
  }>>(creds, '/v2/positions') ?? [];

  // Load trades from Redis
  const trades = await redisLrange<TradeRecord>(KEYS.trades, 0, 499);
  const closed = trades.filter((t) => t.status === 'closed' && t.netPnl !== undefined);

  // Compute stats
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.netPnl ?? 0) <= 0);
  const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.netPnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0) / losses.length) : 0;

  const pnlByDay: Record<string, number> = {};
  for (const t of closed) { const d = t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : 'x'; pnlByDay[d] = (pnlByDay[d] ?? 0) + (t.netPnl ?? 0); }
  const dayVals = Object.values(pnlByDay);
  const avgDay = dayVals.length > 0 ? dayVals.reduce((s, v) => s + v, 0) / dayVals.length : 0;
  const stdDev = dayVals.length > 1 ? Math.sqrt(dayVals.reduce((s, v) => s + (v - avgDay) ** 2, 0) / (dayVals.length - 1)) : 0;
  const sharpe = stdDev > 0 ? (avgDay / stdDev) * Math.sqrt(252) : 0;

  let equity = 0, peak = 0, maxDD = 0;
  const equityCurve = closed.reverse().map((t) => {
    equity += t.netPnl ?? 0; peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0; maxDD = Math.max(maxDD, dd);
    return { date: t.exitAt ? new Date(t.exitAt).toISOString().slice(0, 10) : '', equity: Math.round(equity * 100) / 100 };
  });

  const bestTrade = closed.length > 0 ? Math.max(...closed.map((t) => t.netPnl ?? 0)) : 0;
  const worstTrade = closed.length > 0 ? Math.min(...closed.map((t) => t.netPnl ?? 0)) : 0;
  const grossWins = wins.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  return NextResponse.json({
    connected: true,
    balance: account ? parseFloat(account.equity) : 0,
    cash: account ? parseFloat(account.cash) : 0,
    buyingPower: account ? parseFloat(account.buying_power) : 0,
    openPositions: alpacaPositions.map((p) => ({
      symbol: p.symbol, side: p.side === 'long' ? 'LONG' : 'SHORT',
      quantity: parseFloat(p.qty), entryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      pnl: parseFloat(p.unrealized_pl), pnlPct: parseFloat(p.unrealized_plpc) * 100,
    })),
    stats: {
      totalTrades: closed.length, wins: wins.length, losses: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnl, avgWin, avgLoss, sharpe, maxDrawdown: maxDD,
      profitFactor: profitFactor === Infinity ? 999 : profitFactor,
      bestTrade, worstTrade, expectancy: closed.length > 0 ? totalPnl / closed.length : 0,
    },
    equityCurve,
    recentTrades: closed.slice(0, 10).map((t) => ({
      id: t.id, symbol: t.symbol, side: t.side,
      entryPrice: t.entryPrice, exitPrice: t.exitPrice,
      pnl: t.netPnl, pnlPct: t.pnlPct,
      strategy: t.strategy, date: t.exitAt,
    })),
    hasTrades: closed.length > 0,
    env: mode,
  });
}
