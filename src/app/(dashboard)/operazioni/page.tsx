'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { TradeList } from '@/components/trade-list';

export default function OperazioniPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/trades?env=real&limit=500').then(r => r.ok ? r.json() : { trades: [] }).then(d => setTrades(d.trades)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-4">
      <TradeList trades={trades} title="Operazioni" env="real" />
    </div>
  );
}
