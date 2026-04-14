'use client';

import type { Mine } from '@/lib/mine/types';
import { formatPnl, formatPnlPct, calcUnrealizedPnlPct } from '@/lib/mine/utils';
import { ArrowUpRight, ArrowDownRight, Clock, Timer, X } from 'lucide-react';

function statusColor(status: Mine['status']): string {
  switch (status) {
    case 'waiting': return 'bg-purple-500/15 text-purple-300';
    case 'open': return 'bg-emerald-500/15 text-emerald-300';
    case 'pending': return 'bg-blue-500/15 text-blue-300';
    case 'closing': return 'bg-amber-500/15 text-amber-300';
    case 'closed': return 'bg-n-card text-n-dim';
    case 'cancelled': return 'bg-red-500/15 text-red-300';
    case 'expired': return 'bg-n-card text-amber-400/60';
  }
}

function statusLabel(status: Mine['status']): string {
  switch (status) {
    case 'waiting': return 'LIMIT';
    case 'expired': return 'SCADUTA';
    default: return status;
  }
}

function outcomeColor(outcome: Mine['outcome']): string {
  switch (outcome) {
    case 'tp_hit': return 'text-emerald-300';
    case 'sl_hit': return 'text-red-300';
    case 'trailing_exit': return 'text-emerald-300';
    case 'timeout': return 'text-amber-300';
    case 'manual': return 'text-n-dim';
    case 'limit_expired': return 'text-amber-400';
    default: return 'text-n-dim';
  }
}

/** Format a remaining time from ms to human-readable. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'scaduta';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  mine: Mine;
  currentPrice?: number;
  onClose?: (id: string) => void;
}

export function MineCard({ mine, currentPrice, onClose }: Props) {
  const isActive = mine.status === 'open' || mine.status === 'pending' || mine.status === 'waiting';
  const isWaiting = mine.status === 'waiting';
  const pnlPct = mine.entryPrice && currentPrice
    ? calcUnrealizedPnlPct(mine, currentPrice)
    : mine.realizedPnl != null && mine.entryPrice
      ? ((mine.exitPrice ?? 0) - mine.entryPrice) / mine.entryPrice * 100 * (mine.direction === 'long' ? 1 : -1)
      : 0;
  const pnl = mine.realizedPnl ?? mine.unrealizedPnl ?? 0;

  // Phase 6: limit order countdown
  const limitRemainingMs = isWaiting && mine.limitCreatedAt && mine.limitTimeoutMs
    ? Math.max(0, mine.limitTimeoutMs - (Date.now() - mine.limitCreatedAt))
    : null;

  return (
    <div className={`rounded-xl border bg-n-bg-s p-4 space-y-3 ${isWaiting ? 'border-purple-500/30' : 'border-n-border'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mine.direction === 'long' ? (
            <ArrowUpRight size={16} className="text-emerald-400" />
          ) : (
            <ArrowDownRight size={16} className="text-red-400" />
          )}
          <span className="text-sm font-semibold text-n-text">{mine.symbol}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor(mine.status)}`}>
            {statusLabel(mine.status)}
          </span>
          {mine.entryOrderType === 'limit' && mine.status !== 'waiting' && (
            <span className="rounded px-1 py-0.5 text-[9px] text-purple-400 bg-purple-500/10">LIMIT</span>
          )}
        </div>
        {isActive && onClose && (
          <button
            onClick={() => onClose(mine.id)}
            className="rounded-lg p-1.5 text-n-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title={isWaiting ? 'Annulla ordine' : 'Chiudi mine'}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Phase 6: Limit order info bar */}
      {isWaiting && mine.limitPrice != null && (
        <div className="flex items-center justify-between rounded-lg bg-purple-500/10 px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 text-purple-300">
            <Timer size={12} />
            <span>Target: <span className="font-mono font-semibold">{mine.limitPrice.toFixed(2)}</span></span>
          </div>
          {limitRemainingMs != null && (
            <span className="text-purple-400">
              Scade tra {formatCountdown(limitRemainingMs)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-n-dim">Strategia</div>
          <div className="font-medium text-n-text capitalize">{mine.evaluatorSource ?? mine.strategy}</div>
        </div>
        <div>
          <div className="text-n-dim">Direzione</div>
          <div className={`font-medium ${mine.direction === 'long' ? 'text-emerald-300' : 'text-red-300'}`}>
            {mine.direction.toUpperCase()}
          </div>
        </div>
        <div>
          <div className="text-n-dim">Profilo</div>
          <div className="font-medium text-n-text capitalize">{mine.profile}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <div>
          <div className="text-n-dim">{isWaiting ? 'Target' : 'Entry'}</div>
          <div className="font-mono text-n-text">
            {isWaiting
              ? mine.limitPrice?.toFixed(2) ?? '—'
              : mine.entryPrice?.toFixed(2) ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-n-dim">TP</div>
          <div className="font-mono text-emerald-300">{mine.takeProfit.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-n-dim">SL</div>
          <div className="font-mono text-red-300">{mine.stopLoss.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-n-dim">Qty</div>
          <div className="font-mono text-n-text">{mine.quantity}</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-n-border pt-2">
        <div className="flex items-center gap-2 text-[10px] text-n-dim">
          <Clock size={10} />
          <span>
            {mine.entryTime
              ? new Date(mine.entryTime).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : isWaiting && mine.limitCreatedAt
                ? new Date(mine.limitCreatedAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—'}
          </span>
          {mine.outcome && (
            <span className={`ml-2 font-semibold ${outcomeColor(mine.outcome)}`}>
              {mine.outcome === 'limit_expired' ? 'ordine scaduto' : mine.outcome.replace('_', ' ')}
            </span>
          )}
        </div>
        {!isWaiting && (
          <div className={`text-sm font-bold font-mono ${pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {formatPnl(pnl)} ({formatPnlPct(pnlPct)})
          </div>
        )}
      </div>
    </div>
  );
}
