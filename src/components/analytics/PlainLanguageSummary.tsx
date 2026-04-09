'use client';

import { Bot } from 'lucide-react';
import type {
  AnalyticReport,
  LiveContext,
  NewsDigest,
  MacroEvent,
  EventImpactStat,
} from '@/lib/analytics/types';
import { generateNarrative } from '@/lib/analytics/narrative';

interface Props {
  symbol: string;
  report: AnalyticReport | null | undefined;
  liveContext?: LiveContext | null;
  newsDigest?: NewsDigest | null;
  macroEvents?: MacroEvent[] | null;
  eventImpacts?: EventImpactStat[] | null;
}

function timeAgo(ts: number | undefined | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'pochi sec fa';
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

export function PlainLanguageSummary(props: Props) {
  const text = generateNarrative({
    symbol: props.symbol,
    report: props.report,
    liveContext: props.liveContext,
    newsDigest: props.newsDigest,
    macroEvents: props.macroEvents,
    eventImpacts: props.eventImpacts ?? props.report?.eventImpacts,
  });

  const updatedAt =
    props.liveContext?.updatedAt ?? props.report?.generatedAt ?? Date.now();

  return (
    <div className="rounded-2xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/5 p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300">
          <Bot size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-n-text">Riassunto in italiano</h2>
          <p className="text-[10px] text-n-dim">
            Generato automaticamente dall&apos;AI Analytic
          </p>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-n-text">{text}</p>
      <p className="mt-3 text-[10px] text-n-dim">
        Aggiornato {timeAgo(updatedAt)} · Dati storici osservati nel passato
      </p>
    </div>
  );
}
