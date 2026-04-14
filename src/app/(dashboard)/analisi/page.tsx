'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { AssetAnalytic } from '@/lib/analytics/types';
import { useBatchPrices } from '@/hooks/useLivePrice';
import {
  Brain, Loader2, CheckCircle2, Clock, AlertTriangle, Plus,
  Search, X, Activity, Target, Zap, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────

function formatTimeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min}m fa`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toFixed(2);
  return '$' + p.toFixed(4);
}

const regimeLabels: Record<string, { text: string; cls: string }> = {
  TRENDING_UP:   { text: 'In salita',   cls: 'text-emerald-400' },
  TRENDING_DOWN: { text: 'In discesa',  cls: 'text-red-400' },
  RANGING:       { text: 'Laterale',    cls: 'text-amber-400' },
  VOLATILE:      { text: 'Volatile',    cls: 'text-purple-400' },
};

interface SearchResult {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
  tracked: boolean;
}

interface AssetLiveInfo {
  mines: number;
  pnl: number;
  setups: number;
  momentum: number | null;
  activeRules: number;
}

// ─── Page ────────────────────────────────────────────────────

export default function AnalisiPage() {
  const [analytics, setAnalytics] = useState<AssetAnalytic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [liveInfo, setLiveInfo] = useState<Record<string, AssetLiveInfo>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const d = await res.json();
        setAnalytics(d.analytics ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const trackedSymbols = analytics.map(a => a.symbol);
  const prices = useBatchPrices(trackedSymbols);

  // Load live mine/signal info per asset
  useEffect(() => {
    async function loadLive() {
      try {
        const minesRes = await fetch('/api/mine/list').then(r => r.ok ? r.json() : null);
        const mines = minesRes?.mines ?? [];
        const info: Record<string, AssetLiveInfo> = {};
        for (const sym of trackedSymbols) {
          const assetMines = mines.filter((m: any) => m.symbol === sym && (m.status === 'open' || m.status === 'waiting' || m.status === 'pending'));
          const pnl = assetMines.reduce((s: number, m: any) => s + (m.unrealizedPnl ?? 0), 0);
          info[sym] = { mines: assetMines.length, pnl, setups: 0, momentum: null, activeRules: 0 };
        }
        setLiveInfo(info);
      } catch {}
    }
    if (trackedSymbols.length > 0) loadLive();
    const i = setInterval(loadLive, 30000);
    return () => clearInterval(i);
  }, [trackedSymbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/assets/search?q=${encodeURIComponent(searchQuery)}&type=all`);
        if (res.ok) setSearchResults((await res.json()).results ?? []);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const assignAsset = async (symbol: string, type: string) => {
    setAssigning(symbol);
    try {
      await fetch(`/api/analytics/${encodeURIComponent(symbol)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetClass: type }),
      });
      setSearchQuery('');
      setSearchResults([]);
      await load();
    } catch {}
    setAssigning(null);
  };

  // Summary stats
  const totalMines = Object.values(liveInfo).reduce((s, i) => s + i.mines, 0);
  const totalPnl = Object.values(liveInfo).reduce((s, i) => s + i.pnl, 0);
  const readyCount = analytics.filter(a => a.status === 'ready').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-n-text">Centro Analisi AI</h1>
        <p className="text-xs text-n-dim mt-0.5">
          L&apos;AI monitora {analytics.length} asset 24/7, analizza lo storico e cerca opportunit&agrave; di profitto in tempo reale.
        </p>
      </div>

      {/* Summary bar */}
      {readyCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-n-card border border-n-border p-3 text-center">
            <p className="text-[10px] text-n-dim uppercase">Asset attivi</p>
            <p className="text-xl font-bold text-n-text">{readyCount}</p>
          </div>
          <div className="rounded-xl bg-n-card border border-n-border p-3 text-center">
            <p className="text-[10px] text-n-dim uppercase">Operazioni aperte</p>
            <p className="text-xl font-bold text-n-text">{totalMines}</p>
          </div>
          <div className="rounded-xl bg-n-card border border-n-border p-3 text-center">
            <p className="text-[10px] text-n-dim uppercase">Profitto aperto</p>
            <p className={`text-xl font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-n-border bg-n-card px-4 py-3">
          <Search size={16} className="text-n-dim shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Aggiungi un asset (es. BTC, ETH, Solana, AAPL...)"
            className="flex-1 bg-transparent text-sm text-n-text placeholder:text-n-dim outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-n-dim hover:text-n-text">
              <X size={14} />
            </button>
          )}
          {searching && <Loader2 size={14} className="animate-spin text-n-dim" />}
        </div>

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-n-border bg-n-card p-2 shadow-lg">
            {searchResults.map(r => (
              <div key={r.symbol} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-n-bg/60">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${r.type === 'crypto' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                    {r.type === 'crypto' ? 'CRYPTO' : 'STOCK'}
                  </span>
                  <span className="font-mono text-sm font-semibold text-n-text">{r.symbol.replace('/USD', '')}</span>
                  <span className="text-xs text-n-dim">{r.name}</span>
                </div>
                {r.tracked ? (
                  <Link href={`/analisi/${encodeURIComponent(r.symbol)}`} className="rounded-lg bg-n-bg-s px-3 py-1 text-[11px] font-medium text-n-text hover:bg-n-border">
                    Apri
                  </Link>
                ) : (
                  <button
                    onClick={() => assignAsset(r.symbol, r.type)}
                    disabled={assigning === r.symbol}
                    className="flex items-center gap-1 rounded-lg bg-blue-500/15 px-3 py-1 text-[11px] font-bold text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
                  >
                    {assigning === r.symbol ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                    Analizza
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Asset grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-n-dim" />
        </div>
      ) : analytics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 py-12 text-center">
          <Brain size={32} className="mx-auto text-n-dim mb-2" />
          <p className="text-sm text-n-text-s">Nessun asset monitorato</p>
          <p className="text-xs text-n-dim mt-1">Cerca un asset nella barra sopra per iniziare.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {analytics.map(a => {
            const price = prices.get(a.symbol);
            const info = liveInfo[a.symbol];
            const regime = regimeLabels[a.currentRegime ?? ''] ?? { text: a.currentRegime ?? '—', cls: 'text-n-dim' };
            const isTraining = a.status === 'training' || a.status === 'refreshing' || a.status === 'queued';
            const isReady = a.status === 'ready';
            const hasMines = info && info.mines > 0;

            return (
              <Link key={a.symbol} href={`/analisi/${encodeURIComponent(a.symbol)}`}
                className={`group rounded-xl border bg-n-card p-4 transition-all hover:border-n-border-b ${hasMines ? 'border-emerald-500/20' : 'border-n-border'}`}>

                {/* Row 1: Symbol + Price + Status */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-mono text-lg font-bold text-n-text">{a.symbol.replace('/USD', '')}</span>
                    {price != null && (
                      <span className="ml-2 font-mono text-sm text-n-text-s" suppressHydrationWarning>
                        {fmtPrice(price)}
                      </span>
                    )}
                  </div>
                  {isTraining ? (
                    <span className="flex items-center gap-1 rounded-lg bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                      <Loader2 size={10} className="animate-spin" />
                      Analisi...
                    </span>
                  ) : isReady ? (
                    <span className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <Activity size={10} />
                      Attiva
                    </span>
                  ) : a.status === 'failed' ? (
                    <span className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
                      <AlertTriangle size={10} />
                      Errore
                    </span>
                  ) : null}
                </div>

                {/* Row 2: Regime + Training age */}
                <div className="flex items-center justify-between text-[11px] mb-3">
                  <span className={regime.cls}>{regime.text}</span>
                  <span className="text-n-dim" suppressHydrationWarning>
                    Analisi: {formatTimeAgo(a.lastTrainedAt)}
                  </span>
                </div>

                {/* Row 3: Live trading status */}
                {isReady && (
                  <div className="border-t border-n-border pt-2">
                    {hasMines ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Target size={12} className="text-emerald-400" />
                          <span className="text-n-text font-medium">{info.mines} operazion{info.mines === 1 ? 'e' : 'i'} attiv{info.mines === 1 ? 'a' : 'e'}</span>
                        </div>
                        <span className={`font-mono text-[11px] font-bold ${info.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {info.pnl >= 0 ? '+' : ''}{info.pnl.toFixed(2)}$
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-n-dim">
                        <Zap size={12} />
                        <span>In attesa di opportunit&agrave;</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Training in progress */}
                {isTraining && (
                  <div className="border-t border-n-border pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-300">
                      <Brain size={12} />
                      <span>L&apos;AI sta studiando lo storico...</span>
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
