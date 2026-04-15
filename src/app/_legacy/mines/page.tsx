'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Mine, PortfolioSnapshot, MineEngineState, AggressivenessProfile, AICStatus, SetupScorecard } from '@/lib/mine/types';
import { PROFILES } from '@/lib/mine/constants';
import { MineCard } from '@/components/mine/MineCard';
import { PortfolioGauge } from '@/components/mine/PortfolioGauge';
import { Pickaxe, Power, PowerOff, RefreshCw, Loader2, Brain } from 'lucide-react';

export default function MinesPage() {
  const [mines, setMines] = useState<Mine[]>([]);
  const [history, setHistory] = useState<Mine[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [engine, setEngine] = useState<MineEngineState | null>(null);
  const [profile, setProfile] = useState<AggressivenessProfile>('conservative');
  const [aicStatus, setAicStatus] = useState<AICStatus | null>(null);
  const [scorecards, setScorecards] = useState<SetupScorecard[]>([]);
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
    // Phase 4.5: AIC status + scorecards
    fetch('/api/aic/status?symbol=BTC%2FUSD').then((r) => (r.ok ? r.json() : null)).then((d) => setAicStatus(d?.status ?? null)).catch(() => {});
    fetch('/api/scorecard/BTC%2FUSD').then((r) => (r.ok ? r.json() : null)).then((d) => setScorecards(d?.scorecards ?? [])).catch(() => {});
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

      {/* AIC Status Bar */}
      {aicStatus && (
        <div className="flex items-center gap-3 rounded-xl bg-n-bg-s p-3 text-[11px]">
          <Brain size={14} className="text-purple-400" />
          <span className="text-n-dim">AIC:</span>
          <span className={aicStatus.status === 'online' ? 'text-emerald-300' : 'text-red-300'}>
            {aicStatus.status}
          </span>
          {aicStatus.regime && (
            <>
              <span className="text-n-dim">·</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                aicStatus.regime === 'BULL' ? 'bg-emerald-500/15 text-emerald-300' :
                aicStatus.regime === 'BEAR' ? 'bg-red-500/15 text-red-300' :
                aicStatus.regime === 'CHOP' ? 'bg-amber-500/15 text-amber-300' :
                'bg-n-card text-n-dim'
              }`}>
                {aicStatus.regime}
              </span>
            </>
          )}
          {aicStatus.confluence && (
            <>
              <span className="text-n-dim">· Confluence:</span>
              <span className="font-mono font-semibold text-n-text">{Math.round(aicStatus.confluence.score * 100)}%</span>
              <span className={`text-[10px] ${
                aicStatus.confluence.bias === 'BULLISH' ? 'text-emerald-300' :
                aicStatus.confluence.bias === 'BEARISH' ? 'text-red-300' : 'text-n-dim'
              }`}>
                {aicStatus.confluence.bias}
              </span>
            </>
          )}
        </div>
      )}

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

      {/* Signal Scorecard */}
      {scorecards.length > 0 && (
        <div className="rounded-2xl border border-n-border bg-n-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-n-text">
            Signal Scorecard ({scorecards.length} setup)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Setup</th>
                  <th className="px-2 py-1.5">Trades</th>
                  <th className="px-2 py-1.5">WR Reale</th>
                  <th className="px-2 py-1.5">Avg PnL</th>
                  <th className="px-2 py-1.5">Conf Accuracy</th>
                  <th className="px-2 py-1.5">Ultimi</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {scorecards.map((sc) => (
                  <tr key={sc.setup_name} className="border-t border-n-border">
                    <td className="px-2 py-1.5 font-mono text-[10px]">{sc.setup_name}</td>
                    <td className="px-2 py-1.5">{sc.total_executed}</td>
                    <td className={`px-2 py-1.5 font-semibold ${sc.real_win_rate >= 0.5 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {(sc.real_win_rate * 100).toFixed(1)}%
                    </td>
                    <td className={`px-2 py-1.5 font-mono ${sc.avg_pnl_pct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {sc.avg_pnl_pct >= 0 ? '+' : ''}{sc.avg_pnl_pct.toFixed(2)}%
                    </td>
                    <td className={`px-2 py-1.5 ${sc.confidence_accuracy >= 0.8 ? 'text-emerald-300' : sc.confidence_accuracy < 0.5 ? 'text-red-300' : 'text-n-text'}`}>
                      {(sc.confidence_accuracy * 100).toFixed(0)}%
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-0.5">
                        {(sc.last_10_outcomes ?? []).slice(-5).map((o, i) => (
                          <span key={i} className={`h-2 w-2 rounded-full ${
                            o === 'tp_hit' || o === 'trailing_exit' ? 'bg-emerald-400' :
                            o === 'sl_hit' ? 'bg-red-400' : 'bg-amber-400'
                          }`} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
