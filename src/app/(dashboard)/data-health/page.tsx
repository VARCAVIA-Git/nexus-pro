'use client';

import { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

interface DataHealth {
  symbol: string;
  healthy: boolean;
  quality: {
    bars_count: number; bars_expected: number; bars_ok: boolean;
    funding_count: number; funding_ok: boolean;
    latest_bar_age_s: number; stale: boolean;
    price: number; price_ok: boolean;
  };
  checked_at: string;
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800/40 bg-zinc-900/30 px-4 py-3">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
        <span className="text-sm text-zinc-300">{label}</span>
      </div>
      <span className="text-xs font-mono text-zinc-500">{detail}</span>
    </div>
  );
}

export default function DataHealthPage() {
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nexusone/data-health');
      if (res.ok) setHealth(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const q = health?.quality;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Database size={20} className="text-cyan-400" />
            Data Health
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            {health ? `Checked: ${new Date(health.checked_at).toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-all">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Overall status */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-3">
          {health?.healthy
            ? <><CheckCircle2 size={20} className="text-emerald-400" /><span className="text-lg font-semibold text-emerald-400">All systems healthy</span></>
            : <><AlertTriangle size={20} className="text-amber-400" /><span className="text-lg font-semibold text-amber-400">Degraded</span></>
          }
        </div>
      </div>

      {/* Checks */}
      {q && (
        <div className="space-y-2">
          <Check ok={q.bars_ok} label="OHLCV Bars (Alpaca)" detail={`${q.bars_count} / ${q.bars_expected} expected`} />
          <Check ok={q.funding_ok} label="Funding Rates" detail={`${q.funding_count} rates`} />
          <Check ok={q.price_ok} label="Live Price" detail={q.price > 0 ? `$${q.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'unavailable'} />
          <Check ok={!q.stale} label="Data Freshness" detail={q.latest_bar_age_s < Infinity ? `${q.latest_bar_age_s}s ago` : 'no data'} />
        </div>
      )}
    </div>
  );
}
