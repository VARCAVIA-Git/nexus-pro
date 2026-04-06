'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { TradeList } from '@/components/trade-list';

export default function DemoOperazioniPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/trades?env=demo&limit=500');
        if (res.ok) { const d = await res.json(); setTrades(d.trades); }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return <TradeList trades={trades} title="Operazioni Demo" env="demo" />;
}
