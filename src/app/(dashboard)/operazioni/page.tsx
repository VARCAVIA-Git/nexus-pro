'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { TradeList } from '@/components/trade-list';

export default function OperazioniPage() {
  const mode = 'real';
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trades?env=${mode}&limit=500`).then(r => r.ok ? r.json() : { trades: [] }).then(d => setTrades(d.trades)).catch(() => {}).finally(() => setLoading(false));
  }, [mode]);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-4">
      {mode === 'real' && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">Operazioni con capitale reale</p>
        </div>
      )}
      <TradeList trades={trades} title="Operazioni" env={mode} />
    </div>
  );
}
