'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Mine, PortfolioSnapshot, MineEngineState, AggressivenessProfile } from '@/lib/mine/types';
import { PROFILES } from '@/lib/mine/constants';
import { MineCard } from '@/components/mine/MineCard';
import { PortfolioGauge } from '@/components/mine/PortfolioGauge';
import { Pickaxe, Power, PowerOff, RefreshCw, Loader2 } from 'lucide-react';

export default function MinesPage() {
  const [mines, setMines] = useState<Mine[]>([]);
  const [history, setHistory] = useState<Mine[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [engine, setEngine] = useState<MineEngineState | null>(null);
  const [profile, setProfile] = useState<AggressivenessProfile>('conservative');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [minesRes, snapRes, engineRes, profileRes] = await Promise.all([
      fetch('/api/mine/list').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/portfolio/snapshot').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/mine/engine').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/config/profile').then((r) => (r.ok ? r.json() : null)),
    ]);
    setMines(minesRes?.mines ?? []);
    setSnapshot(snapRes?.snapshot ?? null);
    setEngine(engineRes ?? null);
    setProfile(profileRes?.profile?.name ?? 'conservative');
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    const symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
    const all: Mine[] = [];
    for (const sym of symbols) {
      const r = await fetch(`/api/mine/list?status=closed&symbol=${encodeURIComponent(sym)}`);
      if (r.ok) {
        const d = await r.json();
        all.push(...(d.mines ?? []));
      }
    }
    all.sort((a, b) => (b.exitTime ?? 0) - (a.exitTime ?? 0));
    setHistory(all.slice(0, 20));
  }, []);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function toggleEngine() {
    setBusy(true);
    const action = engine?.enabled ? 'stop' : 'start';
    await fetch('/api/mine/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await load();
    setBusy(false);
  }

  async function closeMine(id: string) {
    if (!confirm('Chiudere questa mine manualmente?')) return;
    setBusy(true);
    await fetch(`/api/mine/${id}/close`, { method: 'POST' });
    await load();
    await loadHistory();
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-n-dim" />
      </div>
    );
  }

  const profileConfig = PROFILES[profile];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Pickaxe size={24} className="text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-n-text">Mine Engine</h1>
            <p className="text-xs text-n-dim">
              {engine?.enabled ? 'Attivo' : 'Spento'} · {mines.length} mine attive · Profilo:{' '}
              <span className="capitalize font-semibold text-n-text">{profile}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { load(); loadHistory(); }}
            className="flex items-center gap-2 rounded-lg bg-n-bg-s px-3 py-2 text-[11px] font-semibold text-n-text hover:bg-n-border"
          >
            <RefreshCw size={12} /> Aggiorna
          </button>
          <button
            onClick={toggleEngine}
            disabled={busy}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-50 ${
              engine?.enabled
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {engine?.enabled ? <PowerOff size={12} /> : <Power size={12} />}
            {engine?.enabled ? 'Ferma Engine' : 'Avvia Engine'}
          </button>
        </div>
      </div>

      {/* Portfolio Gauge */}
      <PortfolioGauge snapshot={snapshot} maxRiskPct={profileConfig?.maxPortfolioRiskPct ?? 10} />

      {/* Active Mines */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">
          Mine attive ({mines.length})
        </h2>
        {mines.length === 0 ? (
          <p className="text-xs text-n-dim">
            {engine?.enabled
              ? 'Nessuna mine aperta — il sistema cerca segnali ad ogni tick.'
              : 'Engine spento. Attiva il Mine Engine per iniziare.'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mines.map((m) => (
              <MineCard key={m.id} mine={m} onClose={closeMine} />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">
          Storico recente ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-n-dim">Nessuna mine chiusa.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((m) => (
              <MineCard key={m.id} mine={m} />
            ))}
          </div>
        )}
      </div>

      {/* Engine Status Footer */}
      {engine && (
        <div className="rounded-xl bg-n-bg-s p-3 text-[10px] text-n-dim flex flex-wrap gap-x-4 gap-y-1">
          <span>Ultimo tick: {engine.lastTick ? new Date(engine.lastTick).toLocaleString('it-IT') : '—'}</span>
          <span>Mine attive: {engine.activeMinesCount}</span>
          {engine.lastError && <span className="text-red-300">Errore: {engine.lastError}</span>}
        </div>
      )}
    </div>
  );
}
