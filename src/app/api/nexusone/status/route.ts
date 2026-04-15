// NexusOne — System status

import { NextResponse } from 'next/server';
import { getSystemMode, getActiveStrategy, listStrategies } from '@/lib/nexusone/strategy-registry';
import { getKillSwitch } from '@/lib/nexusone/risk-engine';
import { getOpenTrade, getRecentTrades, getRecentOrders } from '@/lib/nexusone/execution-engine';
import { getLatestDrift } from '@/lib/nexusone/evaluation-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [mode, strategy, killSwitch, openTrade, recentTrades, recentOrders, drift] = await Promise.all([
    getSystemMode(),
    getActiveStrategy(),
    getKillSwitch(),
    getOpenTrade(),
    getRecentTrades(20),
    getRecentOrders(20),
    getLatestDrift(),
  ]);

  const closedTrades = recentTrades.filter(t => t.status === 'closed');
  const totalNetBps = closedTrades.reduce((s, t) => s + t.net_bps, 0);
  const winRate = closedTrades.length > 0
    ? closedTrades.filter(t => t.net_bps > 0).length / closedTrades.length
    : 0;

  return NextResponse.json({
    mode,
    strategy: strategy ? {
      id: strategy.id,
      version: strategy.version,
      symbol: strategy.symbol,
      direction: strategy.direction,
      status: strategy.status,
    } : null,
    kill_switch: {
      triggered: killSwitch.triggered,
      reason: killSwitch.reason,
    },
    open_trade: openTrade?.status === 'open' ? {
      symbol: openTrade.symbol,
      direction: openTrade.direction,
      entry_price: openTrade.entry_price,
      entry_ts: openTrade.entry_ts,
    } : null,
    performance: {
      total_trades: closedTrades.length,
      total_net_bps: Math.round(totalNetBps * 100) / 100,
      win_rate: Math.round(winRate * 1000) / 1000,
    },
    evaluation: drift ? {
      go_no_go: drift.go_no_go,
      trades: drift.trades,
      net_bps_mean: drift.net_bps_mean,
      fill_rate: drift.fill_rate,
      reasons: drift.reasons,
    } : null,
    strategies: listStrategies().map(s => ({ id: s.id, version: s.version, status: s.status })),
  });
}
