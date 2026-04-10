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

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const env = searchParams.get('env') ?? 'demo'; // 'demo' or 'real'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const trades = await redisLrange<TradeRecord>(KEYS.trades, 0, 499);

    // For real env, only show isLive trades; for demo, show all
    const filtered = env === 'real'
      ? trades.filter(t => t.isLive)
      : trades;

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      trades: paginated,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (err: any) {
    return NextResponse.json({ trades: [], total: 0, offset: 0, limit, hasMore: false, error: err.message });
  }
}
