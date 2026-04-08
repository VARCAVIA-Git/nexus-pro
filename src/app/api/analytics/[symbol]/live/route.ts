// ═══════════════════════════════════════════════════════════════
// GET /api/analytics/[symbol]/live
// Ritorna LiveContext + NewsDigest + upcoming macro events
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getUpcomingEvents } from '@/lib/analytics/macro/event-calendar';
import type { LiveContext, NewsDigest } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await redisGet(`nexus:session:${sessionId}`);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const [live, news, events] = await Promise.all([
    redisGet<LiveContext>(`nexus:analytic:live:${symbol}`),
    redisGet<NewsDigest>(`nexus:analytic:news:${symbol}`),
    getUpcomingEvents(7 * 24).catch(() => []),
  ]);

  return NextResponse.json({ live, news, events });
}
