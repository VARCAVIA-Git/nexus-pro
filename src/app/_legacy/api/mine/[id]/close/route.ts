import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getMine, closeMine } from '@/lib/mine/mine-store';
import { closePosition } from '@/lib/mine/execution';
import { saveFeedback } from '@/lib/mine/feedback';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mine = await getMine(params.id);
  if (!mine) return NextResponse.json({ error: 'Mine not found' }, { status: 404 });
  if (mine.status === 'closed' || mine.status === 'cancelled') {
    return NextResponse.json({ error: 'Mine already closed' }, { status: 400 });
  }

  // Close position on broker
  if (mine.status === 'open' && mine.quantity > 0) {
    const result = await closePosition(mine.symbol, mine.direction, mine.quantity);
    if (!result.success) {
      return NextResponse.json({ error: `Broker error: ${result.error}` }, { status: 502 });
    }
    const exitPrice = result.filledPrice ?? mine.entryPrice ?? 0;
    const closed = await closeMine(params.id, 'manual', exitPrice);
    if (closed) await saveFeedback(closed);
    return NextResponse.json({ ok: true, mine: closed });
  }

  // Pending mine: just cancel it
  const closed = await closeMine(params.id, 'manual', mine.entryPrice ?? 0);
  return NextResponse.json({ ok: true, mine: closed });
}
