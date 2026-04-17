// NexusOne v2 — system status.
import { NextResponse } from 'next/server';
import { getMode } from '@/lib/nexusone/core/orchestrator';
import { getRegimeState } from '@/lib/nexusone/core/regime-detector';
import { getCircuitState } from '@/lib/nexusone/risk/circuit-breaker';
import { getOpenPosition, listRecentTrades } from '@/lib/nexusone/core/position-manager';
import { ALL_STRATEGIES } from '@/lib/nexusone/strategies-v2/registry';
import { getVenueForAsset } from '@/lib/nexusone/execution/venue-registry';

export const dynamic = 'force-dynamic';

const ASSETS = ['BTC/USD', 'ETH/USD'];

export async function GET(): Promise<Response> {
  const venue = (() => {
    try { return getVenueForAsset('BTC/USD'); } catch { return null; }
  })();

  let balance = null;
  try { balance = venue ? await venue.getBalance() : null; } catch { balance = null; }

  const equity = balance ? balance.cash : 0;

  const [mode, regime, circuit, trades, ...positions] = await Promise.all([
    getMode(),
    getRegimeState(),
    getCircuitState(equity),
    listRecentTrades(20),
    ...ASSETS.map(a => getOpenPosition(a)),
  ]);

  const closed = trades.filter(t => t.closed_at);
  const wins = closed.filter(t => (t.net_pnl ?? 0) > 0).length;
  const netPnl = closed.reduce((s, t) => s + (t.net_pnl ?? 0), 0);

  return NextResponse.json({
    mode,
    venue: venue?.name ?? null,
    balance,
    regime: regime ? { current: regime.current, candidate: regime.candidate, candidate_bars: regime.candidate_bars } : null,
    circuit_breaker: circuit ? {
      daily_trades: circuit.daily_trade_count,
      daily_realized_pnl: circuit.daily_realized_pnl,
      equity_peak: circuit.equity_peak,
      system_killed: circuit.system_killed,
      kill_reason: circuit.kill_reason,
    } : null,
    open_positions: positions.filter(Boolean),
    performance_7d: {
      closed_trades: closed.length,
      wins,
      win_rate: closed.length ? wins / closed.length : 0,
      net_pnl: Math.round(netPnl * 100) / 100,
    },
    strategies: ALL_STRATEGIES.map(s => ({
      id: s.id,
      name: s.name,
      timeframe_min: s.timeframeMin,
      active_regimes: s.activeRegimes,
    })),
  });
}
