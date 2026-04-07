import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { spawnAnalytic } from '@/lib/analytics/analytic-registry';
import { enqueue } from '@/lib/analytics/analytic-queue';
import type { AssetClass } from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { symbol: string } }) {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await redisGet(`nexus:session:${sessionId}`);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  let assetClass: AssetClass = 'crypto';
  try {
    const body = await req.json();
    if (body?.assetClass) assetClass = body.assetClass;
  } catch {
    /* body opzionale */
  }

  const analytic = await spawnAnalytic(symbol, assetClass);
  const job = await enqueue(symbol);

  return NextResponse.json({ analytic, job });
}
