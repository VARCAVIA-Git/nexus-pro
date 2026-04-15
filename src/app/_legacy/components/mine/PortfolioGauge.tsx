'use client';

import type { PortfolioSnapshot } from '@/lib/mine/types';

interface Props {
  snapshot: PortfolioSnapshot | null;
  maxRiskPct: number;
}

export function PortfolioGauge({ snapshot, maxRiskPct }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h3 className="text-sm font-semibold text-n-text">Portfolio</h3>
        <p className="mt-2 text-xs text-n-dim">Nessun dato disponibile.</p>
      </div>
    );
  }

  const usedPct = snapshot.equity > 0
    ? (snapshot.totalAllocated / snapshot.equity) * 100
    : 0;
  const riskRatio = maxRiskPct > 0 ? (usedPct / maxRiskPct) * 100 : 0;
  const barColor =
    riskRatio > 80 ? 'bg-red-400' : riskRatio > 50 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-n-text">Portfolio Snapshot</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Equity" value={`$${snapshot.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
        <Stat label="Buying Power" value={`$${snapshot.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
        <Stat label="Allocato" value={`$${snapshot.totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
        <Stat
          label="Unrealized PnL"
          value={`${snapshot.totalUnrealizedPnl >= 0 ? '+' : ''}$${snapshot.totalUnrealizedPnl.toFixed(2)}`}
          color={snapshot.totalUnrealizedPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-n-dim mb-1">
          <span>Rischio utilizzato</span>
          <span>{usedPct.toFixed(1)}% / {maxRiskPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-n-bg-s">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, riskRatio)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-n-bg-s p-3">
      <div className="text-[10px] uppercase tracking-wide text-n-dim">{label}</div>
      <div className={`mt-1 text-sm font-semibold font-mono ${color ?? 'text-n-text'}`}>{value}</div>
    </div>
  );
}
