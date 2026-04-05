import { NextResponse } from 'next/server';
import { stopBot, deleteBot } from '@/lib/engine/live-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const botId = body.botId;

    if (body.action === 'delete' && botId) {
      stopBot(botId);
      deleteBot(botId);
      return NextResponse.json({ ok: true, deleted: true });
    }

    const result = stopBot(botId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
