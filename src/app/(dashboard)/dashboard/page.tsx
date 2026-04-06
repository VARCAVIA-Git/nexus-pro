'use client';

import { useState, useEffect } from 'react';
import { useModeStore } from '@/stores/mode-store';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, TrendingUp, Bot, Target, RefreshCw, Calendar, Zap,
} from 'lucide-react';

interface BotStatusData { running: boolean; tickCount: number; positions: any[]; closedTrades: any[]; accountEquity: number; totalPnl: number; bots?: any[] }
interface PerfData { totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; dailyPnl: number; weeklyPnl: number; monthlyPnl: number; sharpeRatio: number; equityCurve: { date: string; equity: number }[] }

export default function DashboardPage() {
  const mode = useModeStore((s) => s.mode);
  const [bot, setBot] = useState<BotStatusData | null>(null);
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [brokerConnected, setBrokerConnected] = useState(true);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [bRes, pRes, portRes, trRes] = await Promise.allSettled([
      fetch('/api/bot/status'),
      fetch('/api/performance'),
      fetch(`/api/portfolio?env=${mode}`),
      fetch('/api/trades?env=demo&limit=5'),
    ]);
    if (bRes.status === 'fulfilled' && bRes.value.ok) setBot(await bRes.value.json());
    if (pRes.status === 'fulfilled' && pRes.value.ok) setPerf(await pRes.value.json());
    if (portRes.status === 'fulfilled' && portRes.value.ok) {
      const d = await portRes.value.json();
      setBalance(d.balance ?? 0);
      setBrokerConnected(d.connected !== false);
    }
    if (trRes.status === 'fulfilled' && trRes.value.ok) {
      const d = await trRes.value.json();
      setRecentTrades(d.trades ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [mode]);

  const equity = brokerConnected ? balance : 0;
  const totalPnl = perf?.totalPnl ?? 0;
  const dailyPnl = perf?.dailyPnl ?? 0;
  const activeBots = bot?.bots?.filter(b => b.status === 'running').length ?? 0;
  const accent = mode === 'real' ? '#3b82f6' : '#f59e0b';

  return (
    <div className="space-y-6 stagger">
      {mode === 'demo' && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-2.5 text-center text-xs text-amber-400">
          Stai usando il simulatore — i dati non sono reali
        </div>
      )}

      {mode === 'real' && !brokerConnected && !loading && (
        <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 text-sm text-blue-300">
          Conto live non collegato. <Link href="/connections" className="underline font-medium">Configura le API keys live →</Link>
        </div>
      )}

      {/* Bot banner */}
      {bot?.running && (
        <div className="flex items-center justify-between rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-n-green animate-pulse-dot" />
            <div>
              <p className="text-sm font-medium text-n-green">{activeBots} bot attiv{activeBots === 1 ? 'o' : 'i'}</p>
              <p className="text-xs text-n-dim" suppressHydrationWarning>Tick #{bot.tickCount} · {bot.positions.length} posizioni · {bot.closedTrades.length} trades</p>
            </div>
          </div>
          <Link href="/strategy" className="rounded-xl border border-green-500/20 px-3 py-2 text-xs font-medium text-n-green hover:bg-green-500/10 min-h-[40px] flex items-center gap-1.5"><Bot size={13} /> Gestisci</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Bilancio', value: equity > 0 ? fmtDollar(equity) : '—', icon: Wallet },
          { label: 'P&L Oggi', value: dailyPnl !== 0 ? fmtPnl(dailyPnl) : '$0.00', icon: TrendingUp, color: dailyPnl >= 0 ? 'text-n-green' : 'text-n-red' },
          { label: 'P&L Totale', value: totalPnl !== 0 ? fmtPnl(totalPnl) : '$0.00', icon: TrendingUp, color: totalPnl >= 0 ? 'text-n-green' : 'text-n-red' },
          { label: 'Bot Attivi', value: String(activeBots), icon: Bot },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-n-border bg-n-card p-5">
            <div className="flex items-center justify-between"><p className="label">{s.label}</p><s.icon size={16} className={s.color || 'text-n-dim'} /></div>
            <p className={`mt-2 font-mono text-2xl font-medium ${s.color || 'text-n-text'}`} suppressHydrationWarning>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      {perf && perf.equityCurve.length > 1 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="label">Equity Curve</h3>
            <div className="flex gap-1.5 flex-wrap">
              {[{ l: 'Oggi', v: perf.dailyPnl }, { l: '7g', v: perf.weeklyPnl }, { l: '30g', v: perf.monthlyPnl }].map(p => (
                <span key={p.l} className={`rounded-lg px-2 py-1 font-mono text-[11px] font-medium ${p.v >= 0 ? 'bg-green-500/10 text-n-green' : 'bg-red-500/10 text-n-red'}`} suppressHydrationWarning>{p.l}: {fmtPnl(p.v)}</span>
              ))}
            </div>
          </div>
          <div className="h-[200px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perf.equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs><linearGradient id="dashG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={0.2} /><stop offset="100%" stopColor={accent} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, fontFamily: 'Roboto Mono' }} />
                <Area type="monotone" dataKey="equity" stroke={accent} strokeWidth={2} fill="url(#dashG)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bot signal summary — only show if bots exist */}
      {bot?.bots && bot.bots.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="label mb-3">Bot attivi — ultimo check</h3>
          <div className="space-y-1.5">
            {bot.bots.filter((b: any) => b.status === 'running').map((b: any) => (
              <div key={b.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-n-green animate-pulse-dot" />
                  <span className="font-medium text-n-text">{b.name}</span>
                  <span className="text-n-dim">{b.assets?.join(', ')}</span>
                </div>
                <span className="font-mono text-n-dim" suppressHydrationWarning>
                  {b.stats?.totalTrades ?? 0} trades · {b.stats?.pnl >= 0 ? '+' : ''}{(b.stats?.pnl ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent trades */}
      {recentTrades.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="label mb-3">Ultime operazioni</h3>
          <div className="space-y-1.5">
            {recentTrades.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${t.side === 'LONG' ? 'bg-green-500/10 text-n-green' : 'bg-red-500/10 text-n-red'}`}>{t.side}</span>
                  <span className="font-mono text-n-text">{t.symbol}</span>
                </div>
                <span className={`font-mono font-medium ${(t.netPnl ?? 0) >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>
                  {(t.netPnl ?? 0) >= 0 ? '+' : ''}{(t.netPnl ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!bot?.running && (!bot?.bots || bot.bots.length === 0) && !loading && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-6 text-center">
          <p className="text-sm text-n-dim">Crea il tuo primo bot → <Link href="/strategy" className="text-accent hover:underline">Strategy</Link></p>
        </div>
      )}
    </div>
  );
}
