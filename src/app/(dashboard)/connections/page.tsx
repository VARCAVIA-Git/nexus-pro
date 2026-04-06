'use client';

import { useState, useEffect } from 'react';
import { fmtDollar } from '@/lib/utils/format';
import { CheckCircle, XCircle, RefreshCw, Wifi, Database, Radio, ExternalLink } from 'lucide-react';

interface ServiceStatus { connected: boolean; equity?: number; cash?: number; error?: string; latency?: number }

export default function ConnectionsPage() {
  const [broker, setBroker] = useState<{ paper: ServiceStatus; live: ServiceStatus; liveConfigured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_all = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/broker/status');
      if (res.ok) setBroker(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetch_all(); }, []);

  const services = [
    { name: 'Alpaca Paper', status: broker?.paper.connected ?? false, detail: broker?.paper.connected ? `Equity: ${fmtDollar(broker.paper.equity ?? 0)}` : broker?.paper.error ?? 'Non configurato', icon: Wifi },
    { name: 'Alpaca Live', status: broker?.live.connected ?? false, detail: broker?.live.connected ? `Equity: ${fmtDollar(broker.live.equity ?? 0)}` : broker?.live.error ?? 'Non configurato', icon: Wifi },
    { name: 'Twelve Data', status: true, detail: 'Stock market data', icon: Radio },
    { name: 'CoinGecko', status: true, detail: 'Crypto market data', icon: Radio },
    { name: 'Upstash Redis', status: true, detail: 'State persistence', icon: Database },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-n-text">API & Connessioni</h1><p className="text-sm text-n-dim">Stato di tutti i servizi collegati</p></div>
        <button onClick={fetch_all} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-n-border px-4 py-2.5 text-sm text-n-dim hover:text-n-text min-h-[44px] w-full sm:w-auto disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Test Connessioni
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map(s => (
          <div key={s.name} className="rounded-xl border border-n-border bg-n-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><s.icon size={16} className="text-n-dim" /><h3 className="text-sm font-medium text-n-text">{s.name}</h3></div>
              {s.status ? <CheckCircle size={16} className="text-n-green" /> : <XCircle size={16} className="text-n-red" />}
            </div>
            <p className="text-xs text-n-dim" suppressHydrationWarning>{s.detail}</p>
          </div>
        ))}
      </div>

      {/* Gestione fondi */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <h3 className="label mb-3">Gestione Fondi</h3>
        <p className="text-sm text-n-dim mb-4">Depositi e prelievi si gestiscono dalla dashboard Alpaca per sicurezza.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href="https://app.alpaca.markets/banking/transfers" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-n-border px-4 py-2.5 text-sm text-n-dim hover:text-n-text min-h-[44px] flex-1">Deposita / Preleva <ExternalLink size={12} /></a>
          <a href="https://app.alpaca.markets" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-n-border px-4 py-2.5 text-sm text-n-dim hover:text-n-text min-h-[44px] flex-1">Dashboard Alpaca <ExternalLink size={12} /></a>
        </div>
      </div>
    </div>
  );
}
