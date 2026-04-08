'use client';

import type { NewsDigest } from '@/lib/analytics/types';
import { Newspaper, ArrowUp, ArrowDown, Minus } from 'lucide-react';

function fmtSent(v: number): { label: string; cls: string; Icon: any } {
  if (v > 0.15) return { label: 'Bullish', cls: 'text-emerald-300 bg-emerald-500/15', Icon: ArrowUp };
  if (v < -0.15) return { label: 'Bearish', cls: 'text-red-300 bg-red-500/15', Icon: ArrowDown };
  return { label: 'Neutrale', cls: 'text-n-dim bg-n-card', Icon: Minus };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}g`;
}

export function NewsPulseCard({ digest }: { digest: NewsDigest | null | undefined }) {
  if (!digest || digest.count === 0) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <Newspaper size={16} className="text-amber-400" /> News Pulse
        </div>
        <p className="mt-2 text-xs text-n-dim">Nessuna news rilevante nelle ultime 24h.</p>
      </div>
    );
  }

  const sent = fmtSent(digest.avgSentiment);
  const SentIcon = sent.Icon;
  const items = digest.topItems.slice(0, 5);

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <Newspaper size={16} className="text-amber-400" /> News Pulse
        </div>
        <span className="text-[10px] text-n-dim">{digest.count} articoli · 24h</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Sentiment medio</div>
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${sent.cls}`}>
              <SentIcon size={12} /> {sent.label} ({digest.avgSentiment.toFixed(2)})
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Delta vs precedente</div>
          <div className="mt-1 font-mono text-sm font-semibold text-n-text">
            {digest.sentimentDelta24h > 0 ? '+' : ''}
            {digest.sentimentDelta24h.toFixed(3)}
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Articoli totali</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{digest.count}</div>
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 rounded-lg bg-n-bg-s px-3 py-2">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                it.sentiment > 0.1 ? 'bg-emerald-400' : it.sentiment < -0.1 ? 'bg-red-400' : 'bg-n-dim'
              }`}
            />
            <div className="flex-1 min-w-0">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[12px] font-medium text-n-text hover:text-blue-300"
                title={it.title}
              >
                {it.title}
              </a>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-n-dim">
                <span>{it.source}</span>
                <span>·</span>
                <span>{timeAgo(it.publishedAt)} fa</span>
                <span>·</span>
                <span>rel {Math.round(it.relevance * 100)}%</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
