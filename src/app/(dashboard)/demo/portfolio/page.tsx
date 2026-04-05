'use client';

import { useState, useEffect } from 'react';
import { fmtDollar, fmtPnl, fmtPercent } from '@/lib/utils/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, TrendingUp, Target, TrendingDown, Rocket, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface PortfolioData {
  balance: number;
  cash: number;
  openPositions: Array<{ symbol: string; side: string; quantity: number; entryPrice: number; currentPrice: number; pnl: number; pnlPct: number }>;
  stats: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; avgWin: number; avgLoss: number; sharpe: number; maxDrawdown: number; profitFactor: number; bestTrade: number; worstTrade: number; expectancy: number };
  equityCurve: Array<{ date: string; equity: number }>;
  recentTrades: Array<{ id: string; symbol: string; side: string; entryPrice: number; exitPrice?: number; pnl?: number; pnlPct?: number; strategy: string; date?: string }>;
  hasTrades: boolean;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-4 transition-colors hover:border-n-border-b">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-n-dim">{label}</p>
        <Icon size={15} className={color || 'text-accent'} />
      </div>
      <p className="mt-1.5 font-mono text-xl font-bold text-n-text" suppressHydrationWarning>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-n-dim" suppressHydrationWarning>{sub}</p>}
    </div>
  );
}

export default function DemoPortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/portfolio?env=demo');
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={24} className="animate-spin text-n-dim" />
      </div>
    );
  }

  if (!data || !data.hasTrades) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-n-text">Portfolio Demo</h1>
          <p className="text-xs text-n-dim">Paper trading — nessun rischio reale</p>
        </div>

        {/* Show Alpaca balance even without trades */}
        {data && data.balance > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Bilancio Alpaca" value={fmtDollar(data.balance)} sub="Paper account" icon={Wallet} />
            <StatCard label="Cash Disponibile" value={fmtDollar(data.cash)} icon={Wallet} />
            <StatCard label="Posizioni Aperte" value={String(data.openPositions.length)} icon={TrendingUp} />
          </div>
        )}

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-16">
          <Rocket size={32} className="text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun trade eseguito</p>
          <p className="mt-1 text-xs text-n-dim">Avvia il bot dalla pagina Strategy per iniziare a generare trade.</p>
          <Link href="/strategy" className="mt-4 rounded-lg bg-n-accent-dim px-4 py-2 text-xs font-semibold text-accent hover:bg-n-accent/20 transition-colors">
            Vai a Strategy
          </Link>
        </div>
      </div>
    );
  }

  const { stats, equityCurve, recentTrades, openPositions, balance } = data;

  return (
    <div className="space-y-5 stagger">
      <div>
        <h1 className="text-xl font-bold text-n-text">Portfolio Demo</h1>
        <p className="text-xs text-n-dim">Paper trading — dati reali da Alpaca + bot engine</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bilancio" value={fmtDollar(balance)} sub={`${openPositions.length} posizioni aperte`} icon={Wallet} />
        <StatCard label="P&L Totale" value={fmtPnl(stats.totalPnl)} sub={`${stats.totalTrades} trades`} icon={TrendingUp} color={stats.totalPnl >= 0 ? 'text-n-green' : 'text-n-red'} />
        <StatCard label="Win Rate" value={fmtPercent(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L`} icon={Target} />
        <StatCard label="Max Drawdown" value={fmtPercent(stats.maxDrawdown)} sub={`Sharpe ${stats.sharpe.toFixed(2)}`} icon={TrendingDown} color="text-n-red" />
      </div>

      {/* Equity Curve */}
      {equityCurve.length > 1 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Equity Curve (trade reali)</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="eqGradDemo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'P&L Cumulativo']} />
                <Area type="monotone" dataKey="equity" stroke={stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#eqGradDemo)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Performance + Details */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Performance</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Profit Factor', value: stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2) },
              { label: 'Sharpe Ratio', value: stats.sharpe.toFixed(2) },
              { label: 'Expectancy', value: fmtDollar(stats.expectancy) },
              { label: 'Avg Win', value: fmtDollar(stats.avgWin), color: 'text-n-green' },
              { label: 'Avg Loss', value: fmtDollar(stats.avgLoss), color: 'text-n-red' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[12px]">
                <span className="text-n-dim">{row.label}</span>
                <span className={`font-mono font-semibold ${row.color || 'text-n-text'}`} suppressHydrationWarning>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Dettaglio</h3>
          <div className="space-y-2.5">
            {[
              { label: 'Best Trade', value: fmtPnl(stats.bestTrade), color: 'text-n-green' },
              { label: 'Worst Trade', value: fmtPnl(stats.worstTrade), color: 'text-n-red' },
              { label: 'Max Drawdown', value: fmtPercent(stats.maxDrawdown), color: 'text-n-red' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[12px]">
                <span className="text-n-dim">{row.label}</span>
                <span className={`font-mono font-semibold ${row.color}`} suppressHydrationWarning>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Open positions */}
      {openPositions.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Posizioni Aperte (Alpaca)</h3>
          <div className="space-y-1.5">
            {openPositions.map((p) => (
              <div key={p.symbol} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.side === 'LONG' ? 'bg-green-500/15 text-n-green' : 'bg-red-500/15 text-n-red'}`}>{p.side}</span>
                  <div>
                    <p className="font-mono text-xs font-semibold text-n-text">{p.symbol}</p>
                    <p className="text-[10px] text-n-dim" suppressHydrationWarning>Entry {fmtDollar(p.entryPrice)} · Now {fmtDollar(p.currentPrice)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-xs font-semibold ${p.pnl >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(p.pnl)}</p>
                  <p className={`font-mono text-[10px] ${p.pnlPct >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent trades */}
      {recentTrades.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Ultimi Trade Chiusi</h3>
          <div className="space-y-1.5">
            {recentTrades.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === 'LONG' ? 'bg-green-500/15 text-n-green' : 'bg-red-500/15 text-n-red'}`}>{t.side}</span>
                  <div>
                    <p className="font-mono text-xs font-semibold text-n-text">{t.symbol}</p>
                    <p className="text-[10px] text-n-dim">{t.strategy} — {t.date ? new Date(t.date).toLocaleDateString('en-US') : ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-xs font-semibold ${(t.pnl ?? 0) >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(t.pnl ?? 0)}</p>
                  <p className={`font-mono text-[10px] ${(t.pnlPct ?? 0) >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{(t.pnlPct ?? 0) >= 0 ? '+' : ''}{(t.pnlPct ?? 0).toFixed(2)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
