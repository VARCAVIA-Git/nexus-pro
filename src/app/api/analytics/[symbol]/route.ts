import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getAnalytic, removeAnalytic } from '@/lib/analytics/analytic-registry';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const state = await getAnalytic(symbol);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const report = await redisGet(`nexus:analytic:report:${symbol}`);
  return NextResponse.json({ analytic: state, report });
}

export async function DELETE(_req: Request, { params }: { params: { symbol: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  await removeAnalytic(symbol);
  return NextResponse.json({ ok: true });
}
