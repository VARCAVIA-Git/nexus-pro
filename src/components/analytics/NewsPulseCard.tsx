'use client';

import { useState } from 'react';
import type { NewsDigest } from '@/lib/analytics/types';
import { Newspaper, ArrowUp, ArrowDown, Minus, RefreshCw } from 'lucide-react';
import { sentimentLabel } from '@/lib/analytics/labels';

function fmtSent(v: number): { label: string; cls: string; Icon: any } {
  if (v > 0.15) return { label: 'Bullish', cls: 'text-emerald-300 bg-emerald-500/15', Icon: ArrowUp };
  if (v < -0.15) return { label: 'Bearish', cls: 'text-red-300 bg-red-500/15', Icon: ArrowDown };
  return { label: 'Neutrale', cls: 'text-n-dim bg-n-card', Icon: Minus };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return '0 sec';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} sec`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}g`;
}

function itemSentimentBadge(score: number) {
  if (score > 0.1)
    return { dot: 'bg-emerald-400', label: 'positivo', cls: 'text-emerald-300' };
  if (score < -0.1)
    return { dot: 'bg-red-400', label: 'negativo', cls: 'text-red-300' };
  return { dot: 'bg-n-dim', label: 'neutro', cls: 'text-n-dim' };
}

const FRESH_THRESHOLD_MS = 10 * 60 * 1000;

interface Props {
  digest: NewsDigest | null | undefined;
  symbol?: string;
  onRefresh?: () => Promise<void> | void;
}

export function NewsPulseCard({ digest, symbol, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (symbol) {
        await fetch(
          `/api/cron/news-tick?symbol=${encodeURIComponent(symbol)}`,
          { method: 'POST', credentials: 'include' },
        ).catch(() => {});
      }
      if (onRefresh) await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const topItems = Array.isArray(digest?.topItems) ? digest!.topItems : [];
  const count = digest?.count ?? topItems.length;

  if (!digest || count === 0) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
            <Newspaper size={16} className="text-amber-400" /> News Pulse
          </div>
          {symbol && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 rounded-lg border border-n-border px-2 py-1 text-[10px] text-n-dim hover:text-n-text disabled:opacity-50"
              title="Aggiorna le notizie ora"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              Aggiorna
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-n-dim">
          Nessuna news nelle ultime 24 ore per questo asset.
        </p>
      </div>
    );
  }

  const avgSentiment = typeof digest.avgSentiment === 'number' ? digest.avgSentiment : 0;
  const delta24h = typeof digest.sentimentDelta24h === 'number' ? digest.sentimentDelta24h : 0;
  const sent = fmtSent(avgSentiment);
  const SentIcon = sent.Icon;
  const items = topItems.slice(0, 5);
  const updatedAt = digest.updatedAt ?? Date.now();

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <Newspaper size={16} className="text-amber-400" /> News Pulse
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-n-dim">aggiornato {timeAgo(updatedAt)} fa</span>
          {symbol && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 rounded-lg border border-n-border px-2 py-1 text-[10px] text-n-dim hover:text-n-text disabled:opacity-50"
              title="Aggiorna le notizie ora"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              Aggiorna
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Sentiment medio</div>
          <div className="mt-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${sent.cls}`}
            >
              <SentIcon size={12} /> {sentimentLabel(avgSentiment)}
              <span className="ml-1 font-mono text-[10px] text-n-dim">
                ({avgSentiment.toFixed(2)})
              </span>
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Delta vs precedente</div>
          <div className="mt-1 font-mono text-sm font-semibold text-n-text">
            {delta24h > 0 ? '+' : ''}
            {delta24h.toFixed(3)}
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Articoli totali</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{count}</div>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((it, i) => {
          const itemBadge = itemSentimentBadge(it.sentiment ?? 0);
          const isFresh = (it.publishedAt ?? 0) > Date.now() - FRESH_THRESHOLD_MS;
          const titleText = (it.title ?? '').length > 90 ? (it.title ?? '').slice(0, 87) + '…' : it.title ?? '';
          return (
            <li
              key={it.id ?? it.url ?? `${i}`}
              className={`flex items-start gap-2 rounded-lg bg-n-bg-s px-3 py-2 ${
                i === 0 && isFresh ? 'ring-1 ring-blue-400/40 animate-pulse-dot' : ''
              }`}
            >
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${itemBadge.dot}`} />
              <div className="flex-1 min-w-0">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[12px] font-medium text-n-text hover:text-blue-300"
                  title={it.title}
                >
                  {titleText}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-n-dim">
                  <span className="rounded bg-n-card px-1 py-0.5 font-mono uppercase tracking-wide">
                    {it.source ?? '—'}
                  </span>
                  <span>{it.publishedAt ? `${timeAgo(it.publishedAt)} fa` : '—'}</span>
                  <span>·</span>
                  <span className={itemBadge.cls}>{itemBadge.label}</span>
                  <span>·</span>
                  <span>rel {Math.round((it.relevance ?? 0) * 100)}%</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
