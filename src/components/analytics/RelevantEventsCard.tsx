'use client';

// ═══════════════════════════════════════════════════════════════
// RelevantEventsCard — Phase 3.6
//
// Mostra max 3 eventi macro high-impact prossimi 7 giorni che hanno
// impatto storico noto su questo asset.
//
// Logica di selezione:
//   1. Cross-reference: macroEvents × eventImpacts (per eventName)
//   2. Se il match dà 0 risultati (tipico per crypto, eventImpacts vuoto),
//      fallback: mostra eventi high-impact USD generici (rilevanti per
//      tutto il mercato).
//   3. Badge "IMMINENTE" rosso se l'evento è < 2h di distanza.
//
// Renderizzata sopra alla sezione Top Rules nella pagina /assets/[symbol].
// ═══════════════════════════════════════════════════════════════

import type { MacroEvent, EventImpactStat } from '@/lib/analytics/types';
import { Bell, AlertTriangle } from 'lucide-react';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SelectedEvent {
  event: MacroEvent;
  impact: EventImpactStat | null;
  isImminent: boolean;
  isFallback: boolean;
}

function selectRelevantEvents(
  events: MacroEvent[] | null | undefined,
  impacts: EventImpactStat[] | null | undefined,
  symbol: string,
): SelectedEvent[] {
  void symbol;
  const safeEvents = Array.isArray(events) ? events : [];
  const safeImpacts = Array.isArray(impacts) ? impacts : [];
  const now = Date.now();

  // Eventi futuri high-impact entro 7 giorni
  const upcoming = safeEvents.filter(
    (e) =>
      e?.scheduledAt != null &&
      e.scheduledAt >= now &&
      e.scheduledAt <= now + SEVEN_DAYS_MS &&
      e.importance === 'high',
  );
  if (upcoming.length === 0) return [];

  // Indicizza impacts per nome
  const impactByName = new Map<string, EventImpactStat>();
  for (const imp of safeImpacts) {
    if (imp?.eventName) impactByName.set(imp.eventName, imp);
  }

  // Match: eventi con impact storico noto
  const matched: SelectedEvent[] = [];
  for (const e of upcoming) {
    const imp = impactByName.get(e.name);
    if (imp) {
      matched.push({
        event: e,
        impact: imp,
        isImminent: e.scheduledAt - now < TWO_HOURS_MS,
        isFallback: false,
      });
    }
  }

  if (matched.length > 0) {
    return matched.sort((a, b) => a.event.scheduledAt - b.event.scheduledAt).slice(0, 3);
  }

  // Fallback: nessun matching impact (tipico per crypto). Mostra USD high-impact.
  const fallback = upcoming
    .filter((e) => e.country === 'USD')
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .slice(0, 3)
    .map((e) => ({
      event: e,
      impact: null,
      isImminent: e.scheduledAt - now < TWO_HOURS_MS,
      isFallback: true,
    }));
  return fallback;
}

// Esportata anche per test
export { selectRelevantEvents };

export function RelevantEventsCard({
  events,
  eventImpacts,
  symbol,
}: {
  events: MacroEvent[] | null | undefined;
  eventImpacts: EventImpactStat[] | null | undefined;
  symbol: string;
}) {
  const items = selectRelevantEvents(events, eventImpacts, symbol);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <Bell size={16} className="text-purple-400" /> Eventi rilevanti
        </div>
        <p className="mt-2 text-xs text-n-dim">
          Nessun evento high-impact rilevante per {symbol} nei prossimi 7 giorni.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-200">
          <Bell size={16} /> Eventi rilevanti per {symbol}
        </div>
        <span className="text-[10px] text-n-dim">{items.length} evento{items.length > 1 ? 'i' : ''} · 7g</span>
      </div>

      <ul className="space-y-2">
        {items.map(({ event, impact, isImminent, isFallback }, i) => (
          <li
            key={event.id ?? `${event.name}-${i}`}
            className="flex items-start justify-between gap-3 rounded-lg bg-n-bg-s px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {isImminent ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                    <AlertTriangle size={9} /> IMMINENTE
                  </span>
                ) : (
                  <span className="text-sm">⚠️</span>
                )}
                <span className="text-[12px] font-medium text-n-text truncate" title={event.name}>
                  {event.name}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-n-dim">
                {event.country} · {fmtDateTime(event.scheduledAt)}
              </div>
              {impact && (
                <div className="mt-1 text-[10px] text-purple-300">
                  Storicamente {symbol} {impact.direction === 'up' ? '↑' : impact.direction === 'down' ? '↓' : '↔'}{' '}
                  {Math.abs(impact.avgReturn24h).toFixed(2)}% in 24h ·{' '}
                  WR {impact.winRate.toFixed(0)}% · N={impact.sampleSize}
                </div>
              )}
              {isFallback && !impact && (
                <div className="mt-1 text-[10px] text-n-dim italic">
                  Nessun storico per questo asset · evento globale rilevante
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
