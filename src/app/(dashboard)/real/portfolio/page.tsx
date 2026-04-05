'use client';

import { useState, useEffect } from 'react';
import { fmtDollar, fmtPnl, fmtPercent } from '@/lib/utils/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Wallet, TrendingUp, Target, TrendingDown, AlertTriangle, Rocket, RefreshCw,
  Shield, ExternalLink, Settings, CheckCircle, XCircle, DollarSign, Key, Clock,
} from 'lucide-react';
import Link from 'next/link';

interface PortfolioData {
  balance: number; cash: number; buyingPower?: number;
  openPositions: Array<{ symbol: string; side: string; quantity: number; entryPrice: number; currentPrice: number; pnl: number; pnlPct: number }>;
  stats: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; avgWin: number; avgLoss: number; sharpe: number; maxDrawdown: number; profitFactor: number; bestTrade: number; worstTrade: number; expectancy: number };
  equityCurve: Array<{ date: string; equity: number }>;
  recentTrades: Array<{ id: string; symbol: string; side: string; entryPrice: number; exitPrice?: number; pnl?: number; pnlPct?: number; strategy: string; date?: string }>;
  hasTrades: boolean;
}

interface BrokerStatus {
  paper: { connected: boolean; equity?: number };
  live: { connected: boolean; equity?: number; cash?: number; buyingPower?: number; status?: string; error?: string };
  liveConfigured: boolean;
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
      <p className="mt-1.5 font-mono text-lg font-bold text-n-text sm:text-xl" suppressHydrationWarning>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-n-dim" suppressHydrationWarning>{sub}</p>}
    </div>
  );
}

export default function RealPortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [portRes, brokerRes] = await Promise.allSettled([
        fetch('/api/portfolio?env=real'),
        fetch('/api/broker/status'),
      ]);
      if (portRes.status === 'fulfilled' && portRes.value.ok) setData(await portRes.value.json());
      if (brokerRes.status === 'fulfilled' && brokerRes.value.ok) setBroker(await brokerRes.value.json());
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  const liveConnected = broker?.live.connected ?? false;
  const liveConfigured = broker?.liveConfigured ?? false;

  return (
    <div className="space-y-5 stagger">
      {/* WARNING BANNER */}
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <AlertTriangle size={18} className="text-blue-400 shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-300">Stai operando con capitale reale</p>
          <p className="text-[11px] text-blue-400/70">Tutte le operazioni in questa sezione coinvolgono fondi reali. Procedi con cautela.</p>
        </div>
      </div>

      {/* ═══ GESTIONE FONDI ═══ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Card: Gestione Conto */}
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign size={15} className="text-n-text-s" />
            <h3 className="text-sm font-bold text-n-text">Gestione Conto</h3>
          </div>

          {!liveConfigured ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-n-bg/60 p-2.5">
                <XCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-[11px] font-semibold text-red-400">Conto live non collegato</span>
              </div>
              <p className="text-[11px] text-n-dim">Per operare con fondi reali, completa questi passaggi:</p>
              <div className="space-y-2">
                {[
                  { step: 1, text: 'Apri conto Individual su Alpaca', link: 'https://app.alpaca.markets/brokerage/new-account' },
                  { step: 2, text: 'Completa la verifica identità (1-3 giorni)', link: null },
                  { step: 3, text: 'Deposita fondi tramite ACH transfer', link: null },
                  { step: 4, text: 'Genera API keys live e inseriscile nelle Impostazioni', link: null },
                ].map((s) => (
                  <div key={s.step} className="flex items-start gap-3 rounded-lg bg-n-bg/40 px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-400">{s.step}</span>
                    <div className="flex-1">
                      <p className="text-[11px] text-n-text">{s.text}</p>
                      {s.link && (
                        <a href={s.link} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-[10px] text-blue-400 hover:underline">
                          Apri <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/impostazioni" className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 py-2.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors">
                <Settings size={14} /> Vai alle Impostazioni
              </Link>
            </div>
          ) : liveConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-2.5">
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                <span className="text-[11px] font-semibold text-green-400">Conto live connesso — {broker?.live.status ?? 'ACTIVE'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-n-bg/60 p-3 text-center">
                  <p className="text-[9px] text-n-dim">Balance</p>
                  <p className="font-mono text-sm font-bold text-n-text" suppressHydrationWarning>{fmtDollar(broker!.live.equity ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-n-bg/60 p-3 text-center">
                  <p className="text-[9px] text-n-dim">Cash</p>
                  <p className="font-mono text-sm font-bold text-n-text" suppressHydrationWarning>{fmtDollar(broker!.live.cash ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-n-bg/60 p-3 text-center">
                  <p className="text-[9px] text-n-dim">Buying Power</p>
                  <p className="font-mono text-sm font-bold text-n-text" suppressHydrationWarning>{fmtDollar(broker!.live.buyingPower ?? 0)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <a href="https://app.alpaca.markets/banking/transfers" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors">
                  <DollarSign size={13} /> Deposita
                </a>
                <a href="https://app.alpaca.markets/banking/transfers" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-n-border py-2 text-xs font-semibold text-n-dim hover:text-n-text transition-colors">
                  Preleva <ExternalLink size={11} />
                </a>
                <a href="https://app.alpaca.markets/banking/transfers" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-n-border py-2 text-xs font-semibold text-n-dim hover:text-n-text transition-colors">
                  Gestisci Fondi <ExternalLink size={11} />
                </a>
              </div>

              <p className="text-[9px] text-n-dim">Depositi e prelievi si gestiscono dalla dashboard Alpaca per sicurezza.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2.5">
                <XCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-[11px] font-semibold text-red-400">Errore connessione: {broker?.live.error ?? 'sconosciuto'}</span>
              </div>
              <Link href="/impostazioni" className="flex w-full items-center justify-center gap-2 rounded-lg border border-n-border py-2.5 text-xs font-semibold text-n-dim hover:text-n-text transition-colors">
                <Key size={13} /> Verifica API Keys
              </Link>
            </div>
          )}
        </div>

        {/* Card: Sicurezza */}
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield size={15} className="text-n-text-s" />
            <h3 className="text-sm font-bold text-n-text">Sicurezza</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-n-bg/60 px-3 py-2.5">
              <span className="text-[11px] text-n-dim">Connessione</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${liveConnected ? 'bg-green-400' : liveConfigured ? 'bg-red-400' : 'bg-n-dim'}`} />
                <span className={`font-mono text-[11px] font-semibold ${liveConnected ? 'text-green-400' : liveConfigured ? 'text-red-400' : 'text-n-dim'}`}>
                  {liveConnected ? 'Connesso' : liveConfigured ? 'Errore' : 'Non configurato'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-n-bg/60 px-3 py-2.5">
              <span className="text-[11px] text-n-dim">Tipo Account</span>
              <span className="font-mono text-[11px] font-semibold text-blue-400">{liveConnected ? 'LIVE' : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-n-bg/60 px-3 py-2.5">
              <span className="text-[11px] text-n-dim">Paper Account</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${broker?.paper.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="font-mono text-[11px] font-semibold text-n-text">{broker?.paper.connected ? fmtDollar(broker.paper.equity ?? 0) : 'Disconnesso'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-n-bg/60 px-3 py-2.5">
              <span className="text-[11px] text-n-dim">Ultimo sync</span>
              <span className="font-mono text-[10px] text-n-dim" suppressHydrationWarning>
                <Clock size={10} className="inline mr-1" />{new Date().toLocaleTimeString('en-US')}
              </span>
            </div>
            <Link href="/impostazioni" className="flex w-full items-center justify-center gap-2 rounded-lg border border-n-border py-2 text-xs text-n-dim hover:text-n-text transition-colors">
              <Key size={12} /> Gestisci API Keys
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ PORTFOLIO DATA ═══ */}
      <div>
        <h1 className="text-xl font-bold text-n-text">Portfolio Real</h1>
        <p className="text-xs text-n-dim">Live trading — dati reali da Alpaca</p>
      </div>

      {data && data.balance > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Bilancio" value={fmtDollar(data.balance)} sub={`${data.openPositions.length} posizioni aperte`} icon={Wallet} />
          <StatCard label="P&L Totale" value={data.hasTrades ? fmtPnl(data.stats.totalPnl) : '$0.00'} sub={data.hasTrades ? `${data.stats.totalTrades} trades` : 'Nessun trade'} icon={TrendingUp} color={data.stats.totalPnl >= 0 ? 'text-n-green' : 'text-n-red'} />
          <StatCard label="Win Rate" value={data.hasTrades ? fmtPercent(data.stats.winRate) : '—'} sub={data.hasTrades ? `${data.stats.wins}W / ${data.stats.losses}L` : ''} icon={Target} />
          <StatCard label="Max Drawdown" value={data.hasTrades ? fmtPercent(data.stats.maxDrawdown) : '—'} sub={data.hasTrades ? `Sharpe ${data.stats.sharpe.toFixed(2)}` : ''} icon={TrendingDown} color="text-n-red" />
        </div>
      )}

      {!data?.hasTrades ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-12">
          <Rocket size={32} className="text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun trade eseguito</p>
          <p className="mt-1 text-xs text-n-dim text-center px-4">Avvia il bot dalla pagina Strategy per iniziare a generare trade.</p>
          <Link href="/strategy" className="mt-4 rounded-lg bg-n-accent-dim px-4 py-2 text-xs font-semibold text-accent hover:bg-n-accent/20 transition-colors">Vai a Strategy</Link>
        </div>
      ) : (
        <>
          {data.equityCurve.length > 1 && (
            <div className="rounded-xl border border-n-border bg-n-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-n-dim">Equity Curve (trade reali)</h3>
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs><linearGradient id="eqGradReal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={data.stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} /><stop offset="100%" stopColor={data.stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'P&L Cumulativo']} />
                    <Area type="monotone" dataKey="equity" stroke={data.stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#eqGradReal)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-n-border bg-n-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-n-dim">Performance</h3>
              <div className="space-y-2.5">
                {[
                  { label: 'Profit Factor', value: data.stats.profitFactor >= 999 ? '∞' : data.stats.profitFactor.toFixed(2) },
                  { label: 'Sharpe Ratio', value: data.stats.sharpe.toFixed(2) },
                  { label: 'Expectancy', value: fmtDollar(data.stats.expectancy) },
                  { label: 'Avg Win', value: fmtDollar(data.stats.avgWin), color: 'text-n-green' },
                  { label: 'Avg Loss', value: fmtDollar(data.stats.avgLoss), color: 'text-n-red' },
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
                  { label: 'Best Trade', value: fmtPnl(data.stats.bestTrade), color: 'text-n-green' },
                  { label: 'Worst Trade', value: fmtPnl(data.stats.worstTrade), color: 'text-n-red' },
                  { label: 'Max Drawdown', value: fmtPercent(data.stats.maxDrawdown), color: 'text-n-red' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-[12px]">
                    <span className="text-n-dim">{row.label}</span>
                    <span className={`font-mono font-semibold ${row.color}`} suppressHydrationWarning>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {data && data.openPositions.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Posizioni Aperte (Alpaca Live)</h3>
          <div className="space-y-1.5">
            {data.openPositions.map((p) => (
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.recentTrades.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-semibold text-n-dim">Ultimi Trade Chiusi</h3>
          <div className="space-y-1.5">
            {data.recentTrades.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === 'LONG' ? 'bg-green-500/15 text-n-green' : 'bg-red-500/15 text-n-red'}`}>{t.side}</span>
                  <div>
                    <p className="font-mono text-xs font-semibold text-n-text">{t.symbol}</p>
                    <p className="text-[10px] text-n-dim">{t.strategy}</p>
                  </div>
                </div>
                <p className={`font-mono text-xs font-semibold ${(t.pnl ?? 0) >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(t.pnl ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
