import { NextResponse } from 'next/server';
import { startBot, getBotStatus, loadSavedBots } from '@/lib/analytics/action/live-runner';

export const dynamic = 'force-dynamic';

export async function POST() {
  const status = getBotStatus();
  if (status.running) {
    return NextResponse.json({ resumed: false, reason: 'already_running' });
  }

  const savedBots = await loadSavedBots();
  const runningBots = savedBots.filter(b => b.status === 'running');

  if (runningBots.length === 0) {
    return NextResponse.json({ resumed: false, reason: 'no_running_bots_saved' });
  }

  let resumed = 0;
  for (const bot of runningBots) {
    const result = await startBot(bot.id);
    if (result.ok) resumed++;
  }

  return NextResponse.json({ resumed: resumed > 0, count: resumed });
}
