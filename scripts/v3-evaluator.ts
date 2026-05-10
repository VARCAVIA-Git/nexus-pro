// NexusOne v3 — Auto-evaluator.
//
// Scans the closed-trades log + portfolio every 6 hours and writes a
// human-readable status to .v3-state/evaluator-report.md. After 30
// days of paper, the evaluator emits a verdict:
//
//   PAPER_PASS   → criteria met, ready for live_micro consideration
//   PAPER_HOLD   → keep running paper, not enough signal
//   PAPER_FAIL   → kill criteria triggered, mode → disabled
//
// Triggers automatic mode-disable on PAPER_FAIL. Live activation always
// requires creating an `approve_live` file in .v3-state — never auto.

import * as dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import {
  getMode, setMode, loadTuples, loadPortfolio, readClosedTrades, getStateDir,
} from '../src/lib/nexusone/v3/persistence';

const STATE_DIR = getStateDir();
const REPORT_FILE = path.join(STATE_DIR, 'evaluator-report.md');
const VERDICT_FILE = path.join(STATE_DIR, 'evaluator-verdict.json');
const SIX_HOURS_MS = 6 * 3600 * 1000;
const PAPER_REVIEW_DAYS = 30;

interface Verdict {
  generated_at: string;
  mode: string;
  paper_days_elapsed: number;
  ready_for_review: boolean;
  decision: 'PAPER_PASS' | 'PAPER_HOLD' | 'PAPER_FAIL' | 'NOT_PAPER';
  metrics: any;
  reasons: string[];
}

function findPaperStartTs(): number {
  // Use mode.json mtime as proxy for paper-start (set via setMode('paper'))
  const modeFile = path.join(STATE_DIR, 'mode.json');
  if (!fs.existsSync(modeFile)) return Date.now();
  return fs.statSync(modeFile).mtimeMs;
}

async function evaluate(): Promise<Verdict> {
  const mode = await getMode();
  const closed = await readClosedTrades();
  const tuples = await loadTuples();
  const p = await loadPortfolio();

  const paperStart = findPaperStartTs();
  const elapsed = Date.now() - paperStart;
  const days = elapsed / (24 * 3600 * 1000);

  const reasons: string[] = [];
  if (mode !== 'paper' && mode !== 'live_micro' && mode !== 'live') {
    return {
      generated_at: new Date().toISOString(),
      mode, paper_days_elapsed: days,
      ready_for_review: false,
      decision: 'NOT_PAPER',
      metrics: { mode },
      reasons: ['system not in active trading mode'],
    };
  }

  // Compute metrics on paper-period trades only
  const inWindow = closed.filter((t) => t.entryTs >= paperStart);
  const totalNet = inWindow.reduce((s, t) => s + t.netDollars, 0);
  const wins = inWindow.filter((t) => t.netDollars > 0);
  const winRate = inWindow.length ? wins.length / inWindow.length : 0;
  const initialEquity = p.cfg?.initialEquity ?? 10000;
  const totalReturnPct = (totalNet / initialEquity) * 100;
  const grossWin = wins.reduce((s, t) => s + t.netDollars, 0);
  const grossLoss = Math.abs(inWindow.filter((t) => t.netDollars <= 0).reduce((s, t) => s + t.netDollars, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : (wins.length ? 99 : 0);

  // Per-day P&L for Sharpe
  const byDay = new Map<string, number>();
  for (const t of inWindow) {
    const dk = new Date(t.exitTs).toISOString().slice(0, 10);
    byDay.set(dk, (byDay.get(dk) ?? 0) + t.netDollars / initialEquity);
  }
  const rets = [...byDay.values()];
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length ? Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length) : 0;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(365) : 0;

  const activeTuples = tuples.all().filter((t) => t.active).length;
  const totalTuples = tuples.size();
  const positivePosteriorTuples = tuples.all().filter((t) => t.active && t.posteriorExpectancyBps > 0).length;
  const positiveActiveRatio = activeTuples > 0 ? positivePosteriorTuples / activeTuples : 0;

  const metrics = {
    trades_total: inWindow.length,
    trades_per_day: days > 0 ? inWindow.length / days : 0,
    total_return_pct: Math.round(totalReturnPct * 100) / 100,
    max_drawdown_pct: Math.round(p.maxDrawdownPct * 10000) / 100,
    sharpe: Math.round(sharpe * 100) / 100,
    win_rate: Math.round(winRate * 1000) / 10,
    profit_factor: Math.round(pf * 100) / 100,
    active_tuples: activeTuples, total_tuples: totalTuples,
    positive_active_ratio: Math.round(positiveActiveRatio * 100) / 100,
  };

  const ready = days >= PAPER_REVIEW_DAYS;

  // Kill criteria (apply ANY TIME, not just at review)
  if (metrics.max_drawdown_pct > 10) reasons.push(`KILL: drawdown ${metrics.max_drawdown_pct}% > 10%`);
  if (days >= 7 && metrics.sharpe < -1.5) reasons.push(`KILL: sharpe ${metrics.sharpe} < -1.5 after ${days.toFixed(1)}d`);
  if (days >= 14 && inWindow.length === 0) reasons.push('KILL: no trades after 14 days');

  const killTriggered = reasons.some((r) => r.startsWith('KILL'));

  let decision: Verdict['decision'];
  if (killTriggered) decision = 'PAPER_FAIL';
  else if (!ready) decision = 'PAPER_HOLD';
  else {
    const okSharpe = metrics.sharpe > 1.0;
    const okDD = metrics.max_drawdown_pct < 5;
    const okTrades = metrics.trades_total >= 30;
    const okTuples = metrics.positive_active_ratio >= 0.5;
    if (!okSharpe) reasons.push(`Sharpe ${metrics.sharpe} ≤ 1.0`);
    if (!okDD) reasons.push(`drawdown ${metrics.max_drawdown_pct}% ≥ 5%`);
    if (!okTrades) reasons.push(`only ${metrics.trades_total} trades < 30`);
    if (!okTuples) reasons.push(`positive active ratio ${metrics.positive_active_ratio} < 0.5`);
    decision = (okSharpe && okDD && okTrades && okTuples) ? 'PAPER_PASS' : 'PAPER_HOLD';
  }

  return {
    generated_at: new Date().toISOString(),
    mode, paper_days_elapsed: Math.round(days * 100) / 100,
    ready_for_review: ready,
    decision,
    metrics,
    reasons,
  };
}

function renderReport(v: Verdict): string {
  return `# NexusOne v3 — Evaluator Report

Generated: ${v.generated_at}
Mode: \`${v.mode}\`
Days elapsed: ${v.paper_days_elapsed} / ${PAPER_REVIEW_DAYS}
Decision: **${v.decision}**

## Metrics
- Trades: ${v.metrics.trades_total} (${v.metrics.trades_per_day?.toFixed?.(2) ?? '-'}/day)
- Return: ${v.metrics.total_return_pct}%
- Max drawdown: ${v.metrics.max_drawdown_pct}%
- Sharpe (annualized): ${v.metrics.sharpe}
- Win rate: ${v.metrics.win_rate}%
- Profit factor: ${v.metrics.profit_factor}
- Tuples: ${v.metrics.active_tuples}/${v.metrics.total_tuples} active, ${(v.metrics.positive_active_ratio * 100).toFixed(0)}% with positive posterior

## Reasons
${v.reasons.length ? v.reasons.map((r) => `- ${r}`).join('\n') : '- (none)'}

## Decision logic
- PAPER_HOLD: still in window or insufficient evidence yet
- PAPER_PASS: 30+ days, Sharpe>1, DD<5%, ≥30 trades, ≥50% active tuples positive
- PAPER_FAIL: any kill trigger (DD>10%, Sharpe<-1.5 after 7d, no trades after 14d)
- On PAPER_FAIL: mode is auto-set to 'disabled'
`;
}

async function main() {
  console.log(`[evaluator ${new Date().toISOString()}] running`);
  const v = await evaluate();
  fs.writeFileSync(VERDICT_FILE, JSON.stringify(v, null, 2));
  fs.writeFileSync(REPORT_FILE, renderReport(v));
  console.log(`[evaluator] decision=${v.decision} elapsed=${v.paper_days_elapsed}d`);

  if (v.decision === 'PAPER_FAIL') {
    console.log('[evaluator] PAPER_FAIL — disabling mode');
    await setMode('disabled');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
