'use client';

import { useState } from 'react';
import type { MacroEvent, EventImpactStat } from '@/lib/analytics/types';
import { CalendarClock, AlertTriangle, Info } from 'lucide-react';
import { surpriseColor } from '@/lib/analytics/macro/event-direction';
import { impactDirectionLabel } from '@/lib/analytics/labels';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function importanceColor(imp: MacroEvent['importance']): string {
  switch (imp) {
    case 'high':
      return 'bg-red-500/15 text-red-300';
    case 'medium':
      return 'bg-amber-500/15 text-amber-300';
    default:
      return 'bg-n-card text-n-dim';
  }
}

interface Props {
  events: MacroEvent[] | null | undefined;
  eventImpacts?: EventImpactStat[] | null;
  symbol?: string;
}

export function MacroEventsCard({ events, eventImpacts, symbol }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const safeEvents = Array.isArray(events) ? events : [];
  const impacts = Array.isArray(eventImpacts) ? eventImpacts : [];
  const impactsByName = new Map<string, EventImpactStat>();
  for (const i of impacts) {
    if (i?.eventName) impactsByName.set(i.eventName, i);
  }

  const InfoButton = (
    <button
      type="button"
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => setShowInfo(false)}
      onFocus={() => setShowInfo(true)}
      onBlur={() => setShowInfo(false)}
      className="relative ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-n-border text-[9px] text-n-dim hover:text-n-text"
      aria-label="Info su Macro Events"
    >
      <Info size={9} />
      {showInfo && (
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-72 -translate-x-1/2 rounded-lg border border-n-border bg-n-bg-s p-2.5 text-[10px] font-normal leading-snug text-n-text shadow-xl">
          Eventi economici programmati da ForexFactory (fonte ufficiale, aggiornata
          automaticamente). <span className="text-blue-300">forecast</span> è la previsione
          degli analisti prima dell&apos;evento, <span className="text-blue-300">actual</span>{' '}
          il valore pubblicato dopo. La differenza (sorpresa) è quella che muove i mercati.
        </span>
      )}
    </button>
  );

  if (safeEvents.length === 0) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <CalendarClock size={16} className="text-purple-400" /> Macro Events
          {InfoButton}
        </div>
        <p className="mt-2 text-xs text-n-dim">
          In attesa di dati live (nessun evento high-impact prossimi 7 giorni).
        </p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <CalendarClock size={16} className="text-purple-400" /> Macro Events
          {InfoButton}
        </div>
        <span className="text-[10px] text-n-dim">{safeEvents.length} eventi · 7g</span>
      </div>

      <ul className="space-y-2">
        {safeEvents.slice(0, 8).map((e, i) => {
          const isPast = (e.scheduledAt ?? 0) < now;
          const hasActual = e.actual != null;
          const hasForecast = e.forecast != null;
          const surprise =
            isPast && hasActual && hasForecast
              ? Number(e.actual) - Number(e.forecast)
              : null;
          const surpClr =
            isPast && hasActual && hasForecast
              ? surpriseColor(e.name ?? '', e.actual, e.forecast)
              : 'neutral';
          const impact = impactsByName.get(e.name);

          const surpriseClass =
            surpClr === 'green'
              ? 'bg-emerald-500/15 text-emerald-300'
              : surpClr === 'red'
              ? 'bg-red-500/15 text-red-300'
              : 'bg-n-card text-n-dim';

          return (
            <li
              key={e.id ?? `${e.name}-${i}`}
              className="flex items-start justify-between gap-3 rounded-lg bg-n-bg-s px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {e.importance === 'high' && (
                    <AlertTriangle size={12} className="text-red-400 shrink-0" />
                  )}
                  <div className="truncate text-[12px] font-medium text-n-text" title={e.name}>
                    {e.country ?? '—'} · {e.name ?? '—'}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-n-dim">
                  <span>{e.scheduledAt ? fmtDate(e.scheduledAt) : '—'}</span>
                  {hasForecast && <span>· F: <span className="font-mono text-n-text">{e.forecast}</span></span>}
                  {hasActual && <span>· A: <span className="font-mono text-n-text">{e.actual}</span></span>}
                  {!hasActual && !isPast && hasForecast && (
                    <span className="italic">· in attesa</span>
                  )}
                </div>
                {/* Sorpresa colorata per eventi passati */}
                {surprise != null && (
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${surpriseClass}`}
                    >
                      Sorpresa: {surprise > 0 ? '+' : ''}
                      {surprise.toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Impatto storico inline per eventi futuri matchati */}
                {!isPast && impact && (impact.sampleSize ?? 0) >= 1 && (
                  <div
                    className={`mt-1 text-[10px] ${
                      (impact.avgReturn24h ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    Storicamente {symbol ?? 'l\'asset'} ha reagito{' '}
                    {impactDirectionLabel(impact.direction)}: {(impact.avgReturn24h ?? 0) >= 0 ? '+' : ''}
                    {(impact.avgReturn24h ?? 0).toFixed(2)}% nelle 24h (WR{' '}
                    {Math.round(impact.winRate ?? 0)}%, n={impact.sampleSize})
                    {(impact.sampleSize ?? 0) < 5 && (
                      <span className="ml-1 italic text-n-dim">(campione piccolo)</span>
                    )}
                  </div>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${importanceColor(
                  e.importance,
                )}`}
              >
                {e.importance ?? 'low'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
