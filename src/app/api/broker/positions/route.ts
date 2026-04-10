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
  if (!keys) return NextResponse.json({ positions: [] });

  const raw = await alpacaFetch<any[]>('/v2/positions', keys);
  if (!raw || !Array.isArray(raw)) return NextResponse.json({ positions: [] });

  const positions = raw.map(p => ({
    symbol: p.symbol,
    side: p.side,
    qty: parseFloat(p.qty),
    avgEntryPrice: parseFloat(p.avg_entry_price),
    currentPrice: parseFloat(p.current_price),
    marketValue: parseFloat(p.market_value),
    costBasis: parseFloat(p.cost_basis),
    unrealizedPl: parseFloat(p.unrealized_pl),
    unrealizedPlPct: parseFloat(p.unrealized_plpc) * 100,
    changeToday: parseFloat(p.change_today) * 100,
    assetClass: p.asset_class,
  }));

  return NextResponse.json({ positions, mode: keys.mode });
}
