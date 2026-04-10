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

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await getAlpacaKeys();
  if (!keys) return NextResponse.json({ orders: [] });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'all';
  const limit = url.searchParams.get('limit') ?? '50';

  const raw = await alpacaFetch<any[]>(`/v2/orders?status=${status}&limit=${limit}&direction=desc`, keys);
  if (!raw || !Array.isArray(raw)) return NextResponse.json({ orders: [] });

  const orders = raw.map(o => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: parseFloat(o.qty ?? o.notional ?? '0'),
    filledQty: parseFloat(o.filled_qty ?? '0'),
    avgFillPrice: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
    limitPrice: o.limit_price ? parseFloat(o.limit_price) : null,
    stopPrice: o.stop_price ? parseFloat(o.stop_price) : null,
    status: o.status,
    createdAt: o.created_at,
    filledAt: o.filled_at,
    cancelledAt: o.canceled_at,
    expiredAt: o.expired_at,
    assetClass: o.asset_class,
    orderClass: o.order_class,
    timeInForce: o.time_in_force,
  }));

  return NextResponse.json({ orders, mode: keys.mode });
}
