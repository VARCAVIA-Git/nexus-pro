'use client';

import { useState, useEffect, useCallback } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import Link from 'next/link';
import {
  Wallet, TrendingUp, TrendingDown, Bot, RefreshCw, ArrowUpRight, ArrowDownRight,
  DollarSign, BarChart3, Clock, XCircle, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface AccountData {
  mode: 'live' | 'paper';
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  lastEquity: number;
  dailyChange: number;
  dailyChangePct: number;
  status: string;
}

interface Position {
  symbol: string;
  side: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  changeToday: number;
}

interface Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  filledQty: number;
  avgFillPrice: number | null;
  status: string;
  createdAt: string;
  filledAt: string | null;
}

// ── Dashboard ────────────────────────────────────────────────

export default function DashboardPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeBots, setActiveBots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [accRes, posRes, ordRes, botRes] = await Promise.allSettled([
      fetch('/api/broker/account'),
      fetch('/api/broker/positions'),
      fetch('/api/broker/orders?status=all&limit=20'),
      fetch('/api/bot/status?mode=real'),
    ]);

    if (accRes.status === 'fulfilled' && accRes.value.ok) {
      setAccount(await accRes.value.json());
      setError(null);
    } else {
      setError('Broker non connesso');
    }

    if (posRes.status === 'fulfilled' && posRes.value.ok) {
      const d = await posRes.value.json();
      setPositions(d.positions ?? []);
    }

    if (ordRes.status === 'fulfilled' && ordRes.value.ok) {
      const d = await ordRes.value.json();
      setOrders(d.orders ?? []);
    }

    if (botRes.status === 'fulfilled' && botRes.value.ok) {
      const d = await botRes.value.json();
      setActiveBots((d.bots ?? []).filter((b: any) => b.status === 'running').length);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-n-dim" />
      </div>
    );
  }

  const isLive = account?.mode === 'live';
  const equity = account?.equity ?? 0;
  const dailyChange = account?.dailyChange ?? 0;
  const dailyPct = account?.dailyChangePct ?? 0;

  return (
    <div className="space-y-5 stagger">
      {/* Connection status */}
      {error && (
        <Link href="/impostazioni" className="flex items-center gap-2 rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3 text-sm text-blue-300 hover:bg-blue-500/10 transition-all">
          <AlertTriangle size={16} /> Broker non connesso. Configura le API keys →
        </Link>
      )}

      {/* Account mode badge */}
      {account && (
        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${isLive ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {isLive ? 'LIVE' : 'PAPER'}
          </span>
          <span className="text-[10px] text-n-dim">
            {isLive ? 'Operazioni con fondi reali' : 'Ambiente simulato'}
          </span>
        </div>
      )}

      {/* ═══ PORTFOLIO VALUE ═══ */}
      <div className="rounded-2xl border border-n-border bg-n-card p-6">
        <p className="text-xs text-n-dim mb-1">Il tuo portfolio</p>
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-3xl font-bold text-n-text" suppressHydrationWarning>
            {equity > 0 ? `$${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </p>
          {dailyChange !== 0 && (
            <div className={`flex items-center gap-1 ${dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {dailyChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              <span className="font-mono text-sm font-bold" suppressHydrationWarning>
                {dailyChange >= 0 ? '+' : ''}{fmtDollar(dailyChange)} ({dailyPct >= 0 ? '+' : ''}{dailyPct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ STATS GRID ═══ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Equity" value={fmtDollar(equity)} icon={Wallet} />
        <StatCard label="Cash disponibile" value={fmtDollar(account?.cash ?? 0)} icon={DollarSign} />
        <StatCard label="Buying Power" value={fmtDollar(account?.buyingPower ?? 0)} icon={BarChart3} />
        <StatCard label="Bot Attivi" value={String(activeBots)} icon={Bot} color={activeBots > 0 ? 'text-green-400' : undefined} />
      </div>

      {/* ═══ POSITIONS ═══ */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-n-text">Posizioni aperte</h3>
          <span className="text-[10px] text-n-dim">{positions.length} posizion{positions.length === 1 ? 'e' : 'i'}</span>
        </div>
        {positions.length === 0 ? (
          <p className="text-xs text-n-dim py-4 text-center">Nessuna posizione aperta.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Asset</th>
                  <th className="px-2 py-1.5">Lato</th>
                  <th className="px-2 py-1.5">Qty</th>
                  <th className="px-2 py-1.5">Prezzo entry</th>
                  <th className="px-2 py-1.5">Prezzo attuale</th>
                  <th className="px-2 py-1.5">Valore</th>
                  <th className="px-2 py-1.5">P&L</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {positions.map(p => (
                  <tr key={p.symbol} className="border-t border-n-border">
                    <td className="px-2 py-2 font-mono font-semibold">{p.symbol}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${p.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {p.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono">{p.qty}</td>
                    <td className="px-2 py-2 font-mono">${p.avgEntryPrice.toLocaleString()}</td>
                    <td className="px-2 py-2 font-mono">${p.currentPrice.toLocaleString()}</td>
                    <td className="px-2 py-2 font-mono">${p.marketValue.toLocaleString()}</td>
                    <td className={`px-2 py-2 font-mono font-bold ${p.unrealizedPl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {p.unrealizedPl >= 0 ? '+' : ''}{fmtDollar(p.unrealizedPl)} ({p.unrealizedPlPct >= 0 ? '+' : ''}{p.unrealizedPlPct.toFixed(2)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ RECENT ORDERS ═══ */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-n-text">Ordini recenti</h3>
          <span className="text-[10px] text-n-dim">{orders.length} ordin{orders.length === 1 ? 'e' : 'i'}</span>
        </div>
        {orders.length === 0 ? (
          <p className="text-xs text-n-dim py-4 text-center">Nessun ordine. I bot genereranno ordini quando troveranno opportunità.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Asset</th>
                  <th className="px-2 py-1.5">Tipo</th>
                  <th className="px-2 py-1.5">Lato</th>
                  <th className="px-2 py-1.5">Qty</th>
                  <th className="px-2 py-1.5">Filled</th>
                  <th className="px-2 py-1.5">Prezzo</th>
                  <th className="px-2 py-1.5">Stato</th>
                  <th className="px-2 py-1.5">Data</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {orders.map(o => (
                  <tr key={o.id} className="border-t border-n-border">
                    <td className="px-2 py-2 font-mono font-semibold">{o.symbol}</td>
                    <td className="px-2 py-2">{o.type}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${o.side === 'buy' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono">{o.qty}</td>
                    <td className="px-2 py-2 font-mono">{o.filledQty}</td>
                    <td className="px-2 py-2 font-mono">{o.avgFillPrice ? `$${o.avgFillPrice.toLocaleString()}` : '—'}</td>
                    <td className="px-2 py-2">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="px-2 py-2 text-n-dim" suppressHydrationWarning>
                      {formatOrderDate(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ QUICK ACTIONS ═══ */}
      {activeBots === 0 && positions.length === 0 && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-6 text-center space-y-3">
          <p className="text-sm text-n-text font-medium">Pronto per iniziare</p>
          <p className="text-xs text-n-dim">Analizza gli asset con l&apos;AI, poi lancia un bot per operare automaticamente.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/analisi" className="rounded-xl bg-blue-500/10 px-4 py-2.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-all">AI Analytics</Link>
            <Link href="/bot" className="rounded-xl bg-n-bg-s px-4 py-2.5 text-xs font-semibold text-n-text hover:bg-n-border transition-all">Lancia Bot</Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Components ───────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-n-dim uppercase tracking-wide">{label}</p>
        <Icon size={14} className={color ?? 'text-n-dim'} />
      </div>
      <p className={`mt-1.5 font-mono text-lg font-bold ${color ?? 'text-n-text'}`} suppressHydrationWarning>
        {value}
      </p>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    filled: { label: 'Eseguito', color: 'bg-green-500/15 text-green-400' },
    partially_filled: { label: 'Parziale', color: 'bg-amber-500/15 text-amber-400' },
    new: { label: 'In attesa', color: 'bg-blue-500/15 text-blue-400' },
    accepted: { label: 'Accettato', color: 'bg-blue-500/15 text-blue-400' },
    pending_new: { label: 'Pending', color: 'bg-n-bg-s text-n-dim' },
    canceled: { label: 'Annullato', color: 'bg-n-bg-s text-n-dim' },
    expired: { label: 'Scaduto', color: 'bg-n-bg-s text-n-dim' },
    rejected: { label: 'Rifiutato', color: 'bg-red-500/15 text-red-400' },
  };
  const s = map[status] ?? { label: status, color: 'bg-n-bg-s text-n-dim' };
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${s.color}`}>{s.label}</span>;
}

function formatOrderDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
