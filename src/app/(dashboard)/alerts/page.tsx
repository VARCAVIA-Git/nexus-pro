'use client';

import { Bell, Plus } from 'lucide-react';

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-nexus-dim">Price & signal notifications</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-nexus-accent px-4 py-2 text-sm font-semibold text-nexus-bg hover:bg-nexus-accent/80">
          <Plus size={16} />
          New Alert
        </button>
      </div>

      <div className="rounded-xl border border-nexus-border bg-nexus-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-nexus-border text-xs text-nexus-dim">
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Triggered</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-nexus-dim">
                  <Bell size={24} className="mx-auto mb-2 opacity-50" />
                  No alerts configured. Click &quot;New Alert&quot; to create one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
