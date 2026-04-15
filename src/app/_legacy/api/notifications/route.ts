import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { NextResponse } from 'next/server';
import { getNotifications, getUnreadCount, markRead, markAllRead } from '@/lib/analytics/action/notifications';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [notifications, unreadCount] = await Promise.all([
    getNotifications(50),
    getUnreadCount(),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();

  if (body.action === 'mark_read' && body.id) {
    await markRead(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'mark_all_read') {
    await markAllRead();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
