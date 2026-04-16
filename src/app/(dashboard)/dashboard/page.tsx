'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Activity, AlertTriangle, CheckCircle2, XCircle,
  Clock, Zap, TrendingUp, TrendingDown, Pause, Power,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface NexusOneStatus {
  mode: string;
  strategy: { id: string; version: number; symbol: string; direction: string; status: string } | null;
  kill_switch: { triggered: boolean; reason: string | null };
  open_trade: any | null;
  performance: { total_trades: number; total_net_bps: number; win_rate: number };
  evaluation: any | null;
  strategies: { id: string; version: number; status: string }[];
}

interface TickResult {
  mode: string;
  strategy: string | null;
  kill_switch: boolean;
  signal_evaluated: boolean;
  signal_triggered: boolean;
  trade_open: boolean;
  errors: string[];
  elapsed_ms: number;
}

interface DataHealth {
  symbol: string;
  healthy: boolean;
  quality: {
    bars_count: number; bars_ok: boolean;
    funding_count: number; funding_ok: boolean;
    latest_bar_age_s: number; stale: boolean;
    price: number; price_ok: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: 'green' | 'amber' | 'red' | 'zinc' }) {
  const colors = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    zinc: 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50',
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${colors[color]}`}>{label}</span>;
}

function MetricCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className="text-zinc-600" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <div className="text-lg font-semibold text-zinc-200 font-mono">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ControlRoom() {
  const [status, setStatus] = useState<NexusOneStatus | null>(null);
  const [lastTick, setLastTick] = useState<TickResult | null>(null);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/nexusone/status'),
        fetch('/api/nexusone/data-health'),
      ]);
      if (sRes.ok) setStatus(await sRes.json());
      if (hRes.ok) setHealth(await hRes.json());
      setLastUpdate(new Date());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 15000);
    return () => clearInterval(i);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-zinc-600">
      <Activity size={20} className="animate-pulse" />
    </div>
  );

  const mode = status?.mode ?? 'offline';
  const strat = status?.strategy;
  const kill = status?.kill_switch;
  const perf = status?.performance;
  const q = health?.quality;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Shield size={20} className="text-cyan-400" />
            Control Room
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            NexusOne Trading Engine — {lastUpdate ? lastUpdate.toLocaleTimeString() : '...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'paper' && <Badge label="PAPER" color="amber" />}
          {mode === 'live_guarded' && <Badge label="LIVE" color="green" />}
          {mode === 'disabled' && <Badge label="DISABLED" color="zinc" />}
          {kill?.triggered && <Badge label="KILL SWITCH" color="red" />}
        </div>
      </div>

      {/* System Status Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Mode"
          value={mode.toUpperCase()}
          icon={mode === 'paper' ? Pause : mode === 'live_guarded' ? Power : XCircle}
        />
        <MetricCard
          label="Strategy"
          value={strat?.id?.split('_').slice(0, 2).join(' ') ?? 'None'}
          sub={strat ? `v${strat.version} • ${strat.status}` : undefined}
          icon={Zap}
        />
        <MetricCard
          label="BTC Price"
          value={q?.price ? `$${q.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '...'}
          sub={q ? (q.stale ? 'STALE' : 'live') : undefined}
          icon={TrendingUp}
        />
        <MetricCard
          label="Data Health"
          value={health?.healthy ? 'Healthy' : 'Degraded'}
          sub={q ? `${q.bars_count} bars • ${q.funding_count} funding` : undefined}
          icon={health?.healthy ? CheckCircle2 : AlertTriangle}
        />
      </div>

      {/* Performance + Open Trade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Paper Performance */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Paper Performance</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] text-zinc-600">Trades</div>
              <div className="text-lg font-mono font-semibold text-zinc-200">{perf?.total_trades ?? 0}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Net PnL</div>
              <div className={`text-lg font-mono font-semibold ${(perf?.total_net_bps ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(perf?.total_net_bps ?? 0) >= 0 ? '+' : ''}{perf?.total_net_bps ?? 0} bps
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Win Rate</div>
              <div className="text-lg font-mono font-semibold text-zinc-200">{perf?.win_rate ?? 0}%</div>
            </div>
          </div>
        </div>

        {/* Open Trade */}
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Open Trade</h2>
          {status?.open_trade ? (
            <div className="space-y-1 text-sm text-zinc-300">
              <div>Direction: <span className="font-mono">{status.open_trade.direction}</span></div>
              <div>Entry: <span className="font-mono">${status.open_trade.entry_price}</span></div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <Clock size={14} />
              <span>No open position — waiting for signal</span>
            </div>
          )}
        </div>
      </div>

      {/* Strategy Registry */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Strategy Registry</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-600 border-b border-zinc-800/40">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Version</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {(status?.strategies ?? []).map(s => (
                <tr key={s.id} className="border-b border-zinc-800/20 text-zinc-400">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{s.id}</td>
                  <td className="py-2 pr-4 font-mono text-xs">v{s.version}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      label={s.status.toUpperCase()}
                      color={s.status === 'paper' ? 'amber' : s.status === 'research' ? 'zinc' : s.status === 'rejected' ? 'red' : 'green'}
                    />
                  </td>
                  <td className="py-2">
                    {strat?.id === s.id ? <Badge label="ACTIVE" color="green" /> : <span className="text-zinc-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kill Switch + Emergency */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Risk Controls</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Kill switch: {kill?.triggered ? `ACTIVE — ${kill.reason}` : 'Off'}
            </p>
          </div>
          <button
            onClick={async () => { await fetch('/api/nexusone/emergency-stop', { method: 'POST' }); refresh(); }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all"
          >
            EMERGENCY STOP
          </button>
        </div>
      </div>
    </div>
  );
}
