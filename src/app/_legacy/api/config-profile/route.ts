import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getActiveProfile, setActiveProfile } from '@/lib/mine/mine-store';
import { getProfile } from '@/lib/mine/utils';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = await getActiveProfile();
  const profile = getProfile(name);
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = body?.profile;
  if (name !== 'conservative' && name !== 'moderate' && name !== 'aggressive') {
    return NextResponse.json({ error: 'Invalid profile' }, { status: 400 });
  }

  await setActiveProfile(name);
  const profile = getProfile(name);
  return NextResponse.json({ ok: true, profile });
}
