import { NextResponse } from 'next/server';
import { redisGet, redisSet } from '@/lib/db/redis';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from '@/lib/utils/encryption';

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
    if (userId) {
      const assets = await redisGet<string[]>(`nexus:${userId}:ticker_assets`);
      if (assets) return NextResponse.json({ assets });
    }
    return NextResponse.json({ assets: null });
  }

  if (section === 'broker') {
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const keys = await redisGet<Record<string, any>>('nexus:broker:keys') ?? {};
    // Decrypt and mask for display
    const liveKeyDisplay = keys.liveKey ? String(keys.liveKey).slice(0, 4) + '...' : '';
    return NextResponse.json({
      liveKey: liveKeyDisplay,
      hasLiveSecret: !!keys.liveSecret,
      liveEnabled: keys.liveEnabled ?? false,
    });
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

  if (body.section === 'ticker_global') {
    // Global ticker config readable by /api/prices without auth
    await redisSet('nexus:global:ticker_assets', body.assets ?? []);
    return NextResponse.json({ ok: true });
  }

  if (body.section === 'broker') {
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const current = await redisGet<Record<string, any>>('nexus:broker:keys') ?? {};
    const updated: Record<string, any> = { ...current };
    if (body.liveKey) updated.liveKey = body.liveKey;
    if (body.liveSecret) updated.liveSecret = body.liveSecret;
    if (body.liveEnabled !== undefined) updated.liveEnabled = body.liveEnabled;
    updated.updatedAt = new Date().toISOString();
    await redisSet('nexus:broker:keys', updated);
    return NextResponse.json({ ok: true });
  }

  if (body.section === 'market_data') {
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const current = await redisGet<Record<string, any>>('nexus:market_data:keys') ?? {};
    const updated: Record<string, any> = { ...current };
    if (body.twelveDataKey) updated.twelveDataKey = body.twelveDataKey;
    if (body.coinGeckoKey) updated.coinGeckoKey = body.coinGeckoKey;
    updated.updatedAt = new Date().toISOString();
    await redisSet('nexus:market_data:keys', updated);
    return NextResponse.json({ ok: true });
  }

  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const current = await redisGet<Record<string, any>>(`nexus:${userId}:settings`) ?? {};
  const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
  await redisSet(`nexus:${userId}:settings`, updated);
  return NextResponse.json({ ok: true, settings: updated });
}
