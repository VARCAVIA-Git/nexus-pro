'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { fmtDollar, fmtPnl, fmtPercent, fmtPctChange, fmtPrice } from '@/lib/utils/format';
import type { PriceData } from '@/app/api/prices/route';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, TrendingUp, Zap, ChevronRight, RefreshCw, Bot, Target,
} from 'lucide-react';

interface BotStatusData {
  running: boolean;
  tickCount: number;
  positions: any[];
  closedTrades: any[];
  accountEquity: number;
  totalPnl: number;
}

interface PerformanceData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  rollingWinRate: number;
  totalPnl: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  sharpeRatio: number;
  equityCurve: { date: string; equity: number }[];
}

interface PortfolioSummary {
  balance: number;
  openPositions: any[];
  hasTrades: boolean;
  stats: { totalTrades: number; winRate: number; totalPnl: number };
}

export default function DashboardPage() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');
  const [botStatus, setBotStatus] = useState<BotStatusData | null>(null);
  const [perf, setPerf] = useState<PerformanceData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);

  const fetchAll = async () => {
    const [pricesRes, botRes, perfRes, portRes] = await Promise.allSettled([
      fetch('/api/prices'),
      fetch('/api/bot/status'),
      fetch('/api/performance'),
      fetch('/api/portfolio?env=demo'),
    ]);
    if (pricesRes.status === 'fulfilled' && pricesRes.value.ok) setPrices((await pricesRes.value.json()).prices);
    if (botRes.status === 'fulfilled' && botRes.value.ok) setBotStatus(await botRes.value.json());
    if (perfRes.status === 'fulfilled' && perfRes.value.ok) setPerf(await perfRes.value.json());
    if (portRes.status === 'fulfilled' && portRes.value.ok) setPortfolio(await portRes.value.json());
    setLastUpdate(new Date().toLocaleTimeString('en-US'));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const accountBalance = portfolio?.balance ?? 0;
  const totalPnl = perf?.totalPnl ?? 0;
  const totalTrades = perf?.totalTrades ?? 0;
  const winRate = perf?.winRate ?? 0;
  const openPositions = portfolio?.openPositions?.length ?? 0;
  const cryptoPrices = prices.filter((p) => p.type === 'crypto');
  const stockPrices = prices.filter((p) => p.type === 'stock');

  return (
    <div className="space-y-5 stagger">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Dashboard</h1>
          <p className="text-xs text-n-dim">Overview generale — dati live</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && <span className="font-mono text-[10px] text-n-dim" suppressHydrationWarning>{lastUpdate}</span>}
          <button onClick={fetchAll} className="flex items-center gap-1 rounded-lg border border-n-border px-2 py-1 text-[10px] text-n-dim hover:text-n-text transition-colors">
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Live
          </button>
        </div>
      </div>

      {/* Bot status banner */}
      {botStatus?.running && (
        <div className="flex items-center justify-between rounded-xl border-2 border-green-500/30 bg-green-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse-dot" />
            <div>
              <p className="text-xs font-bold text-green-400">Bot Attivo — Tick #{botStatus.tickCount}</p>
              <p className="text-[10px] text-n-dim" suppressHydrationWarning>{botStatus.positions.length} posizioni | {botStatus.closedTrades.length} trades | Equity: {fmtDollar(botStatus.accountEquity)}</p>
            </div>
          </div>
          <Link href="/strategy" className="flex items-center gap-1 rounded-lg border border-green-500/30 px-3 py-1.5 text-[10px] font-semibold text-green-400 hover:bg-green-500/10 transition-colors">
            <Bot size={12} /> Gestisci
          </Link>
        </div>
      )}

      {/* Stats from real data */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-medium text-n-dim">Bilancio Alpaca</p><Wallet size={15} className="text-n-text-s" /></div>
          <p className="mt-1.5 font-mono text-xl font-bold text-n-text" suppressHydrationWarning>{accountBalance > 0 ? fmtDollar(accountBalance) : '—'}</p>
          <p className="mt-0.5 font-mono text-[11px] text-n-dim" suppressHydrationWarning>{openPositions} posizioni aperte</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-medium text-n-dim">P&L Bot</p><TrendingUp size={15} className={totalPnl >= 0 ? 'text-green-400' : 'text-red-400'} /></div>
          <p className={`mt-1.5 font-mono text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} suppressHydrationWarning>{totalTrades > 0 ? fmtPnl(totalPnl) : '$0.00'}</p>
          <p className="mt-0.5 font-mono text-[11px] text-n-dim" suppressHydrationWarning>{totalTrades} trade eseguiti</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-medium text-n-dim">Win Rate</p><Target size={15} className="text-n-text-s" /></div>
          <p className="mt-1.5 font-mono text-xl font-bold text-n-text" suppressHydrationWarning>{totalTrades > 0 ? fmtPercent(winRate) : '—'}</p>
          <p className="mt-0.5 font-mono text-[11px] text-n-dim" suppressHydrationWarning>{perf ? `${perf.wins}W / ${perf.losses}L` : ''}</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-medium text-n-dim">Sharpe Ratio</p><Zap size={15} className="text-n-text-s" /></div>
          <p className="mt-1.5 font-mono text-xl font-bold text-n-text" suppressHydrationWarning>{totalTrades > 0 ? (perf?.sharpeRatio ?? 0).toFixed(2) : '—'}</p>
          <p className="mt-0.5 font-mono text-[11px] text-n-dim">Rolling 30 giorni</p>
        </div>
      </div>

      {/* Portfolio links */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Link href="/demo/portfolio" className="rounded-xl border border-amber-500/20 bg-[#1a1208]/50 p-5 transition-colors hover:border-amber-500/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse-dot" />
              <h3 className="text-sm font-bold text-n-text">DEMO Portfolio</h3>
            </div>
            <ChevronRight size={14} className="text-n-dim" />
          </div>
          <p className="mt-2 text-[11px] text-n-dim">Paper trading — visualizza equity, trade e performance</p>
        </Link>
        <Link href="/real/portfolio" className="rounded-xl border border-blue-500/20 bg-[#080e1a]/50 p-5 transition-colors hover:border-blue-500/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse-dot" />
              <h3 className="text-sm font-bold text-n-text">REAL Portfolio</h3>
            </div>
            <ChevronRight size={14} className="text-n-dim" />
          </div>
          <p className="mt-2 text-[11px] text-n-dim">Live trading — fondi reali su Alpaca</p>
        </Link>
      </div>

      {/* Real equity curve from bot trades */}
      {perf && perf.equityCurve.length > 1 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-n-dim">Equity Curve (trade reali)</h3>
            <div className="flex gap-2">
              {[
                { label: 'Oggi', value: perf.dailyPnl },
                { label: '7g', value: perf.weeklyPnl },
                { label: '30g', value: perf.monthlyPnl },
              ].map((p) => (
                <span key={p.label} className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${p.value >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`} suppressHydrationWarning>
                  {p.label}: {fmtPnl(p.value)}
                </span>
              ))}
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perf.equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs><linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={perf.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} /><stop offset="100%" stopColor={perf.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'P&L']} />
                <Area type="monotone" dataKey="equity" stroke={perf.totalPnl >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#perfGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Live prices */}
      {prices.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-n-dim">Prezzi Live</h3>
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-dot" />
            </div>
            <span className="text-[9px] text-n-dim">CoinGecko · Twelve Data</span>
          </div>
          {cryptoPrices.length > 0 && (
            <div className="mb-2">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-n-dim">Crypto</p>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                {cryptoPrices.map((p) => (
                  <div key={p.symbol} className="rounded-lg bg-n-bg/50 px-3 py-2">
                    <p className="font-mono text-[10px] font-bold text-n-text">{p.symbol.replace('/USD', '')}</p>
                    <p className="font-mono text-xs font-semibold text-n-text" suppressHydrationWarning>{fmtPrice(p.price)}</p>
                    <p className={`font-mono text-[10px] ${p.changePct24h >= 0 ? 'text-green-400' : 'text-red-400'}`} suppressHydrationWarning>{fmtPctChange(p.changePct24h)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stockPrices.length > 0 && (
            <div>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-n-dim">Azioni</p>
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                {stockPrices.map((p) => (
                  <div key={p.symbol} className="rounded-lg bg-n-bg/50 px-3 py-2">
                    <p className="font-mono text-[10px] font-bold text-n-text">{p.symbol}</p>
                    <p className="font-mono text-xs font-semibold text-n-text" suppressHydrationWarning>{fmtDollar(p.price)}</p>
                    <p className={`font-mono text-[10px] ${p.changePct24h >= 0 ? 'text-green-400' : 'text-red-400'}`} suppressHydrationWarning>{fmtPctChange(p.changePct24h)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
