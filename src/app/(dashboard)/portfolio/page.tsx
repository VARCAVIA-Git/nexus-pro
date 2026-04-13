'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import {
  Wallet, TrendingUp, TrendingDown, DollarSign, BarChart3, RefreshCw, PieChart,
} from 'lucide-react';

interface Account {
  mode: 'live' | 'paper';
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  dailyChange: number;
  dailyChangePct: number;
}

interface Position {
  symbol: string;
  side: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  changeToday: number;
  assetClass: string;
}

export default function PortfolioPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [accRes, posRes] = await Promise.allSettled([
      fetch('/api/broker/account'),
      fetch('/api/broker/positions'),
    ]);
    if (accRes.status === 'fulfilled' && accRes.value.ok) setAccount(await accRes.value.json());
    if (posRes.status === 'fulfilled' && posRes.value.ok) {
      const d = await posRes.value.json();
      setPositions(d.positions ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Portfolio</h1>
          <p className="text-xs text-n-dim">
            {account?.mode === 'live' ? 'Conto reale' : 'Conto simulato'} · aggiornato ogni 15s
          </p>
        </div>
        <button onClick={load} className="rounded-lg border border-n-border p-2 text-n-dim hover:text-n-text">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Account stats */}
      {account && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Equity totale" value={fmtDollar(account.equity)} icon={Wallet} />
          <StatCard label="Cash disponibile" value={fmtDollar(account.cash)} icon={DollarSign} />
          <StatCard label="Buying Power" value={fmtDollar(account.buyingPower)} icon={BarChart3} />
          <StatCard
            label="Variazione giornaliera"
            value={`${account.dailyChange >= 0 ? '+' : ''}${fmtDollar(account.dailyChange)} (${account.dailyChangePct >= 0 ? '+' : ''}${account.dailyChangePct.toFixed(2)}%)`}
            icon={account.dailyChange >= 0 ? TrendingUp : TrendingDown}
            color={account.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        </div>
      )}

      {/* Allocation */}
      {positions.length > 0 && account && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={14} className="text-blue-400" />
            <h2 className="text-sm font-bold text-n-text">Allocazione</h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {positions.map(p => {
              const pct = account.equity > 0 ? (p.marketValue / account.equity * 100) : 0;
              return (
                <div key={p.symbol} className="flex items-center gap-2 rounded-lg bg-n-bg/60 px-3 py-2">
                  <span className="font-mono text-xs font-bold text-n-text">{p.symbol}</span>
                  <span className="text-[10px] text-n-dim">{fmtDollar(p.marketValue)}</span>
                  <span className="font-mono text-[10px] text-blue-400">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 rounded-lg bg-n-bg/60 px-3 py-2">
              <span className="font-mono text-xs font-bold text-n-dim">Cash</span>
              <span className="text-[10px] text-n-dim">{fmtDollar(account.cash)}</span>
              <span className="font-mono text-[10px] text-amber-400">{(account.cash / account.equity * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Positions */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-n-text">Posizioni aperte</h2>
          <div className="text-[10px] text-n-dim">
            {positions.length} posizion{positions.length === 1 ? 'e' : 'i'} ·
            P&L: <span className={totalUnrealized >= 0 ? 'text-green-400' : 'text-red-400'}>
              {totalUnrealized >= 0 ? '+' : ''}{fmtDollar(totalUnrealized)}
            </span>
          </div>
        </div>

        {positions.length === 0 ? (
          <p className="py-8 text-center text-xs text-n-dim">Nessuna posizione aperta. Lancia un bot per iniziare ad operare.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-3 py-2">Asset</th>
                  <th className="px-3 py-2">Lato</th>
                  <th className="px-3 py-2">Quantità</th>
                  <th className="px-3 py-2">Prezzo medio</th>
                  <th className="px-3 py-2">Prezzo attuale</th>
                  <th className="px-3 py-2">Valore</th>
                  <th className="px-3 py-2">P&L</th>
                  <th className="px-3 py-2">P&L %</th>
                  <th className="px-3 py-2">Oggi</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {positions.map(p => (
                  <tr key={p.symbol} className="border-t border-n-border">
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-semibold">{p.symbol}</span>
                      <span className="ml-1.5 text-[9px] text-n-dim">{p.assetClass}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${p.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {p.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono">{p.qty}</td>
                    <td className="px-3 py-2.5 font-mono">{fmtDollar(p.avgEntryPrice)}</td>
                    <td className="px-3 py-2.5 font-mono">{fmtDollar(p.currentPrice)}</td>
                    <td className="px-3 py-2.5 font-mono">{fmtDollar(p.marketValue)}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${p.unrealizedPl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.unrealizedPl >= 0 ? '+' : ''}{fmtDollar(p.unrealizedPl)}
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${p.unrealizedPlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.unrealizedPlPct >= 0 ? '+' : ''}{p.unrealizedPlPct.toFixed(2)}%
                    </td>
                    <td className={`px-3 py-2.5 font-mono text-[10px] ${p.changeToday >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.changeToday >= 0 ? '+' : ''}{p.changeToday.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-n-dim">{label}</p>
        <Icon size={14} className={color ?? 'text-n-dim'} />
      </div>
      <p className={`mt-1.5 font-mono text-lg font-bold ${color ?? 'text-n-text'}`} suppressHydrationWarning>
        {value}
      </p>
    </div>
  );
}
