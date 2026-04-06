import { NextResponse } from 'next/server';
import { redisGet, redisSet } from '@/lib/db/redis';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getUserId(): Promise<string | null> {
  const sid = cookies().get('nexus-session')?.value;
  if (!sid) return null;
  const session = await redisGet<{ userId: string }>(`nexus:session:${sid}`);
  return session?.userId ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const settings = await redisGet(`nexus:${userId}:settings`) ?? {};
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const current = await redisGet<Record<string, any>>(`nexus:${userId}:settings`) ?? {};
  const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
  await redisSet(`nexus:${userId}:settings`, updated);

  return NextResponse.json({ ok: true, settings: updated });
}
