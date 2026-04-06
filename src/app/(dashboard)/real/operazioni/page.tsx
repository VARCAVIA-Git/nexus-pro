'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { TradeList } from '@/components/trade-list';

export default function RealOperazioniPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trades?env=real&limit=500');
        if (res.ok) { const d = await res.json(); setTrades(d.trades); }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <AlertTriangle size={16} className="text-blue-400 shrink-0" />
        <p className="text-[11px] font-bold text-blue-300">Operazioni con capitale reale</p>
      </div>
      <TradeList trades={trades} title="Operazioni Real" env="real" />
    </div>
  );
}
