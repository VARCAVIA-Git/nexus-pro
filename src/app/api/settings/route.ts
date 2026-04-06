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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section');
  const userId = await getUserId();

  if (section === 'ticker') {
    // Ticker assets — works without auth (uses default if no user)
    if (userId) {
      const assets = await redisGet<string[]>(`nexus:${userId}:ticker_assets`);
      if (assets) return NextResponse.json({ assets });
    }
    return NextResponse.json({ assets: null }); // null = use defaults
  }

  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const settings = await redisGet(`nexus:${userId}:settings`) ?? {};
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  const body = await request.json();

  if (body.section === 'ticker') {
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await redisSet(`nexus:${userId}:ticker_assets`, body.assets ?? []);
    return NextResponse.json({ ok: true });
  }

  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const current = await redisGet<Record<string, any>>(`nexus:${userId}:settings`) ?? {};
  const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
  await redisSet(`nexus:${userId}:settings`, updated);
  return NextResponse.json({ ok: true, settings: updated });
}
