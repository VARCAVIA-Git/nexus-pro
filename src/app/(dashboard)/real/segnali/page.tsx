'use client';

import { useState, useEffect } from 'react';
import type { SignalData } from '@/app/api/signals/route';
import { ArrowUpRight, ArrowDownRight, Minus, Zap, AlertTriangle, RefreshCw, Radio } from 'lucide-react';

const DEFAULT_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];

export default function RealSegnaliPage() {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);

  const activeSymbols = DEFAULT_SYMBOLS;

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/signals?symbols=${activeSymbols.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals);
      }
    } catch { /* keep existing */ }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const buys = signals.filter((s) => s.signal === 'BUY');
  const sells = signals.filter((s) => s.signal === 'SELL');
  const neutrals = signals.filter((s) => s.signal === 'NEUTRAL');
  const liveCount = signals.filter((s) => s.dataSource === 'live').length;

  return (
    <div className="space-y-5 stagger">
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <AlertTriangle size={18} className="text-blue-400 shrink-0" />
        <div>
          <p className="text-sm font-bold text-blue-300">Stai operando con capitale reale</p>
          <p className="text-[11px] text-blue-400/70">I segnali in questa sezione sono per il trading live.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Segnali Real</h1>
          <p className="text-xs text-n-dim">Segnali generati dal trading engine per {activeSymbols.length} asset attivi</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Aggiorna
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-n-border bg-n-card px-3 py-1.5">
            <Zap size={13} className="text-accent animate-pulse-dot" />
            <span className="font-mono text-xs text-n-text-s">{signals.length} segnali</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-n-border bg-n-card p-3">
          <p className="text-[10px] text-n-dim">BUY</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-n-green">{buys.length}</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-3">
          <p className="text-[10px] text-n-dim">SELL</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-n-red">{sells.length}</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-3">
          <p className="text-[10px] text-n-dim">NEUTRAL</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-n-dim">{neutrals.length}</p>
        </div>
        <div className="rounded-xl border border-n-border bg-n-card p-3">
          <div className="flex items-center gap-1">
            <Radio size={10} className="text-green-400" />
            <p className="text-[10px] text-n-dim">Dati Live</p>
          </div>
          <p className="mt-0.5 font-mono text-lg font-bold text-green-400">{liveCount}/{signals.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <RefreshCw size={24} className="mx-auto animate-spin text-n-dim" />
            <p className="mt-2 text-xs text-n-dim">Generazione segnali su dati live...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((s, idx) => (
            <div key={`${s.symbol}-${idx}`} className="flex items-center justify-between rounded-xl border border-n-border bg-n-card p-4 transition-colors hover:border-n-border-b">
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  s.signal === 'BUY' ? 'bg-green-500/15' : s.signal === 'SELL' ? 'bg-red-500/15' : 'bg-gray-500/15'
                }`}>
                  {s.signal === 'BUY' ? <ArrowUpRight size={20} className="text-n-green" /> :
                   s.signal === 'SELL' ? <ArrowDownRight size={20} className="text-n-red" /> :
                   <Minus size={20} className="text-n-dim" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-bold text-n-text">{s.symbol}</p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      s.signal === 'BUY' ? 'bg-green-500/15 text-n-green' : s.signal === 'SELL' ? 'bg-red-500/15 text-n-red' : 'bg-gray-500/15 text-n-dim'
                    }`}>{s.strength.replace('_', ' ').toUpperCase()}</span>
                    <span className="rounded bg-n-bg px-1.5 py-0.5 text-[9px] text-n-dim">{s.regime}</span>
                    {s.dataSource === 'live' && (
                      <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-green-400">LIVE</span>
                    )}
                  </div>
                  <p className="text-[11px] text-n-dim">{s.strategy} — {s.time}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold text-n-text">
                  ${s.price.toLocaleString('en-US', { minimumFractionDigits: s.price < 100 ? 2 : 0 })}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-n-dim">Conf</span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-n-border">
                    <div className={`h-full rounded-full ${s.confidence > 0.7 ? 'bg-n-green' : s.confidence > 0.5 ? 'bg-n-yellow' : 'bg-n-red'}`} style={{ width: `${s.confidence * 100}%` }} />
                  </div>
                  <span className="font-mono text-[10px] font-semibold text-n-text-s">{(s.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
