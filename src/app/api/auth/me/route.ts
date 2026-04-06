import { NextResponse } from 'next/server';
import { redisGet } from '@/lib/db/redis';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const session = await redisGet<{ userId: string; email: string; name: string }>(`nexus:session:${sessionId}`);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: session });
}
