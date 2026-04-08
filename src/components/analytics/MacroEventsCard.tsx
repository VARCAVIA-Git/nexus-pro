'use client';

import type { MacroEvent } from '@/lib/analytics/types';
import { CalendarClock, AlertTriangle } from 'lucide-react';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

export function MacroEventsCard({ events }: { events: MacroEvent[] | null | undefined }) {
  const safeEvents = Array.isArray(events) ? events : [];
  if (safeEvents.length === 0) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <CalendarClock size={16} className="text-purple-400" /> Macro Events
        </div>
        <p className="mt-2 text-xs text-n-dim">In attesa di dati live (nessun evento high-impact prossimi 7 giorni).</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <CalendarClock size={16} className="text-purple-400" /> Macro Events
        </div>
        <span className="text-[10px] text-n-dim">{safeEvents.length} eventi · 7g</span>
      </div>

      <ul className="space-y-2">
        {safeEvents.slice(0, 8).map((e, i) => (
          <li key={e.id ?? `${e.name}-${i}`} className="flex items-center justify-between rounded-lg bg-n-bg-s px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {e.importance === 'high' && <AlertTriangle size={12} className="text-red-400 shrink-0" />}
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-n-text" title={e.name}>
                  {e.country ?? '—'} · {e.name ?? '—'}
                </div>
                <div className="mt-0.5 text-[10px] text-n-dim">
                  {e.scheduledAt ? fmtDate(e.scheduledAt) : '—'}
                  {e.forecast != null && ` · F: ${e.forecast}`}
                  {e.previous != null && ` · P: ${e.previous}`}
                </div>
              </div>
            </div>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${importanceColor(e.importance)}`}>
              {e.importance ?? 'low'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
