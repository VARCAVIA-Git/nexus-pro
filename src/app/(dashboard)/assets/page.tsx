'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ASSETS, type AssetConfig } from '@/lib/config/assets';
import type { AssetAnalytic, AnalyticStatus, AssetClass } from '@/lib/analytics/types';
import { Boxes, Loader2, CheckCircle2, Clock, AlertTriangle, Plus } from 'lucide-react';

type Tab = 'crypto' | 'us_stock' | 'us_etf';

const TABS: { key: Tab; label: string }[] = [
  { key: 'crypto', label: 'Crypto' },
  { key: 'us_stock', label: 'US Stocks' },
  { key: 'us_etf', label: 'ETF' },
];

function badgeFor(status: AnalyticStatus | 'unassigned') {
  switch (status) {
    case 'ready':
      return { label: 'Ready', cls: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 };
    case 'training':
      return { label: 'Training', cls: 'bg-blue-500/15 text-blue-400', Icon: Loader2 };
    case 'queued':
      return { label: 'In coda', cls: 'bg-amber-500/15 text-amber-400', Icon: Clock };
    case 'refreshing':
      return { label: 'Refresh', cls: 'bg-indigo-500/15 text-indigo-300', Icon: Loader2 };
    case 'failed':
      return { label: 'Failed', cls: 'bg-red-500/15 text-red-400', Icon: AlertTriangle };
    default:
      return { label: 'Non assegnata', cls: 'bg-n-card text-n-dim', Icon: Plus };
  }
}

function classifyAsset(a: AssetConfig): AssetClass {
  if (a.type === 'crypto') return 'crypto';
  return 'us_stock';
}

export default function AssetsPage() {
  const [tab, setTab] = useState<Tab>('crypto');
  const [analytics, setAnalytics] = useState<AssetAnalytic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/analytics');
      if (r.ok) {
        const d = await r.json();
        setAnalytics(d.analytics ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byKey = useMemo(() => {
    const m = new Map<string, AssetAnalytic>();
    analytics.forEach((a) => m.set(a.symbol, a));
    return m;
  }, [analytics]);

  const filtered = useMemo(() => {
    return ASSETS.filter((a) => {
      const cls = classifyAsset(a);
      if (tab === 'us_etf') return false; // nessun ETF in lista corrente
      return cls === tab;
    });
  }, [tab]);

  const activeCount = analytics.filter((a) => a.status !== 'unassigned').length;

  async function assign(symbol: string, assetClass: AssetClass) {
    setBusy(symbol);
    try {
      const r = await fetch(`/api/analytics/${encodeURIComponent(symbol)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetClass }),
      });
      if (r.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
            <Boxes size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-n-text">Assets</h1>
            <p className="text-xs text-n-dim">
              {ASSETS.length} asset · {activeCount} AI Analytic attive
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition-all ${
              tab === t.key ? 'bg-n-text text-n-bg' : 'bg-n-card text-n-dim hover:text-n-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-n-dim" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 py-16 text-center text-sm text-n-dim">
          Nessun asset disponibile in questa categoria.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const state = byKey.get(a.symbol);
            const status: AnalyticStatus | 'unassigned' = state?.status ?? 'unassigned';
            const b = badgeFor(status);
            const isReady = status === 'ready';
            const isUnassigned = status === 'unassigned';
            const cls = classifyAsset(a);

            return (
              <div
                key={a.symbol}
                className="rounded-2xl border border-n-border bg-n-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-n-text">{a.symbol}</div>
                    <div className="text-[11px] text-n-dim">{a.name}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${b.cls}`}
                  >
                    <b.Icon size={11} className={status === 'training' || status === 'refreshing' ? 'animate-spin' : ''} />
                    {b.label}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {isUnassigned ? (
                    <button
                      disabled={busy === a.symbol}
                      onClick={() => assign(a.symbol, cls)}
                      className="flex-1 rounded-lg bg-blue-500/15 px-3 py-2 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                    >
                      {busy === a.symbol ? 'Assegnazione…' : 'Assegna AI Analytic'}
                    </button>
                  ) : (
                    <Link
                      href={`/assets/${encodeURIComponent(a.symbol)}`}
                      className="flex-1 rounded-lg bg-n-bg-s px-3 py-2 text-center text-[11px] font-semibold text-n-text hover:bg-n-border"
                    >
                      {isReady ? 'Apri' : 'Dettaglio'}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
