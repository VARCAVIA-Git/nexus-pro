'use client';

import { Briefcase, TrendingUp, TrendingDown, Activity } from 'lucide-react';

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-nexus-dim">{label}</p>
        <Icon size={18} className={color} />
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-nexus-dim">{sub}</p>}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-nexus-dim">Trading analytics overview</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Portfolio Value" value="$10,000.00" sub="Paper Trading" icon={Briefcase} color="text-nexus-accent" />
        <StatCard label="Total P&L" value="$0.00" sub="0 trades" icon={TrendingUp} color="text-nexus-green" />
        <StatCard label="Win Rate" value="—" sub="No data yet" icon={Activity} color="text-nexus-yellow" />
        <StatCard label="Max Drawdown" value="—" sub="No data yet" icon={TrendingDown} color="text-nexus-red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-nexus-dim">Equity Curve</h3>
          <div className="flex h-48 items-center justify-center text-nexus-dim">
            Run a backtest to see your equity curve
          </div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-nexus-dim">Recent Signals</h3>
          <div className="flex h-48 items-center justify-center text-nexus-dim">
            No signals yet
          </div>
        </div>
      </div>
    </div>
  );
}
