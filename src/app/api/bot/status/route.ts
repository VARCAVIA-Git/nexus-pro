import { NextResponse } from 'next/server';
import { redisGet, KEYS } from '@/lib/db/redis';
import type { MultiBotConfig } from '@/types/bot';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('botId');
  const mode = searchParams.get('mode'); // 'demo' or 'real' — filters bots

  // Load ALL bot configs from Redis
  const allConfigs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];

  // Filter by mode if provided
  const configs = mode ? allConfigs.filter(c => c.environment === mode) : allConfigs;

  if (botId) {
    const config = configs.find(c => c.id === botId);
    if (!config) return NextResponse.json({ running: false, error: 'Bot not found' });

    const state = await redisGet<any>(`nexus:bot:state:${botId}`) ?? {};
    return NextResponse.json({
      running: config.status === 'running', startedAt: config.createdAt, config,
      positions: state.positions ?? [], closedTrades: state.closedTrades ?? [],
      signalLog: (state.signalLog ?? []).slice(-50), lastTick: state.lastTick ?? null,
      tickCount: state.tickCount ?? 0, circuitBreaker: { active: false },
      accountEquity: 0, accountCash: 0,
      totalPnl: (state.closedTrades ?? []).reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0),
      error: state.error ?? null, rejectedTrades: state.rejectedTrades ?? 0,
      profitLocks: state.profitLocks ?? 0,
      preTradeLog: (state.preTradeLog ?? []).slice(-20),
    });
  }

  // Aggregate — filtered by mode
  const runningCount = configs.filter(c => c.status === 'running').length;
  let totalPnl = 0;
  const allSignals: any[] = [];

  for (const config of configs) {
    const state = await redisGet<any>(`nexus:bot:state:${config.id}`);
    if (state) {
      totalPnl += (state.closedTrades ?? []).reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0);
      allSignals.push(...(state.signalLog ?? []).slice(-10));
    }
  }

  return NextResponse.json({
    running: runningCount > 0, bots: configs, runningCount,
    positions: [], closedTrades: [],
    signalLog: allSignals.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? '')).slice(0, 30),
    lastTick: null, tickCount: 0, circuitBreaker: { active: false },
    accountEquity: 0, accountCash: 0, totalPnl, error: null,
    rejectedTrades: 0, profitLocks: 0, preTradeLog: [],
  });
}
