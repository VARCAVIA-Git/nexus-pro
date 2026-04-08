'use client';

import type { LiveContext } from '@/lib/analytics/types';
import { Activity, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

function fmtPct(v: number, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

function MomentumBadge({ score }: { score: number }) {
  const pct = Math.round(((score + 1) / 2) * 100);
  const color =
    score > 0.2 ? 'text-emerald-300 bg-emerald-500/15' : score < -0.2 ? 'text-red-300 bg-red-500/15' : 'text-n-dim bg-n-card';
  const Icon = score > 0.2 ? TrendingUp : score < -0.2 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${color}`}>
      <Icon size={12} />
      {fmtNum(score, 2)} ({pct}%)
    </span>
  );
}

export function LiveContextCard({ context }: { context: LiveContext | null | undefined }) {
  if (!context) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
          <Activity size={16} className="text-blue-400" /> Live Context
        </div>
        <p className="mt-2 text-xs text-n-dim">Nessun snapshot live disponibile. Verrà popolato al prossimo tick.</p>
      </div>
    );
  }

  const upZones = context.nearestZones.filter((z) => z.distancePct > 0);
  const downZones = context.nearestZones.filter((z) => z.distancePct <= 0);

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
          <Activity size={16} /> Live Context
        </div>
        <span className="text-[10px] text-n-dim">aggiornato {timeAgo(context.updatedAt)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Prezzo</div>
          <div className="mt-1 font-mono text-sm font-semibold text-n-text">{fmtNum(context.price, 2)}</div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Regime</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{context.regime}</div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Momentum</div>
          <div className="mt-1">
            <MomentumBadge score={context.momentumScore} />
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Vol percentile</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{context.volatilityPercentile}%</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-n-text">
          <Zap size={12} className="text-amber-400" />
          Active rules ({context.activeRules.length})
        </div>
        {context.activeRules.length === 0 ? (
          <p className="text-[11px] text-n-dim">Nessuna regola top attiva al momento.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {context.activeRules.slice(0, 6).map((r) => (
              <span
                key={r.ruleId}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono ${
                  r.directionBias === 'long' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                }`}
                title={r.ruleId}
              >
                {r.directionBias === 'long' ? '↑' : '↓'} {r.ruleId.split('+').slice(0, 2).join('+')} · {r.confidence}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-n-text">Nearest reaction zones (±3%)</div>
        {context.nearestZones.length === 0 ? (
          <p className="text-[11px] text-n-dim">Nessuna zona vicina.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {[...upZones, ...downZones].slice(0, 4).map((z, i) => (
              <div
                key={`${z.level}-${i}`}
                className="flex items-center justify-between rounded-lg bg-n-bg-s px-3 py-2 text-[11px]"
              >
                <span className="font-mono text-n-text">{fmtNum(z.level, 2)}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    z.type === 'support' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {z.type}
                </span>
                <span className="text-n-dim">{fmtPct(z.distancePct * 100, 2)}</span>
                <span className="text-n-dim">P {fmtPct(z.pBounce * 100, 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
