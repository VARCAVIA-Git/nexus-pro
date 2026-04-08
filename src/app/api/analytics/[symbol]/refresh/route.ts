import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getAnalytic } from '@/lib/analytics/analytic-registry';
import { enqueue } from '@/lib/analytics/analytic-queue';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { symbol: string } }) {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await redisGet(`nexus:session:${sessionId}`);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const state = await getAnalytic(symbol);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const job = await enqueue(symbol, state.assetClass);
  return NextResponse.json({ job });
}
