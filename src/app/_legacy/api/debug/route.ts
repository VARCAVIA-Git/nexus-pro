import { NextResponse } from 'next/server';
import { redisGet, KEYS } from '@/lib/db/redis';
import type { MultiBotConfig } from '@/types/bot';

export const dynamic = 'force-dynamic';

export async function GET() {
  const lastTick = await redisGet('nexus:debug:lastTick');
  const configs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];

  const bots: any[] = [];
  for (const c of configs) {
    const state = await redisGet<any>(`nexus:bot:state:${c.id}`);
    bots.push({
      id: c.id, name: c.name, status: c.status,
      assets: c.assets, mode: c.operationMode,
      lastTickAt: c.lastTickAt,
      state: state ? {
        tickCount: state.tickCount ?? 0,
        positions: (state.positions ?? []).length,
        trades: (state.closedTrades ?? []).length,
        rejected: state.rejectedTrades ?? 0,
        lastSignals: (state.signalLog ?? []).slice(-5),
      } : null,
    });
  }

  return NextResponse.json({ lastTick, bots, timestamp: new Date().toISOString() });
}
