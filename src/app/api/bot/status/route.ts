import { NextResponse } from 'next/server';
import { redisGet, KEYS } from '@/lib/db/redis';
import type { MultiBotConfig } from '@/types/bot';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('botId');

  // Load bot configs from Redis (source of truth)
  const allConfigs = await redisGet<MultiBotConfig[]>(KEYS.botConfig) ?? [];
  console.log(`[BOT STATUS] Redis key: ${KEYS.botConfig}, bots found: ${allConfigs.length}`);

  if (botId) {
    const config = allConfigs.find(c => c.id === botId);
    if (!config) return NextResponse.json({ running: false, error: 'Bot not found' });

    // Load per-bot state from Redis
    const state = await redisGet<any>(`nexus:bot:state:${botId}`) ?? {};
    return NextResponse.json({
      running: config.status === 'running',
      startedAt: config.createdAt,
      config,
      positions: state.positions ?? [],
      closedTrades: state.closedTrades ?? [],
      signalLog: (state.signalLog ?? []).slice(-50),
      lastTick: state.lastTick ?? null,
      tickCount: state.tickCount ?? 0,
      circuitBreaker: { active: false },
      accountEquity: 0,
      accountCash: 0,
      totalPnl: (state.closedTrades ?? []).reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0),
      error: state.error ?? null,
      rejectedTrades: state.rejectedTrades ?? 0,
      profitLocks: state.profitLocks ?? 0,
      preTradeLog: (state.preTradeLog ?? []).slice(-20),
      lastSignals: (state.signalLog ?? []).slice(-5),
    });
  }

  // Aggregate
  const runningCount = allConfigs.filter(c => c.status === 'running').length;
  let totalPositions = 0;
  let totalTrades = 0;
  let totalPnl = 0;
  const allSignals: any[] = [];

  for (const config of allConfigs) {
    const state = await redisGet<any>(`nexus:bot:state:${config.id}`);
    if (state) {
      totalPositions += (state.positions ?? []).length;
      totalTrades += (state.closedTrades ?? []).length;
      totalPnl += (state.closedTrades ?? []).reduce((s: number, t: any) => s + (t.netPnl ?? 0), 0);
      allSignals.push(...(state.signalLog ?? []).slice(-10));
    }
  }

  return NextResponse.json({
    running: runningCount > 0,
    bots: allConfigs,
    runningCount,
    positions: [],
    closedTrades: [],
    signalLog: allSignals.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? '')).slice(0, 30),
    lastTick: null,
    tickCount: 0,
    circuitBreaker: { active: false },
    accountEquity: 0,
    accountCash: 0,
    totalPnl,
    error: null,
    rejectedTrades: 0,
    profitLocks: 0,
    preTradeLog: [],
  });
}
