import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getEngineState, setEngineEnabled } from '@/lib/mine/mine-store';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = await getEngineState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'start') {
    await setEngineEnabled(true);
    return NextResponse.json({ ok: true, enabled: true });
  }
  if (action === 'stop') {
    await setEngineEnabled(false);
    return NextResponse.json({ ok: true, enabled: false });
  }

  return NextResponse.json({ error: 'Invalid action. Use "start" or "stop"' }, { status: 400 });
}
