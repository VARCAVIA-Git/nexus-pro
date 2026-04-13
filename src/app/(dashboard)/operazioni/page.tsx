'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, Filter } from 'lucide-react';
import { fmtDollar } from '@/lib/utils/format';

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

const statusMap: Record<string, { label: string; color: string }> = {
  filled: { label: 'Eseguito', color: 'bg-green-500/15 text-green-400' },
  partially_filled: { label: 'Parziale', color: 'bg-amber-500/15 text-amber-400' },
  new: { label: 'In attesa', color: 'bg-blue-500/15 text-blue-400' },
  accepted: { label: 'Accettato', color: 'bg-blue-500/15 text-blue-400' },
  canceled: { label: 'Annullato', color: 'bg-n-bg-s text-n-dim' },
  expired: { label: 'Scaduto', color: 'bg-n-bg-s text-n-dim' },
  rejected: { label: 'Rifiutato', color: 'bg-red-500/15 text-red-400' },
};

export default function OperazioniPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'all' | 'filled' | 'canceled'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/orders?status=${filter}&limit=100`);
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders ?? []);
      }
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Operazioni</h1>
          <p className="text-xs text-n-dim">{filtered.length} ordini trovati</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-n-border">
            {(['all', 'filled', 'canceled'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-medium capitalize ${filter === f ? 'bg-n-accent-dim text-n-text' : 'text-n-dim hover:text-n-text'}`}>
                {f === 'all' ? 'Tutti' : f === 'filled' ? 'Eseguiti' : 'Annullati'}
              </button>
            ))}
          </div>
          <button onClick={load} className="rounded-lg border border-n-border p-1.5 text-n-dim hover:text-n-text">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-n-dim" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 py-12 text-center">
          <Activity size={32} className="mx-auto text-n-dim mb-2" />
          <p className="text-sm text-n-text-s">Nessun ordine</p>
          <p className="text-xs text-n-dim mt-1">Gli ordini appariranno qui quando i bot iniziano ad operare.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-n-border bg-n-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim bg-n-bg-s">
                <tr>
                  <th className="px-3 py-2.5">Asset</th>
                  <th className="px-3 py-2.5">Lato</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Quantità</th>
                  <th className="px-3 py-2.5">Eseguito</th>
                  <th className="px-3 py-2.5">Prezzo</th>
                  <th className="px-3 py-2.5">Stato</th>
                  <th className="px-3 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {filtered.map(o => (
                  <tr key={o.id} className="border-t border-n-border hover:bg-n-bg/40">
                    <td className="px-3 py-2.5 font-mono font-semibold">{o.symbol}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${o.side === 'buy' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{o.type}</td>
                    <td className="px-3 py-2.5 font-mono">{o.qty}</td>
                    <td className="px-3 py-2.5 font-mono">{o.filledQty > 0 ? o.filledQty : '—'}</td>
                    <td className="px-3 py-2.5 font-mono">{o.avgFillPrice ? fmtDollar(o.avgFillPrice) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${(statusMap[o.status] ?? statusMap.new).color}`}>
                        {(statusMap[o.status] ?? { label: o.status }).label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-n-dim" suppressHydrationWarning>
                      {new Date(o.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} {new Date(o.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
