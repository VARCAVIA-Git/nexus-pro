import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import type { ReactionZone } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await redisGet(`nexus:session:${sessionId}`);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const zones = await redisGet<ReactionZone[]>(`nexus:analytic:zones:${symbol}`);
  return NextResponse.json({ zones: Array.isArray(zones) ? zones : [] });
}
