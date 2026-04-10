import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getAlpacaKeys, alpacaFetch } from '@/lib/broker/alpaca-keys';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await getAlpacaKeys();
  if (!keys) return NextResponse.json({ error: 'Broker non configurato' }, { status: 400 });

  const acc = await alpacaFetch<any>('/v2/account', keys);
  if (!acc) return NextResponse.json({ error: 'Connessione al broker fallita' }, { status: 502 });

  return NextResponse.json({
    mode: keys.mode,
    equity: parseFloat(acc.equity),
    cash: parseFloat(acc.cash),
    buyingPower: parseFloat(acc.buying_power),
    portfolioValue: parseFloat(acc.portfolio_value ?? acc.equity),
    lastEquity: parseFloat(acc.last_equity),
    lastEquity: parseFloat(acc.last_equity) || parseFloat(acc.equity),
    dailyChange: parseFloat(acc.last_equity) > 0 ? parseFloat(acc.equity) - parseFloat(acc.last_equity) : 0,
    dailyChangePct: parseFloat(acc.last_equity) > 0
      ? ((parseFloat(acc.equity) - parseFloat(acc.last_equity)) / parseFloat(acc.last_equity)) * 100 : 0,
    status: acc.status,
    currency: acc.currency,
    patternDayTrader: acc.pattern_day_trader,
    tradingBlocked: acc.trading_blocked,
    accountBlocked: acc.account_blocked,
  });
}
