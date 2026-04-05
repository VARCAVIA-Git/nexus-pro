import { NextResponse } from 'next/server';
import { getBotStatus, getAllBots } from '@/lib/engine/live-runner';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('botId');

  if (botId) {
    return NextResponse.json(getBotStatus(botId));
  }

  // Return all bots + aggregate status
  const allBots = getAllBots();
  const aggregate = getBotStatus();

  return NextResponse.json({
    ...aggregate,
    bots: allBots,
  });
}
