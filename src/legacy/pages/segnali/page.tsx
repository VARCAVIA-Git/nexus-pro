'use client';

import { useState, useEffect } from 'react';
import { useModeStore } from '@/stores/mode-store';
import type { SignalData } from '@/app/api/signals/route';
import { ArrowUpRight, ArrowDownRight, Minus, Zap, AlertTriangle, RefreshCw, Radio } from 'lucide-react';

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];

export default function SegnaliPage() {
  const mode = useModeStore((s) => s.mode);
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/signals?symbols=${SYMBOLS.join(',')}`);
      if (res.ok) setSignals((await res.json()).signals);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [mode]);

  const buys = signals.filter(s => s.signal === 'BUY').length;
  const sells = signals.filter(s => s.signal === 'SELL').length;
  const neutrals = signals.filter(s => s.signal === 'NEUTRAL').length;
  const liveCount = signals.filter(s => s.dataSource === 'live').length;

  return (
    <div className="space-y-5">
      {mode === 'real' && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">Segnali per trading live</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-n-text">Segnali</h1>
        <button onClick={refresh} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-n-border px-4 py-2.5 text-sm text-n-dim hover:text-n-text transition-colors min-h-[44px] w-full sm:w-auto disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-n-border bg-n-card p-4"><p className="label">BUY</p><p className="mt-1 font-mono text-2xl font-medium text-n-green">{buys}</p></div>
        <div className="rounded-xl border border-n-border bg-n-card p-4"><p className="label">SELL</p><p className="mt-1 font-mono text-2xl font-medium text-n-red">{sells}</p></div>
        <div className="rounded-xl border border-n-border bg-n-card p-4"><p className="label">NEUTRAL</p><p className="mt-1 font-mono text-2xl font-medium text-n-dim">{neutrals}</p></div>
        <div className="rounded-xl border border-n-border bg-n-card p-4"><div className="flex items-center gap-1"><Radio size={10} className="text-n-green" /><p className="label">Live</p></div><p className="mt-1 font-mono text-2xl font-medium text-n-green">{liveCount}/{signals.length}</p></div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>
      ) : (
        <div className="space-y-2">
          {signals.map((s, idx) => (
            <div key={`${s.symbol}-${idx}`} className="flex items-center justify-between rounded-xl border border-n-border bg-n-card p-4 transition-colors hover:bg-n-card-h">
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.signal === 'BUY' ? 'bg-green-500/10' : s.signal === 'SELL' ? 'bg-red-500/10' : 'bg-gray-500/10'}`}>
                  {s.signal === 'BUY' ? <ArrowUpRight size={20} className="text-n-green" /> : s.signal === 'SELL' ? <ArrowDownRight size={20} className="text-n-red" /> : <Minus size={20} className="text-n-dim" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-medium text-n-text">{s.symbol}</p>
                    <span className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${s.signal === 'BUY' ? 'bg-green-500/10 text-n-green' : s.signal === 'SELL' ? 'bg-red-500/10 text-n-red' : 'bg-gray-500/10 text-n-dim'}`}>{s.strength.replace('_', ' ').toUpperCase()}</span>
                    {s.dataSource === 'live' && <span className="rounded-lg bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-n-green">LIVE</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-n-dim">{s.strategy} · {s.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-n-text" suppressHydrationWarning>${s.price.toLocaleString('en-US', { minimumFractionDigits: s.price < 100 ? 2 : 0 })}</p>
                <div className="mt-1 flex items-center gap-2 justify-end">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-n-border"><div className={`h-full rounded-full ${s.confidence > 0.7 ? 'bg-n-green' : s.confidence > 0.5 ? 'bg-n-yellow' : 'bg-n-red'}`} style={{ width: `${s.confidence * 100}%` }} /></div>
                  <span className="font-mono text-xs text-n-dim">{(s.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
