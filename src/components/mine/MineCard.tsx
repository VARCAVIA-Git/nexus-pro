'use client';

import type { Mine } from '@/lib/mine/types';
import { formatPnl, formatPnlPct, calcUnrealizedPnlPct } from '@/lib/mine/utils';
import { ArrowUpRight, ArrowDownRight, Clock, X } from 'lucide-react';

function statusColor(status: Mine['status']): string {
  switch (status) {
    case 'open': return 'bg-emerald-500/15 text-emerald-300';
    case 'pending': return 'bg-blue-500/15 text-blue-300';
    case 'closing': return 'bg-amber-500/15 text-amber-300';
    case 'closed': return 'bg-n-card text-n-dim';
    case 'cancelled': return 'bg-red-500/15 text-red-300';
  }
}

function outcomeColor(outcome: Mine['outcome']): string {
  switch (outcome) {
    case 'tp_hit': return 'text-emerald-300';
    case 'sl_hit': return 'text-red-300';
    case 'trailing_exit': return 'text-emerald-300';
    case 'timeout': return 'text-amber-300';
    case 'manual': return 'text-n-dim';
    default: return 'text-n-dim';
  }
}

interface Props {
  mine: Mine;
  currentPrice?: number;
  onClose?: (id: string) => void;
}

export function MineCard({ mine, currentPrice, onClose }: Props) {
  const isActive = mine.status === 'open' || mine.status === 'pending';
  const pnlPct = mine.entryPrice && currentPrice
    ? calcUnrealizedPnlPct(mine, currentPrice)
    : mine.realizedPnl != null && mine.entryPrice
      ? ((mine.exitPrice ?? 0) - mine.entryPrice) / mine.entryPrice * 100 * (mine.direction === 'long' ? 1 : -1)
      : 0;
  const pnl = mine.realizedPnl ?? mine.unrealizedPnl ?? 0;

  return (
    <div className="rounded-xl border border-n-border bg-n-bg-s p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mine.direction === 'long' ? (
            <ArrowUpRight size={16} className="text-emerald-400" />
          ) : (
            <ArrowDownRight size={16} className="text-red-400" />
          )}
          <span className="text-sm font-semibold text-n-text">{mine.symbol}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusColor(mine.status)}`}>
            {mine.status}
          </span>
        </div>
        {isActive && onClose && (
          <button
            onClick={() => onClose(mine.id)}
            className="rounded-lg p-1.5 text-n-dim hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Chiudi mine"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-n-dim">Strategia</div>
          <div className="font-medium text-n-text capitalize">{mine.strategy}</div>
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
          <div className="text-n-dim">Entry</div>
          <div className="font-mono text-n-text">{mine.entryPrice?.toFixed(2) ?? '—'}</div>
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
              : '—'}
          </span>
          {mine.outcome && (
            <span className={`ml-2 font-semibold ${outcomeColor(mine.outcome)}`}>
              {mine.outcome.replace('_', ' ')}
            </span>
          )}
        </div>
        <div className={`text-sm font-bold font-mono ${pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
          {formatPnl(pnl)} ({formatPnlPct(pnlPct)})
        </div>
      </div>
    </div>
  );
}
