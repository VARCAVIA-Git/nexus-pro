// NexusOne v3 — status endpoint
import { NextResponse } from 'next/server';
import { getMode, loadTuples, loadPortfolio } from '@/lib/nexusone/v3/persistence';
import { redisGet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mode = await getMode();
    const tuples = await loadTuples();
    const p = await loadPortfolio();
    const approveLive = await redisGet<string | boolean>('nexusone:v3:approve_live');

    const tupleSummary = tuples.all().map((t) => ({
      key: t.key, active: t.active, totalTrades: t.totalTrades,
      posteriorBps: Math.round(t.posteriorExpectancyBps * 100) / 100,
    }));

    return NextResponse.json({
      ok: true,
      mode,
      live_approved: approveLive === true || approveLive === 'true',
      portfolio: {
        equity: Math.round(p.equity),
        peak_equity: Math.round(p.peakEquity),
        max_drawdown_pct: Math.round(p.maxDrawdownPct * 10000) / 100,
        open_positions: p.open.length,
        closed_total: p.closed.length,
        halted_until_ts: p.riskState.haltedUntilTs,
      },
      tuples: {
        total: tupleSummary.length,
        active: tupleSummary.filter((t) => t.active).length,
        details: tupleSummary,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
