'use client';

import { Wallet, TrendingUp, BarChart3, PieChart } from 'lucide-react';

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <p className="text-nexus-dim">Account overview & positions</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-nexus-dim">Balance</p>
            <Wallet size={18} className="text-nexus-accent" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">$10,000.00</p>
          <p className="mt-1 text-xs text-nexus-dim">Paper Trading</p>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-nexus-dim">Realized P&L</p>
            <TrendingUp size={18} className="text-nexus-green" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">$0.00</p>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-nexus-dim">Unrealized P&L</p>
            <BarChart3 size={18} className="text-nexus-yellow" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">$0.00</p>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-nexus-dim">Open Positions</p>
            <PieChart size={18} className="text-nexus-blue" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-nexus-dim">Positions</h3>
          <div className="flex h-48 items-center justify-center text-nexus-dim text-sm">
            No open positions
          </div>
        </div>
        <div className="rounded-xl border border-nexus-border bg-nexus-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-nexus-dim">Allocation</h3>
          <div className="flex h-48 items-center justify-center text-nexus-dim text-sm">
            No allocation data
          </div>
        </div>
      </div>
    </div>
  );
}
