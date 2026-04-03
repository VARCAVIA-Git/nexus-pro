'use client';

import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trades</h1>
          <p className="text-nexus-dim">Trade history & open positions</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-nexus-border px-3 py-1.5 text-sm text-nexus-dim hover:text-white">
            All
          </button>
          <button className="rounded-lg border border-nexus-border px-3 py-1.5 text-sm text-nexus-dim hover:text-white">
            Open
          </button>
          <button className="rounded-lg border border-nexus-border px-3 py-1.5 text-sm text-nexus-dim hover:text-white">
            Closed
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-nexus-border bg-nexus-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-nexus-border text-xs text-nexus-dim">
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Exit</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">P&L</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-nexus-dim">
                  No trades yet. Run a backtest or connect a broker to start trading.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
