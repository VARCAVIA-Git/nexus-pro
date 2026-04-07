import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getJobStatus } from '@/lib/analytics/analytic-queue';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await redisGet(`nexus:session:${sessionId}`);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const job = await getJobStatus(symbol);
  if (!job) return NextResponse.json({ job: null });
  return NextResponse.json({ job });
}
