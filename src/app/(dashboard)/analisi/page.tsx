'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { AssetAnalytic } from '@/lib/analytics/types';
import { useBatchPrices } from '@/hooks/useLivePrice';
import {
  Brain, Loader2, CheckCircle2, Clock, AlertTriangle, Plus,
  Search, RefreshCw, TrendingUp, TrendingDown, X,
} from 'lucide-react';

function badgeFor(status: string) {
  switch (status) {
    case 'ready': return { label: 'Attiva', cls: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 };
    case 'training': case 'refreshing': return { label: 'Training...', cls: 'bg-blue-500/15 text-blue-400', Icon: Loader2 };
    case 'queued': return { label: 'In coda', cls: 'bg-amber-500/15 text-amber-400', Icon: Clock };
    case 'failed': return { label: 'Errore', cls: 'bg-red-500/15 text-red-400', Icon: AlertTriangle };
    default: return { label: 'Non avviata', cls: 'bg-n-bg-s text-n-dim', Icon: Clock };
  }
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min}m fa`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs / 24)}g fa`;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
  tracked: boolean;
}

export default function AnalisiPage() {
  const [analytics, setAnalytics] = useState<AssetAnalytic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'crypto' | 'stock'>('all');

  // Load tracked analytics
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

  // Batch prices for tracked assets
  const trackedSymbols = analytics.map(a => a.symbol);
  const prices = useBatchPrices(trackedSymbols);

  // V2: Load mine counts and evaluator status per asset
  const [assetMeta, setAssetMeta] = useState<Record<string, { mines: number; signal: string | null; setups: number }>>({});
  useEffect(() => {
    async function loadMeta() {
      try {
        const [minesRes, snapRes] = await Promise.all([
          fetch('/api/mine/list').then(r => r.ok ? r.json() : null),
          fetch('/api/portfolio/snapshot').then(r => r.ok ? r.json() : null),
        ]);
        const mines = minesRes?.mines ?? [];
        const meta: Record<string, { mines: number; signal: string | null; setups: number }> = {};
        for (const sym of trackedSymbols) {
          const assetMines = mines.filter((m: any) => m.symbol === sym && (m.status === 'open' || m.status === 'waiting' || m.status === 'pending'));
          meta[sym] = { mines: assetMines.length, signal: null, setups: 0 };
        }
        setAssetMeta(meta);
      } catch {}
    }
    if (trackedSymbols.length > 0) loadMeta();
  }, [trackedSymbols.join(',')]);

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/assets/search?q=${encodeURIComponent(searchQuery)}&type=${filter === 'all' ? 'all' : filter}`);
        if (res.ok) {
          const d = await res.json();
          setSearchResults(d.results ?? []);
        }
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filter]);

  // Assign (add) new asset
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

  // Filter analytics
  const filtered = analytics.filter(a => {
    if (filter === 'crypto') return a.symbol.includes('/');
    if (filter === 'stock') return !a.symbol.includes('/');
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">AI Analytics</h1>
          <p className="text-xs text-n-dim">{analytics.length} asset monitorati · l&apos;AI analizza 24/7</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-n-border bg-n-card px-4 py-3">
          <Search size={16} className="text-n-dim shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca asset da analizzare (es. BTC, AAPL, Solana...)"
            className="flex-1 bg-transparent text-sm text-n-text placeholder:text-n-dim outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="text-n-dim hover:text-n-text">
              <X size={14} />
            </button>
          )}
          {searching && <Loader2 size={14} className="animate-spin text-n-dim" />}
        </div>

        {/* Search results dropdown */}
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

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-n-border p-1">
        {(['all', 'crypto', 'stock'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${filter === f ? 'bg-n-accent-dim text-n-text' : 'text-n-dim hover:text-n-text'}`}>
            {f === 'all' ? 'Tutti' : f === 'crypto' ? 'Crypto' : 'Stocks'}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-n-dim" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 py-12 text-center">
          <Brain size={32} className="mx-auto text-n-dim mb-2" />
          <p className="text-sm text-n-text-s">Nessun asset analizzato</p>
          <p className="text-xs text-n-dim mt-1">Cerca un asset nella barra sopra per iniziare l&apos;analisi AI.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(a => {
            const badge = badgeFor(a.status);
            const price = prices.get(a.symbol);
            const isCrypto = a.symbol.includes('/');
            return (
              <Link key={a.symbol} href={`/analisi/${encodeURIComponent(a.symbol)}`}
                className="group rounded-xl border border-n-border bg-n-card p-4 hover:border-n-border-b transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-n-text">{a.symbol.replace('/USD', '')}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${isCrypto ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {isCrypto ? 'CRYPTO' : 'STOCK'}
                      </span>
                    </div>
                    {price && (
                      <p className="mt-0.5 font-mono text-sm text-n-text-s" suppressHydrationWarning>
                        ${price.toLocaleString('en-US', { minimumFractionDigits: price < 10 ? 2 : 0, maximumFractionDigits: price < 10 ? 2 : 0 })}
                      </p>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                    <badge.Icon size={10} className={a.status === 'training' || a.status === 'refreshing' ? 'animate-spin' : ''} />
                    {badge.label}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-n-dim">
                  <span>Regime: <span className="text-n-text-s">{a.currentRegime ?? '—'}</span></span>
                  <span suppressHydrationWarning>Training: {formatTimeAgo(a.lastTrainedAt)}</span>
                </div>

                {/* V2: Mine count + status */}
                {assetMeta[a.symbol] && assetMeta[a.symbol].mines > 0 && (
                  <div className="mt-2 pt-2 border-t border-n-border flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400 font-semibold">
                      <TrendingUp size={10} />
                      {assetMeta[a.symbol].mines} mine attive
                    </span>
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
