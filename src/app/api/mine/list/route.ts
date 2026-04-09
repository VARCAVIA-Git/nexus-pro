import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getActiveMines, getMineHistory } from '@/lib/mine/mine-store';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') ?? undefined;
  const status = url.searchParams.get('status');

  if (status === 'closed' && symbol) {
    const history = await getMineHistory(symbol, 50);
    return NextResponse.json({ mines: history });
  }

  const mines = await getActiveMines(symbol);
  return NextResponse.json({ mines });
}
