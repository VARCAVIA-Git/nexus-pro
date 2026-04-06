import { NextResponse } from 'next/server';
import { redisDel } from '@/lib/db/redis';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (sessionId) {
    await redisDel(`nexus:session:${sessionId}`).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('nexus-session');
  return response;
}
