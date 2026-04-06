'use client';

import { useState, useEffect } from 'react';
import { useModeStore } from '@/stores/mode-store';
import { fmtDollar, fmtPnl, fmtPercent } from '@/lib/utils/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, TrendingUp, Target, TrendingDown, AlertTriangle, Rocket, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface PortfolioData {
  balance: number; cash: number;
  openPositions: Array<{ symbol: string; side: string; quantity: number; entryPrice: number; currentPrice: number; pnl: number; pnlPct: number }>;
  stats: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; avgWin: number; avgLoss: number; sharpe: number; maxDrawdown: number; profitFactor: number; bestTrade: number; worstTrade: number; expectancy: number };
  equityCurve: Array<{ date: string; equity: number }>;
  recentTrades: Array<{ id: string; symbol: string; side: string; entryPrice: number; exitPrice?: number; pnl?: number; pnlPct?: number; strategy: string; date?: string }>;
  hasTrades: boolean;
}

export default function PortfolioPage() {
  const mode = useModeStore((s) => s.mode);
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portfolio?env=${mode}`).then(r => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [mode]);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  const isReal = mode === 'real';
  const accent = isReal ? '#3b82f6' : '#f59e0b';

  return (
    <div className="space-y-6 stagger">
      {isReal && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">Capitale reale — procedi con cautela</p>
        </div>
      )}

      <h1 className="text-n-text">Portfolio</h1>

      {data && data.balance > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Bilancio', value: fmtDollar(data.balance), sub: `${data.openPositions.length} posizioni`, icon: Wallet },
            { label: 'P&L Totale', value: data.hasTrades ? fmtPnl(data.stats.totalPnl) : '$0.00', sub: data.hasTrades ? `${data.stats.totalTrades} trades` : '', icon: TrendingUp, color: data.stats.totalPnl >= 0 ? 'text-n-green' : 'text-n-red' },
            { label: 'Win Rate', value: data.hasTrades ? fmtPercent(data.stats.winRate) : '—', sub: data.hasTrades ? `${data.stats.wins}W / ${data.stats.losses}L` : '', icon: Target },
            { label: 'Max Drawdown', value: data.hasTrades ? fmtPercent(data.stats.maxDrawdown) : '—', icon: TrendingDown, color: 'text-n-red' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-n-border bg-n-card p-5">
              <div className="flex items-center justify-between"><p className="label">{s.label}</p><s.icon size={16} className={s.color || 'text-n-dim'} /></div>
              <p className="mt-2 font-mono text-2xl font-medium text-n-text" suppressHydrationWarning>{s.value}</p>
              {s.sub && <p className="mt-1 text-xs text-n-dim" suppressHydrationWarning>{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {!data?.hasTrades ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-16">
          <Rocket size={32} className="text-n-dim mb-4" />
          <p className="text-base font-medium text-n-text-s">Nessun trade eseguito</p>
          <p className="mt-1 text-sm text-n-dim">Avvia il bot dalla pagina Strategy.</p>
          <Link href="/strategy" className="mt-5 rounded-xl bg-n-accent-dim px-6 py-3 text-sm font-medium text-accent min-h-[44px]">Vai a Strategy</Link>
        </div>
      ) : (
        <>
          {data!.equityCurve.length > 1 && (
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="mb-4 label">Equity Curve</h3>
              <div className="h-[200px] md:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data!.equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs><linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={0.2} /><stop offset="100%" stopColor={accent} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, fontFamily: 'Roboto Mono' }} />
                    <Area type="monotone" dataKey="equity" stroke={accent} strokeWidth={2} fill="url(#eqG)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="mb-3 label">Performance</h3>
              <div className="space-y-3">
                {[
                  { l: 'Profit Factor', v: data!.stats.profitFactor >= 999 ? '∞' : data!.stats.profitFactor.toFixed(2) },
                  { l: 'Sharpe', v: data!.stats.sharpe.toFixed(2) },
                  { l: 'Expectancy', v: fmtDollar(data!.stats.expectancy) },
                  { l: 'Avg Win', v: fmtDollar(data!.stats.avgWin), c: 'text-n-green' },
                  { l: 'Avg Loss', v: fmtDollar(data!.stats.avgLoss), c: 'text-n-red' },
                ].map(r => (
                  <div key={r.l} className="flex items-center justify-between text-sm">
                    <span className="text-n-dim">{r.l}</span>
                    <span className={`font-mono font-medium ${r.c || 'text-n-text'}`} suppressHydrationWarning>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="mb-3 label">Dettaglio</h3>
              <div className="space-y-3">
                {[
                  { l: 'Best Trade', v: fmtPnl(data!.stats.bestTrade), c: 'text-n-green' },
                  { l: 'Worst Trade', v: fmtPnl(data!.stats.worstTrade), c: 'text-n-red' },
                  { l: 'Max Drawdown', v: fmtPercent(data!.stats.maxDrawdown), c: 'text-n-red' },
                ].map(r => (
                  <div key={r.l} className="flex items-center justify-between text-sm">
                    <span className="text-n-dim">{r.l}</span>
                    <span className={`font-mono font-medium ${r.c}`} suppressHydrationWarning>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {data && data.openPositions.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="mb-3 label">Posizioni Aperte</h3>
          <div className="space-y-2">
            {data.openPositions.map(p => (
              <div key={p.symbol} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${p.side === 'LONG' ? 'bg-green-500/10 text-n-green' : 'bg-red-500/10 text-n-red'}`}>{p.side}</span>
                  <span className="font-mono text-sm font-medium text-n-text">{p.symbol}</span>
                </div>
                <span className={`font-mono text-sm font-medium ${p.pnl >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(p.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.recentTrades.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="mb-3 label">Ultimi Trade</h3>
          <div className="space-y-2">
            {data.recentTrades.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${t.side === 'LONG' ? 'bg-green-500/10 text-n-green' : 'bg-red-500/10 text-n-red'}`}>{t.side}</span>
                  <div>
                    <p className="font-mono text-sm font-medium text-n-text">{t.symbol}</p>
                    <p className="text-xs text-n-dim">{t.strategy}</p>
                  </div>
                </div>
                <span className={`font-mono text-sm font-medium ${(t.pnl ?? 0) >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(t.pnl ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
