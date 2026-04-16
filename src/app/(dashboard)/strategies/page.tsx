'use client';

import { useState, useEffect } from 'react';
import { FlaskConical, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface Strategy {
  id: string;
  version: number;
  status: string;
}

interface BacktestResult {
  mode: string;
  strategy: string;
  metrics: {
    total_trades: number;
    win_rate: number;
    net_pnl_bps: number;
    sharpe_ratio: number;
    profit_factor: number;
    t_stat: number;
    max_drawdown_bps: number;
    avg_trade_bps: number;
    expectancy_bps: number;
  };
  cost_model: { maker_fee_bps: number; taker_fee_bps: number; slippage_bps: number; spread_bps: number };
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'paper': return <Clock size={14} className="text-amber-400" />;
    case 'research': return <FlaskConical size={14} className="text-cyan-400" />;
    case 'rejected': return <XCircle size={14} className="text-red-400" />;
    case 'live_candidate': return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'live': return <CheckCircle2 size={14} className="text-emerald-400" />;
    default: return <AlertTriangle size={14} className="text-zinc-500" />;
  }
}

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
    zinc: 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50',
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${colors[color] ?? colors.zinc}`}>{label}</span>;
}

function statusColor(s: string): string {
  return s === 'paper' ? 'amber' : s === 'research' ? 'cyan' : s === 'rejected' ? 'red' : s === 'live' ? 'green' : 'zinc';
}

export default function StrategyLab() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);

  useEffect(() => {
    fetch('/api/nexusone/status').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.strategies) setStrategies(d.strategies); });
  }, []);

  const runBacktest = async () => {
    setBtLoading(true);
    try {
      const res = await fetch('/api/nexusone/backtest?mode=full&days=30');
      if (res.ok) setBacktest(await res.json());
    } finally { setBtLoading(false); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <FlaskConical size={20} className="text-cyan-400" />
          Strategy Lab
        </h1>
        <p className="text-xs text-zinc-600 mt-0.5">Research, validation and registry</p>
      </div>

      {/* Registry */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Strategy Registry</h2>
        <div className="space-y-2">
          {strategies.map(s => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-zinc-800/40 bg-zinc-900/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <StatusIcon status={s.status} />
                <div>
                  <div className="text-sm font-mono text-zinc-300">{s.id}</div>
                  <div className="text-[10px] text-zinc-600">v{s.version}</div>
                </div>
              </div>
              <Badge label={s.status.toUpperCase()} color={statusColor(s.status)} />
            </div>
          ))}
        </div>
      </div>

      {/* Research: S1-S4 rejected, S5 active */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Research History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-600 border-b border-zinc-800/40">
                <th className="pb-2 pr-3">Strategy</th>
                <th className="pb-2 pr-3">Family</th>
                <th className="pb-2 pr-3">Trades</th>
                <th className="pb-2 pr-3">Net bps</th>
                <th className="pb-2 pr-3">Win%</th>
                <th className="pb-2 pr-3">Sharpe</th>
                <th className="pb-2">Verdict</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/20"><td className="py-1.5 pr-3 font-mono">S1</td><td className="pr-3">Funding</td><td className="pr-3">1</td><td className="pr-3">+12</td><td className="pr-3">100%</td><td className="pr-3">0</td><td><Badge label="REJECTED" color="red" /></td></tr>
              <tr className="border-b border-zinc-800/20"><td className="py-1.5 pr-3 font-mono">S2</td><td className="pr-3">Momentum</td><td className="pr-3">101</td><td className="pr-3 text-red-400">-1872</td><td className="pr-3">31%</td><td className="pr-3">-11</td><td><Badge label="REJECTED" color="red" /></td></tr>
              <tr className="border-b border-zinc-800/20"><td className="py-1.5 pr-3 font-mono">S3</td><td className="pr-3">Mean Rev</td><td className="pr-3">597</td><td className="pr-3 text-red-400">-7245</td><td className="pr-3">38%</td><td className="pr-3">-10</td><td><Badge label="REJECTED" color="red" /></td></tr>
              <tr className="border-b border-zinc-800/20"><td className="py-1.5 pr-3 font-mono">S4</td><td className="pr-3">Vol Comp</td><td className="pr-3">0</td><td className="pr-3">0</td><td className="pr-3">-</td><td className="pr-3">0</td><td><Badge label="REJECTED" color="red" /></td></tr>
              <tr><td className="py-1.5 pr-3 font-mono text-cyan-400">S5</td><td className="pr-3">RSI Bidir</td><td className="pr-3">221</td><td className="pr-3 text-emerald-400">+1339</td><td className="pr-3">57%</td><td className="pr-3">2.16</td><td><Badge label="PAPER" color="amber" /></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Run Backtest */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Live Backtest</h2>
          <button onClick={runBacktest} disabled={btLoading}
            className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all disabled:opacity-50">
            {btLoading ? 'Running...' : 'Run 30-day backtest'}
          </button>
        </div>
        {backtest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><span className="text-zinc-600">Trades</span><div className="font-mono text-zinc-300">{backtest.metrics.total_trades}</div></div>
            <div><span className="text-zinc-600">Net PnL</span><div className={`font-mono ${backtest.metrics.net_pnl_bps >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{backtest.metrics.net_pnl_bps} bps</div></div>
            <div><span className="text-zinc-600">Win Rate</span><div className="font-mono text-zinc-300">{backtest.metrics.win_rate}%</div></div>
            <div><span className="text-zinc-600">Sharpe</span><div className="font-mono text-zinc-300">{backtest.metrics.sharpe_ratio}</div></div>
            <div><span className="text-zinc-600">Profit Factor</span><div className="font-mono text-zinc-300">{backtest.metrics.profit_factor}</div></div>
            <div><span className="text-zinc-600">T-stat</span><div className="font-mono text-zinc-300">{backtest.metrics.t_stat}</div></div>
            <div><span className="text-zinc-600">Max DD</span><div className="font-mono text-zinc-300">{backtest.metrics.max_drawdown_bps} bps</div></div>
            <div><span className="text-zinc-600">Expectancy</span><div className="font-mono text-zinc-300">{backtest.metrics.expectancy_bps} bps/trade</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
