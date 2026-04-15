import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getAICStatus } from '@/lib/mine/aic-client';
import { SUPPORTED_SYMBOLS } from '@/lib/mine/constants';

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
  const symbol = url.searchParams.get('symbol') ?? 'BTC/USD';

  const status = await getAICStatus(symbol);
  return NextResponse.json({ status });
}
