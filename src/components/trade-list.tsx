'use client';

import { useState } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import { ArrowUpRight, ArrowDownRight, Download, RefreshCw, Rocket } from 'lucide-react';
import Link from 'next/link';

interface Trade {
  id: string; symbol: string; side: 'LONG' | 'SHORT'; status: string;
  entryPrice: number; exitPrice?: number; quantity?: number;
  netPnl?: number; pnlPct?: number; strategy: string;
  entryAt: string; exitAt?: string; exitReason?: string;
}

type FilterStatus = 'all' | 'open' | 'closed';
type SortField = 'date' | 'pnl' | 'symbol';

export function TradeList({ trades: allTrades, title, env, showWarning }: {
  trades: Trade[]; title: string; env: 'demo' | 'real'; showWarning?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'LONG' | 'SHORT'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

  const filtered = allTrades
    .filter((t) => { if (statusFilter !== 'all' && t.status !== statusFilter) return false; if (sideFilter !== 'all' && t.side !== sideFilter) return false; return true; })
    .sort((a, b) => { const dir = sortAsc ? 1 : -1; if (sortField === 'date') return dir * ((a.entryAt ?? '') > (b.entryAt ?? '') ? 1 : -1); if (sortField === 'pnl') return dir * ((a.netPnl ?? 0) - (b.netPnl ?? 0)); return dir * a.symbol.localeCompare(b.symbol); });

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);
  const closedTrades = allTrades.filter((t) => t.status === 'closed');
  const totalPnl = closedTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const wins = closedTrades.filter((t) => (t.netPnl ?? 0) > 0).length;

  const handleSort = (field: SortField) => { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(false); } setPage(0); };

  const handleExport = () => {
    const headers = ['ID', 'Symbol', 'Side', 'Entry', 'Exit', 'P&L', 'Strategy', 'Date', 'Status'];
    const rows = filtered.map(t => [t.id, t.symbol, t.side, t.entryPrice, t.exitPrice ?? '', t.netPnl ?? '', t.strategy, t.entryAt, t.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${env}-operazioni-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (allTrades.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-n-text md:text-xl">{title}</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-12 md:py-16">
          <Rocket size={28} className="text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun trade eseguito</p>
          <p className="mt-1 text-xs text-n-dim text-center px-4">Avvia il bot dalla pagina Strategy.</p>
          <Link href="/bot" className="mt-4 rounded-lg bg-n-accent-dim px-4 py-2.5 text-xs font-semibold text-accent min-h-[44px] flex items-center">Vai a Strategy</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-n-text md:text-xl">{title}</h1>
          <p className="text-xs text-n-dim" suppressHydrationWarning>
            {closedTrades.length} chiuse · {allTrades.filter(t => t.status === 'open').length} aperte · P&L: <span className={`ml-1 font-mono font-semibold ${totalPnl >= 0 ? 'text-n-green' : 'text-n-red'}`}>{fmtPnl(totalPnl)}</span>
          </p>
        </div>
        <button onClick={handleExport} className="flex items-center justify-center gap-1.5 rounded-lg border border-n-border px-3 py-2.5 text-xs text-n-dim hover:text-n-text transition-colors min-h-[44px] w-full sm:w-auto"><Download size={13} /> Esporta CSV</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: 'Win Rate', value: closedTrades.length ? `${((wins / closedTrades.length) * 100).toFixed(1)}%` : '—' },
          { label: 'Totale P&L', value: fmtPnl(totalPnl), color: totalPnl >= 0 ? 'text-n-green' : 'text-n-red' },
          { label: 'Chiusi', value: String(closedTrades.length) },
          { label: 'Aperte', value: String(allTrades.filter(t => t.status === 'open').length) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-n-border bg-n-card p-3">
            <p className="text-[10px] text-n-dim">{s.label}</p>
            <p className={`mt-0.5 font-mono text-base font-bold ${s.color || 'text-n-text'}`} suppressHydrationWarning>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-n-border">
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => { setStatusFilter(f); setPage(0); }} className={`px-3 py-2 text-xs font-medium transition-colors min-h-[40px] ${statusFilter === f ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:text-n-text'}`}>
              {f === 'all' ? 'Tutte' : f === 'open' ? 'Aperte' : 'Chiuse'}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-n-border">
          {(['all', 'LONG', 'SHORT'] as const).map((f) => (
            <button key={f} onClick={() => { setSideFilter(f); setPage(0); }} className={`px-3 py-2 text-xs font-medium transition-colors min-h-[40px] ${sideFilter === f ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:text-n-text'}`}>
              {f === 'all' ? 'Tutte' : f}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-n-dim">{filtered.length} risultati</span>
      </div>

      {/* Mobile: Card View / Desktop: Table */}
      <div className="md:hidden space-y-2">
        {paginated.map((t) => (
          <div key={t.id} className="rounded-xl border border-n-border bg-n-card p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-n-text">{t.symbol}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === 'LONG' ? 'bg-green-500/15 text-n-green' : 'bg-red-500/15 text-n-red'}`}>
                  {t.side} {t.side === 'LONG' ? '↗' : '↘'}
                </span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.status === 'open' ? 'bg-blue-500/15 text-blue-400' : 'bg-n-border text-n-dim'}`}>
                {t.status === 'open' ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[12px]">
              <span className="text-n-dim">Entry:</span>
              <span className="font-mono text-n-text text-right" suppressHydrationWarning>{fmtDollar(t.entryPrice)}</span>
              {t.exitPrice && <>
                <span className="text-n-dim">Exit:</span>
                <span className="font-mono text-n-text text-right" suppressHydrationWarning>{fmtDollar(t.exitPrice)}</span>
              </>}
              {t.netPnl != null && <>
                <span className="text-n-dim">P&L:</span>
                <span className={`font-mono font-semibold text-right ${t.netPnl >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(t.netPnl)} {t.pnlPct ? `(${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%)` : ''}</span>
              </>}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-n-dim">
              <span>{t.strategy}</span>
              <span>{t.entryAt ? new Date(t.entryAt).toLocaleDateString('en-US') : ''}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-n-border bg-n-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-n-border">
                <th onClick={() => handleSort('symbol')} className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim hover:text-n-text">Asset {sortField === 'symbol' && <span className="text-accent">{sortAsc ? '↑' : '↓'}</span>}</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Side</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Entry</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Exit</th>
                <th onClick={() => handleSort('pnl')} className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim hover:text-n-text">P&L {sortField === 'pnl' && <span className="text-accent">{sortAsc ? '↑' : '↓'}</span>}</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Strategia</th>
                <th onClick={() => handleSort('date')} className="cursor-pointer px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim hover:text-n-text">Data {sortField === 'date' && <span className="text-accent">{sortAsc ? '↑' : '↓'}</span>}</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Stato</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((t) => (
                <tr key={t.id} className="border-b border-n-border/50 transition-colors hover:bg-n-card-h">
                  <td className="px-3 py-2.5"><span className="font-mono text-xs font-semibold text-n-text">{t.symbol}</span></td>
                  <td className="px-3 py-2.5"><span className={`flex items-center gap-1 text-xs font-semibold ${t.side === 'LONG' ? 'text-n-green' : 'text-n-red'}`}>{t.side === 'LONG' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{t.side}</span></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-n-text-s" suppressHydrationWarning>{fmtDollar(t.entryPrice)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-n-text-s" suppressHydrationWarning>{t.exitPrice ? fmtDollar(t.exitPrice) : '—'}</td>
                  <td className="px-3 py-2.5">{t.netPnl != null ? <span className={`font-mono text-xs font-semibold ${t.netPnl >= 0 ? 'text-n-green' : 'text-n-red'}`} suppressHydrationWarning>{fmtPnl(t.netPnl)}</span> : <span className="text-xs text-n-dim">—</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-n-text-s">{t.strategy}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-n-dim">{t.entryAt ? new Date(t.entryAt).toLocaleDateString('en-US') : ''}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.status === 'open' ? 'bg-blue-500/15 text-blue-400' : 'bg-n-border text-n-dim'}`}>{t.status === 'open' ? 'OPEN' : 'CLOSED'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border border-n-border px-4 py-2 text-xs text-n-dim min-h-[44px] disabled:opacity-30">Prev</button>
          <span className="font-mono text-[11px] text-n-dim">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-n-border px-4 py-2 text-xs text-n-dim min-h-[44px] disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
