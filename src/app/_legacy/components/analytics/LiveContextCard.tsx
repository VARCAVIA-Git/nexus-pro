'use client';

import { useEffect, useState } from 'react';
import type { LiveContext } from '@/lib/analytics/types';
import { TrendingUp, TrendingDown, Minus, Zap, RadioTower, RefreshCw, Activity } from 'lucide-react';
import { useLivePrice } from '@/hooks/useLivePrice';

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'ora';
  if (sec < 60) return `${sec}s fa`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m fa`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h fa`;
}

function fmtNum(v: number, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function fmtPct(v: number, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
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

function LiveContextPlaceholder({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-n-text">
        <Activity size={16} className="text-blue-400" /> Live Context
      </div>
      <p className="mt-2 text-xs text-n-dim">{msg}</p>
    </div>
  );
}

export function LiveContextCard({ context, symbol, onRefresh }: { context: LiveContext | null | undefined; symbol?: string; onRefresh?: () => void }) {
  const livePrice = useLivePrice(symbol ?? '');

  // Auto-refresh timeAgo display every 10s
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(id); }, []);

  if (!context) {
    return <LiveContextPlaceholder msg="In attesa di dati live (verrà popolato al prossimo tick)." />;
  }

  // Defensive: legacy/partial LiveContext può non avere alcuni campi.
  // Tutto è null-safe da qui in poi.
  const activeRules = Array.isArray(context.activeRules) ? context.activeRules : [];
  const nearestZones = Array.isArray(context.nearestZones) ? context.nearestZones : [];
  const upZones = nearestZones.filter((z) => z?.distancePct != null && z.distancePct > 0);
  const downZones = nearestZones.filter((z) => z?.distancePct != null && z.distancePct <= 0);

  const hasMinimumShape =
    typeof context.price === 'number' && typeof context.regime === 'string';
  if (!hasMinimumShape) {
    return <LiveContextPlaceholder msg="Live context in formato legacy. Sarà aggiornato al prossimo tick." />;
  }

  // Use live price if available, fallback to context price
  const displayPrice = livePrice.price ?? context.price;
  const priceIsLive = livePrice.price !== null;
  const regimeLabels: Record<string, string> = {
    TRENDING_UP: 'Trend rialzista', TRENDING_DOWN: 'Trend ribassista',
    RANGING: 'Laterale', VOLATILE: 'Volatile',
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
            <RadioTower size={16} className="animate-pulse" /> AI Live Monitor
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ATTIVA
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button onClick={onRefresh} className="rounded p-1 text-n-dim hover:text-n-text transition-colors" title="Aggiorna contesto">
              <RefreshCw size={12} />
            </button>
          )}
          <span className="text-[10px] text-n-dim" suppressHydrationWarning>
            Aggiornato {context.updatedAt ? formatTimeAgo(context.updatedAt) : '—'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-n-dim">Prezzo {priceIsLive ? 'live' : 'snapshot'}</div>
            {priceIsLive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-n-text">${fmtNum(displayPrice, 2)}</div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Andamento</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{regimeLabels[context.regime] ?? context.regime}</div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Momentum</div>
          <div className="mt-1">
            <MomentumBadge score={context.momentumScore ?? 0} />
          </div>
        </div>
        <div className="rounded-xl bg-n-bg-s p-3">
          <div className="text-[10px] uppercase tracking-wide text-n-dim">Volatilità</div>
          <div className="mt-1 text-sm font-semibold text-n-text">{context.volatilityPercentile ?? 0}<span className="text-[10px] text-n-dim">/100</span></div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-n-text">
          <Zap size={12} className="text-amber-400" />
          Active rules ({activeRules.length})
        </div>
        {activeRules.length === 0 ? (
          <p className="text-[11px] text-n-dim">Nessuna regola top attiva al momento.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeRules.slice(0, 6).map((r) => (
              <span
                key={r.ruleId}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono ${
                  r.directionBias === 'long' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                }`}
                title={r.ruleId}
              >
                {r.directionBias === 'long' ? '↑' : '↓'}{' '}
                {(r.ruleId ?? '').split('+').slice(0, 2).join('+')} · {r.confidence ?? 0}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-n-text">
          {nearestZones.length > 0 ? 'Reaction zones (±3%)' : 'Reaction zones più vicine'}
        </div>
        {nearestZones.length === 0 ? (
          <p className="text-[11px] text-n-dim">In attesa di dati live (nessuna zona indicata dal live observer).</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {nearestZones.slice(0, 3).map((z, i) => {
              const pBouncePct = (z.pBounce ?? 0) * 100;
              const isStrongSupport = z.type === 'support' && pBouncePct >= 70;
              const isStrongResistance = z.type === 'resistance' && pBouncePct >= 70;
              const cls = isStrongSupport
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : isStrongResistance
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-n-border bg-n-bg-s';
              const distancePct = z.distancePct ?? 0;
              return (
                <div
                  key={`${z.level}-${i}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] ${cls}`}
                >
                  <span className="font-mono text-n-text">{fmtNum(z.level, 2)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      z.type === 'support' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {z.type}
                  </span>
                  <span
                    className={`font-mono ${
                      Math.abs(distancePct) > 0.03 ? 'text-amber-300' : 'text-n-dim'
                    }`}
                  >
                    {Math.abs(distancePct) > 0.03 ? '+' : ''}
                    {(distancePct * 100).toFixed(2)}%
                  </span>
                  <span className="text-n-dim">P {fmtPct(pBouncePct, 0)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
