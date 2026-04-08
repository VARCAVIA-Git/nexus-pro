import { NextResponse } from 'next/server';
import { getNotifications, getUnreadCount, markRead, markAllRead } from '@/lib/analytics/action/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [notifications, unreadCount] = await Promise.all([
    getNotifications(50),
    getUnreadCount(),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(request: Request) {
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
