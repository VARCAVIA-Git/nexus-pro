'use client';

import { useEffect, useState } from 'react';

interface DashboardData {
  ok: boolean;
  generated_at: string;
  mode: string;
  live_approved: boolean;
  portfolio: {
    equity: number;
    peak_equity: number;
    max_drawdown_pct: number;
    initial_equity: number;
    open_positions: any[];
    closed_total: number;
    halted_until_ts: number;
    consecutive_losses: number;
  };
  tuples: {
    total: number;
    active: number;
    details: Array<{
      key: string;
      primitive: string;
      asset: string;
      tf: string;
      active: boolean;
      totalTrades: number;
      posteriorBps: number;
      recentTrades: number[];
    }>;
  };
  recent_trades: Array<{
    ts: number;
    asset: string;
    tf: string;
    primitive: string;
    dir: string;
    entryPrice: number;
    exitPrice: number;
    reason: string;
    netBps: number;
    netDollars: number;
    durationMs: number;
  }>;
  equity_curve: Array<{ ts: number; equity: number }>;
  evaluator: any;
  runner_log_tail: string[];
  alpaca: { ok: boolean; equity?: number; cash?: number; status?: string; error?: string };
}

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtTs = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
const fmtDur = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h${m}m`;
};

export default function NexusV3Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/nexusone/v3/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'unknown');
      setData(json);
      setError(null);
      setLastRefresh(Date.now());
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const setMode = async (mode: string) => {
    if (!confirm(`Set mode to ${mode}?`)) return;
    const res = await fetch('/api/nexusone/v3/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_mode', mode }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    fetchData();
  };

  const resetState = async () => {
    if (!confirm('CLEAR all v3 state? This cannot be undone. Stop the daemon first if needed.')) return;
    const res = await fetch('/api/nexusone/v3/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_state' }),
    });
    const json = await res.json();
    if (!json.ok) alert(`Error: ${json.error}`);
    else alert('State cleared.');
    fetchData();
  };

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-8 text-zinc-400">Loading…</div>;

  const p = data.portfolio;
  const returnPct = ((p.equity - p.initial_equity) / p.initial_equity) * 100;
  const halted = p.halted_until_ts > Date.now();

  const winningTrades = data.recent_trades.filter((t) => t.netDollars > 0).length;
  const totalTrades = data.recent_trades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const sumNet = data.recent_trades.reduce((s, t) => s + t.netDollars, 0);
  const avgPnl = totalTrades > 0 ? sumNet / totalTrades : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6 font-sans">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">NexusOne v3 — Adaptive Trading</h1>
          <p className="text-sm text-zinc-400">Sistema adattivo multi-asset · 6 primitives × 6 asset × 2 TF · {fmtTs(Date.parse(data.generated_at))}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Refresh</button>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> auto 10s
          </label>
          <span className="text-xs text-zinc-500">last: {Math.round((Date.now() - lastRefresh) / 1000)}s ago</span>
        </div>
      </header>

      {/* Mode + Halt banner */}
      <div className={`rounded-lg p-4 border ${
        data.mode === 'paper' ? 'border-blue-700 bg-blue-950/40' :
        data.mode === 'disabled' ? 'border-zinc-700 bg-zinc-900' :
        data.mode === 'live' || data.mode === 'live_micro' ? (data.live_approved ? 'border-red-700 bg-red-950/40' : 'border-amber-700 bg-amber-950/40') :
        'border-zinc-700 bg-zinc-900'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Mode</div>
            <div className="text-2xl font-bold">{data.mode}{data.live_approved ? ' · APPROVED' : ''}</div>
            {halted && <div className="text-amber-400 text-sm mt-1">⚠ HALTED until {fmtTs(p.halted_until_ts)}</div>}
            {(data.mode === 'live' || data.mode === 'live_micro') && !data.live_approved && (
              <div className="text-amber-400 text-sm mt-1">Mode è live ma approve_live file assente → ordini paper-only.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMode('disabled')} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Disable</button>
            <button onClick={() => setMode('paper')} className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-sm">Paper</button>
            <button onClick={resetState} className="px-3 py-1.5 rounded bg-red-900 hover:bg-red-800 text-sm">Reset state</button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Equity" value={`$${fmt(p.equity, 0)}`} sub={`${returnPct >= 0 ? '+' : ''}${fmt(returnPct, 2)}%`} good={returnPct >= 0} />
        <Stat label="Peak" value={`$${fmt(p.peak_equity, 0)}`} />
        <Stat label="Drawdown" value={`${fmt(p.max_drawdown_pct, 2)}%`} good={p.max_drawdown_pct < 5} />
        <Stat label="Closed" value={p.closed_total.toString()} sub={`${winningTrades}W ${totalTrades - winningTrades}L`} />
        <Stat label="Win rate" value={`${fmt(winRate, 1)}%`} good={winRate >= 35} />
        <Stat label="Avg P/L" value={`${avgPnl >= 0 ? '+' : ''}$${fmt(avgPnl, 2)}`} good={avgPnl >= 0} />
        <Stat label="Open pos" value={p.open_positions.length.toString()} />
        <Stat label="Conseq losses" value={p.consecutive_losses.toString()} good={p.consecutive_losses < 3} />
        <Stat label="Tuples active" value={`${data.tuples.active}/${data.tuples.total}`} />
        <Stat label="Alpaca" value={data.alpaca.ok ? 'ON' : 'OFF'} sub={data.alpaca.ok ? `$${fmt(data.alpaca.equity ?? 0, 0)}` : (data.alpaca.error ?? '-')} good={data.alpaca.ok} />
      </div>

      {/* Equity curve */}
      <Card title="Equity curve">
        {data.equity_curve.length === 0 ? (
          <div className="text-zinc-500 text-sm">No closed trades yet. Curve apparirà appena il sistema piazza il primo trade.</div>
        ) : (
          <EquityChart points={data.equity_curve} initial={p.initial_equity} />
        )}
      </Card>

      {/* Evaluator verdict */}
      <Card title="Evaluator verdict">
        {data.evaluator ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${
                data.evaluator.decision === 'PAPER_PASS' ? 'text-emerald-400' :
                data.evaluator.decision === 'PAPER_FAIL' ? 'text-red-400' :
                'text-zinc-300'
              }`}>{data.evaluator.decision}</span>
              <span className="text-sm text-zinc-400">{fmt(data.evaluator.paper_days_elapsed, 2)} / 30 days</span>
              <span className="text-xs text-zinc-500">generated {fmtTs(Date.parse(data.evaluator.generated_at))}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div><span className="text-zinc-500">Trades:</span> {data.evaluator.metrics.trades_total}</div>
              <div><span className="text-zinc-500">Sharpe:</span> {data.evaluator.metrics.sharpe}</div>
              <div><span className="text-zinc-500">Return:</span> {data.evaluator.metrics.total_return_pct}%</div>
              <div><span className="text-zinc-500">Drawdown:</span> {data.evaluator.metrics.max_drawdown_pct}%</div>
              <div><span className="text-zinc-500">Win rate:</span> {data.evaluator.metrics.win_rate}%</div>
              <div><span className="text-zinc-500">PF:</span> {data.evaluator.metrics.profit_factor}</div>
              <div><span className="text-zinc-500">Active+ tuples ratio:</span> {(data.evaluator.metrics.positive_active_ratio * 100).toFixed(0)}%</div>
              <div><span className="text-zinc-500">Trades/day:</span> {data.evaluator.metrics.trades_per_day?.toFixed?.(2) ?? '-'}</div>
            </div>
            {data.evaluator.reasons?.length > 0 && (
              <ul className="text-sm text-amber-400 list-disc ml-5">
                {data.evaluator.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="text-zinc-500 text-sm">No verdict yet. Evaluator runs every 6h via PM2 cron.</div>
        )}
      </Card>

      {/* Open positions */}
      <Card title={`Open positions (${p.open_positions.length})`}>
        {p.open_positions.length === 0 ? (
          <div className="text-zinc-500 text-sm">No open positions.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-zinc-400 text-xs"><tr>
              <th className="text-left p-2">Asset</th><th>TF</th><th>Strategy</th><th>Dir</th>
              <th className="text-right">Entry</th><th className="text-right">Stop</th><th className="text-right">TP</th>
              <th className="text-right">Notional</th><th className="text-right">Risk</th><th>Opened</th>
            </tr></thead>
            <tbody>
              {p.open_positions.map((o: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="p-2 font-mono">{o.asset}</td><td>{o.tf}</td><td>{o.primitive}</td>
                  <td className={o.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}>{o.dir}</td>
                  <td className="text-right font-mono">${fmt(o.entryPrice, 2)}</td>
                  <td className="text-right font-mono text-red-400/80">${fmt(o.stopPrice, 2)}</td>
                  <td className="text-right font-mono text-emerald-400/80">${fmt(o.tpPrice, 2)}</td>
                  <td className="text-right">${fmt(o.notional, 2)}</td>
                  <td className="text-right">{fmt(o.riskBps, 0)}bps</td>
                  <td className="text-xs">{fmtTs(o.entryTs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Tuples — clustered by activity & posterior */}
      <Card title={`Tuples (${data.tuples.active}/${data.tuples.total} active)`}>
        {data.tuples.details.length === 0 ? (
          <div className="text-zinc-500 text-sm">No tuples yet — system creates them on first signal.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400 text-xs"><tr>
                <th className="text-left p-2">Tuple</th><th>Active</th>
                <th className="text-right">Trades</th><th className="text-right">Posterior</th>
                <th className="text-left">Recent (last 10)</th>
              </tr></thead>
              <tbody>
                {data.tuples.details
                  .sort((a, b) => b.posteriorBps - a.posteriorBps)
                  .map((t) => (
                  <tr key={t.key} className="border-t border-zinc-800">
                    <td className="p-2 font-mono text-xs">{t.key}</td>
                    <td>{t.active ? <span className="text-emerald-400">●</span> : <span className="text-zinc-600">○</span>}</td>
                    <td className="text-right">{t.totalTrades}</td>
                    <td className={`text-right font-mono ${t.posteriorBps > 0 ? 'text-emerald-400' : t.posteriorBps < -2 ? 'text-red-400' : 'text-zinc-300'}`}>
                      {t.posteriorBps > 0 ? '+' : ''}{fmt(t.posteriorBps, 1)}bps
                    </td>
                    <td className="font-mono text-xs">
                      {t.recentTrades.map((r, i) => (
                        <span key={i} className={r > 0 ? 'text-emerald-500' : 'text-red-500'}>{r > 0 ? '+' : ''}{Math.round(r)}{i < t.recentTrades.length - 1 ? ' ' : ''}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent trades */}
      <Card title={`Recent closed trades (${data.recent_trades.length})`}>
        {data.recent_trades.length === 0 ? (
          <div className="text-zinc-500 text-sm">No closed trades yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-zinc-400 text-xs"><tr>
              <th className="text-left p-2">Closed</th><th>Asset</th><th>TF</th><th>Strategy</th><th>Dir</th>
              <th>Reason</th><th className="text-right">Net bps</th><th className="text-right">P/L $</th><th>Hold</th>
            </tr></thead>
            <tbody>
              {data.recent_trades.slice(0, 30).map((t, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="p-2 text-xs">{fmtTs(t.ts)}</td>
                  <td className="font-mono">{t.asset}</td><td>{t.tf}</td><td className="font-mono text-xs">{t.primitive}</td>
                  <td className={t.dir === 'long' ? 'text-emerald-400' : 'text-red-400'}>{t.dir}</td>
                  <td className="text-xs">{t.reason}</td>
                  <td className={`text-right font-mono ${t.netBps > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.netBps > 0 ? '+' : ''}{fmt(t.netBps, 0)}
                  </td>
                  <td className={`text-right font-mono ${t.netDollars > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.netDollars > 0 ? '+' : ''}${fmt(t.netDollars, 2)}
                  </td>
                  <td className="text-xs">{fmtDur(t.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Runner log tail */}
      <Card title="Runner log (last 50 lines)">
        <pre className="text-xs text-zinc-400 overflow-x-auto bg-zinc-900 rounded p-3 max-h-80 overflow-y-auto">
          {data.runner_log_tail.length ? data.runner_log_tail.join('\n') : 'No log yet.'}
        </pre>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold ${good === false ? 'text-red-400' : good ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-zinc-900/50 rounded-lg border border-zinc-800 overflow-hidden">
      <h2 className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-zinc-300">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EquityChart({ points, initial }: { points: { ts: number; equity: number }[]; initial: number }) {
  if (points.length < 2) {
    return <div className="text-zinc-500 text-sm">Need at least 2 closed trades.</div>;
  }
  const w = 800, h = 200, pad = 30;
  const minE = Math.min(initial, ...points.map((p) => p.equity));
  const maxE = Math.max(initial, ...points.map((p) => p.equity));
  const minT = points[0].ts;
  const maxT = points[points.length - 1].ts;
  const xRange = maxT - minT || 1;
  const yRange = (maxE - minE) || 1;
  const x = (t: number) => pad + ((t - minT) / xRange) * (w - 2 * pad);
  const y = (e: number) => h - pad - ((e - minE) / yRange) * (h - 2 * pad);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ts).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const initLine = y(initial);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <line x1={pad} y1={initLine} x2={w - pad} y2={initLine} stroke="#52525b" strokeDasharray="4 4" />
      <text x={w - pad} y={initLine - 4} fontSize="10" fill="#52525b" textAnchor="end">${initial.toFixed(0)}</text>
      <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
      <text x={pad} y={pad - 8} fontSize="10" fill="#71717a">${maxE.toFixed(0)}</text>
      <text x={pad} y={h - pad + 14} fontSize="10" fill="#71717a">${minE.toFixed(0)}</text>
    </svg>
  );
}
