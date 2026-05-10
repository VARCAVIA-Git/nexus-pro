// NexusOne v3 — Dashboard data endpoint.
// Reads file-based state directly (no Redis) and returns full snapshot.

import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  getMode, loadTuples, loadPortfolio, readClosedTrades, isLiveApproved, getStateDir,
} from '@/lib/nexusone/v3/persistence';
import { getPaperAccount } from '@/lib/nexusone/v3/alpaca-paper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mode = await getMode();
    const tuples = await loadTuples();
    const p = await loadPortfolio();
    const closed = await readClosedTrades();
    const liveApproved = await isLiveApproved();
    const stateDir = getStateDir();

    let evaluatorVerdict: any = null;
    let runnerLogTail: string[] = [];
    try {
      const vfile = path.join(stateDir, 'evaluator-verdict.json');
      if (fs.existsSync(vfile)) evaluatorVerdict = JSON.parse(fs.readFileSync(vfile, 'utf8'));
    } catch {}
    try {
      const lfile = path.join(stateDir, 'runner.log');
      if (fs.existsSync(lfile)) {
        const lines = fs.readFileSync(lfile, 'utf8').split('\n').filter(Boolean);
        runnerLogTail = lines.slice(-50);
      }
    } catch {}

    const tupleArr = tuples.all().map((t) => ({
      key: t.key,
      primitive: t.primitive,
      asset: t.asset,
      tf: t.tf,
      active: t.active,
      totalTrades: t.totalTrades,
      posteriorBps: Math.round(t.posteriorExpectancyBps * 100) / 100,
      recentTrades: t.netBpsHistory.slice(-10),
    }));

    const closedSummary = closed.slice(0, 100).map((t) => ({
      ts: t.exitTs,
      asset: t.asset,
      tf: t.tf,
      primitive: t.primitive,
      dir: t.dir,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      reason: t.reason,
      netBps: Math.round(t.netBps * 100) / 100,
      netDollars: Math.round(t.netDollars * 100) / 100,
      durationMs: t.exitTs - t.entryTs,
    }));

    // Equity curve from closed trades
    const equityCurve: { ts: number; equity: number }[] = [];
    let eq = p.cfg?.initialEquity ?? 10000;
    const sortedClosed = [...closed].sort((a, b) => a.exitTs - b.exitTs);
    for (const t of sortedClosed) {
      eq += t.netDollars;
      equityCurve.push({ ts: t.exitTs, equity: Math.round(eq * 100) / 100 });
    }

    const alpaca = await getPaperAccount();

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      mode,
      live_approved: liveApproved,
      portfolio: {
        equity: Math.round(p.equity),
        peak_equity: Math.round(p.peakEquity),
        max_drawdown_pct: Math.round(p.maxDrawdownPct * 10000) / 100,
        initial_equity: p.cfg?.initialEquity ?? 10000,
        open_positions: p.open,
        closed_total: closed.length,
        halted_until_ts: p.riskState?.haltedUntilTs ?? 0,
        consecutive_losses: p.riskState?.consecutiveLosses ?? 0,
      },
      tuples: {
        total: tupleArr.length,
        active: tupleArr.filter((t) => t.active).length,
        details: tupleArr,
      },
      recent_trades: closedSummary,
      equity_curve: equityCurve,
      evaluator: evaluatorVerdict,
      runner_log_tail: runnerLogTail,
      alpaca: alpaca,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
