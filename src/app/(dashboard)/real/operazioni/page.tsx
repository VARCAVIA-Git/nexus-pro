'use client';

import { useState, useEffect } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import { ArrowUpRight, ArrowDownRight, Download, RefreshCw, Rocket, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface Trade {
  id: string; symbol: string; side: 'LONG' | 'SHORT'; status: string;
  entryPrice: number; exitPrice?: number; quantity: number;
  netPnl?: number; pnlPct?: number; strategy: string;
  entryAt: string; exitAt?: string; exitReason?: string;
}

type FilterStatus = 'all' | 'open' | 'closed';
type SortField = 'date' | 'pnl' | 'symbol';

export default function RealOperazioniPage() {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'LONG' | 'SHORT'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 20;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trades?env=real&limit=500');
        if (res.ok) { const d = await res.json(); setAllTrades(d.trades); }
      } catch {}
      setLoading(false);
    })();
  }, []);

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
    const headers = ['ID', 'Symbol', 'Side', 'Entry', 'Exit', 'Qty', 'P&L', 'P&L%', 'Strategy', 'Date', 'Status'];
    const rows = filtered.map(t => [t.id, t.symbol, t.side, t.entryPrice, t.exitPrice ?? '', t.quantity, t.netPnl ?? '', t.pnlPct ?? '', t.strategy, t.entryAt, t.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `real-operazioni-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th className="cursor-pointer px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-n-dim hover:text-n-text transition-colors whitespace-nowrap" onClick={() => handleSort(field)}>
      <span className="flex items-center gap-1">{children}{sortField === field && <span className="text-accent">{sortAsc ? '↑' : '↓'}</span>}</span>
    </th>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <AlertTriangle size={18} className="text-blue-400 shrink-0" />
        <p className="text-[11px] font-bold text-blue-300">Stai operando con capitale reale</p>
      </div>

      {allTrades.length === 0 ? (
        <>
          <h1 className="text-xl font-bold text-n-text">Operazioni Real</h1>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-16">
            <Rocket size={32} className="text-n-dim mb-3" />
            <p className="text-sm font-semibold text-n-text-s">Nessun trade reale</p>
            <p className="mt-1 text-xs text-n-dim">Configura le API keys live nelle Impostazioni per iniziare.</p>
            <Link href="/impostazioni" className="mt-4 rounded-lg bg-n-accent-dim px-4 py-2 text-xs font-semibold text-accent">Vai a Impostazioni</Link>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-n-text">Operazioni Real</h1>
              <p className="text-xs text-n-dim" suppressHydrationWarning>
                {closedTrades.length} chiuse · {allTrades.filter(t => t.status === 'open').length} aperte · P&L: <span className={`ml-1 font-mono font-semibold ${totalPnl >= 0 ? 'text-n-green' : 'text-n-red'}`}>{fmtPnl(totalPnl)}</span>
              </p>
            </div>
            <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors self-start"><Download size={13} /> Esporta CSV</button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Win Rate', value: closedTrades.length ? `${((wins / closedTrades.length) * 100).toFixed(1)}%` : '—' },
              { label: 'Totale P&L', value: fmtPnl(totalPnl), color: totalPnl >= 0 ? 'text-n-green' : 'text-n-red' },
              { label: 'Trades Chiusi', value: String(closedTrades.length) },
              { label: 'Posizioni Aperte', value: String(allTrades.filter(t => t.status === 'open').length) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-n-border bg-n-card p-3">
                <p className="text-[10px] text-n-dim">{s.label}</p>
                <p className={`mt-0.5 font-mono text-base font-bold sm:text-lg ${s.color || 'text-n-text'}`} suppressHydrationWarning>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-n-border">
              {(['all', 'open', 'closed'] as const).map((f) => (<button key={f} onClick={() => { setStatusFilter(f); setPage(0); }} className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === f ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:text-n-text'}`}>{f === 'all' ? 'Tutte' : f === 'open' ? 'Aperte' : 'Chiuse'}</button>))}
            </div>
            <div className="flex rounded-lg border border-n-border">
              {(['all', 'LONG', 'SHORT'] as const).map((f) => (<button key={f} onClick={() => { setSideFilter(f); setPage(0); }} className={`px-3 py-1.5 text-xs font-medium transition-colors ${sideFilter === f ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:text-n-text'}`}>{f === 'all' ? 'Tutte' : f}</button>))}
            </div>
            <span className="ml-auto font-mono text-[10px] text-n-dim">{filtered.length} risultati</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-n-border bg-n-card"><div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead><tr className="border-b border-n-border">
                <SortHeader field="symbol">Asset</SortHeader>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Side</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Entry</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Exit</th>
                <SortHeader field="pnl">P&L</SortHeader>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Strategia</th>
                <SortHeader field="date">Data</SortHeader>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Stato</th>
              </tr></thead>
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
          </div></div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded border border-n-border px-3 py-1 text-xs text-n-dim disabled:opacity-30">Prev</button>
              <span className="font-mono text-[10px] text-n-dim">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded border border-n-border px-3 py-1 text-xs text-n-dim disabled:opacity-30">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
