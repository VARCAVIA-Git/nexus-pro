'use client';

import { useState, useEffect, useCallback } from 'react';
import { ASSETS, STRATEGIES, calculateRiskParams, type AssetConfig, type StrategyConfig } from '@/lib/config/assets';
import { fmtDollar, fmtPnl, fmtPercent } from '@/lib/utils/format';
import type { MultiBotConfig } from '@/types/bot';
import type { BacktestStrategySummary } from '@/lib/analytics/types';
import {
  Bot, Rocket, TrendingUp, Shield, Search, Plus, Play, Square,
  AlertTriangle, Zap, Target, Activity, Trash2, RefreshCw, X, ChevronRight,
  Pickaxe, Power, PowerOff, Brain, BarChart3, Clock, Crosshair,
} from 'lucide-react';
import type { Mine } from '@/lib/mine/types';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition-all ${checked ? 'bg-green-500' : 'bg-n-border-b'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function StrategyPage() {
  const [allBots, setAllBots] = useState<MultiBotConfig[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [accountEquity, setAccountEquity] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mine Engine state
  const [mineEnabled, setMineEnabled] = useState(false);
  const [activeMines, setActiveMines] = useState<Mine[]>([]);
  const [mineToggling, setMineToggling] = useState(false);

  // AI Rankings state
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('ai');
  const [rankings, setRankings] = useState<BacktestStrategySummary[]>([]);
  const [rankingsSymbol, setRankingsSymbol] = useState('BTC/USD');
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [selectedRanking, setSelectedRanking] = useState<BacktestStrategySummary | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formEnv, setFormEnv] = useState<'demo' | 'real'>('real');
  const [formCapital, setFormCapital] = useState(20);
  const [formAssets, setFormAssets] = useState<Set<string>>(new Set(['BTC/USD', 'ETH/USD', 'AAPL']));
  const [formStrategies, setFormStrategies] = useState<Set<string>>(new Set(['combined_ai', 'trend']));
  const [formRisk, setFormRisk] = useState(5);
  const [formTrailing, setFormTrailing] = useState(true);
  const [formMaxPos, setFormMaxPos] = useState(3);
  const [formMaxDD, setFormMaxDD] = useState(20);
  const [formMode, setFormMode] = useState<'scalp' | 'intraday' | 'daily'>('intraday');
  const [creating, setCreating] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const riskParams = calculateRiskParams(formRisk);
  const riskLabels = ['', 'Ultra Safe', 'Very Low', 'Low', 'Moderate-Low', 'Moderate', 'Moderate-High', 'High', 'Very High', 'Aggressive', 'Max Risk'];

  const fetchStatus = useCallback(async () => {
    try {
      const [botRes, engineRes, minesRes] = await Promise.all([
        fetch('/api/bot/status?mode=real'),
        fetch('/api/mine/engine').catch(() => null),
        fetch('/api/mine/list').catch(() => null),
      ]);
      if (botRes.ok) {
        const d = await botRes.json();
        setAllBots(d.bots ?? []);
        setDisabledIds(new Set<string>(Array.isArray(d.disabledIds) ? d.disabledIds : []));
        setAccountEquity(d.accountEquity ?? 0);
      }
      if (engineRes?.ok) {
        const d = await engineRes.json();
        setMineEnabled(d.enabled ?? false);
      }
      if (minesRes?.ok) {
        const d = await minesRes.json();
        setActiveMines((d.mines ?? []).filter((m: Mine) => m.status === 'open' || m.status === 'pending'));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const i = setInterval(fetchStatus, 5000);
    return () => clearInterval(i);
  }, [fetchStatus]);

  const usedCapital = allBots.filter(b => b.status !== 'stopped').reduce((s, b) => s + b.capitalPercent, 0);
  const availableCapital = 100 - usedCapital;

  const handleCreate = async () => {
    if (!formName.trim() || formAssets.size === 0 || formStrategies.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          environment: formEnv,
          capitalPercent: formCapital,
          assets: Array.from(formAssets),
          strategies: Array.from(formStrategies),
          riskLevel: formRisk,
          stopLossPercent: riskParams.stopLossATR,
          takeProfitPercent: riskParams.stopLossATR * 2,
          useTrailingStop: formTrailing,
          maxOpenPositions: formMaxPos,
          maxDDDaily: 3,
          maxDDWeekly: 8,
          maxDDTotal: formMaxDD,
        operationMode: formMode,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setFormName('');
        setRiskAccepted(false);
        await fetchStatus();
      }
    } catch {}
    setCreating(false);
  };

  const handleStart = async (id: string) => {
    await fetch('/api/bot/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id }) });
    fetchStatus();
  };

  const handleStop = async (id: string) => {
    await fetch('/api/bot/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id }) });
    fetchStatus();
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/bot/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id, action: 'delete' }) });
    fetchStatus();
  };

  const loadRankings = async (symbol: string) => {
    setRankingsLoading(true);
    setRankingsSymbol(symbol);
    setSelectedRanking(null);
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(symbol)}/backtest?summary=1`);
      if (res.ok) {
        const d = await res.json();
        // Merge from summary or full report
        const items = d.summary?.rankings ?? d.topStrategies?.map((t: any, i: number) => ({
          rank: i + 1, strategyId: t.strategyId, strategyName: t.strategyName,
          timeframe: t.timeframe, isMineRule: false, totalTrades: t.totalTrades,
          winRate: t.winRate, profitFactor: t.profitFactor, netProfitPct: t.netProfitPct,
          maxDrawdownPct: t.maxDrawdownPct, sharpe: t.sharpe,
          avgTpDistancePct: 0, avgSlDistancePct: 0, tpHitRate: 0, slHitRate: 0,
          avgHoldingHours: 0, optimalEntryTimeout: 12,
        })) ?? [];
        setRankings(items);
      } else {
        setRankings([]);
      }
    } catch { setRankings([]); }
    setRankingsLoading(false);
  };

  const handleCreateFromAI = async () => {
    if (!selectedRanking) return;
    setCreating(true);
    const r = selectedRanking;
    const tfModeMap: Record<string, string> = { '5m': 'scalp', '15m': 'scalp', '1h': 'intraday', '4h': 'daily' };
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `AI ${rankingsSymbol.replace('/USD', '')} ${r.strategyName.slice(0, 15)}`,
          environment: 'real',
          capitalPercent: formCapital,
          assets: [rankingsSymbol],
          strategies: r.isMineRule ? ['combined_ai'] : [r.strategyId],
          riskLevel: 5,
          stopLossPercent: r.avgSlDistancePct || 2,
          takeProfitPercent: r.avgTpDistancePct || 4,
          useTrailingStop: true,
          maxOpenPositions: 2,
          maxDDDaily: 3,
          maxDDWeekly: 8,
          maxDDTotal: 15,
          operationMode: tfModeMap[r.timeframe] ?? 'intraday',
          backtestStrategyId: r.strategyId,
          backtestTimeframe: r.timeframe,
          calibratedTpPct: r.avgTpDistancePct || undefined,
          calibratedSlPct: r.avgSlDistancePct || undefined,
          entryTimeoutBars: r.optimalEntryTimeout || undefined,
          usesMineRules: r.isMineRule || undefined,
          mineRuleConditions: r.conditions || undefined,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setSelectedRanking(null);
        await fetchStatus();
      }
    } catch {}
    setCreating(false);
  };

  const handleMineToggle = async () => {
    setMineToggling(true);
    try {
      await fetch('/api/mine/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mineEnabled ? 'stop' : 'start' }),
      });
      await fetchStatus();
    } catch {}
    setMineToggling(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Bot Manager</h1>
          <p className="text-xs text-n-dim" suppressHydrationWarning>
            {allBots.filter(b => b.status === 'running').length} bot attivi · Equity: {accountEquity > 0 ? fmtDollar(accountEquity) : '—'} · Capitale disponibile: {availableCapital}%
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 rounded-lg bg-n-text px-4 py-2.5 text-xs font-bold text-n-bg hover:opacity-90 transition-all w-full sm:w-auto min-h-[44px]">
          <Plus size={14} /> Nuovo Bot
        </button>
      </div>

      {/* Bot cards */}
      {allBots.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-16">
          <Bot size={40} className="text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun bot configurato</p>
          <p className="mt-1 text-xs text-n-dim">Crea il tuo primo bot per iniziare a fare trading automatico.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 flex items-center gap-2 rounded-lg bg-n-text px-4 py-2 text-xs font-bold text-n-bg hover:opacity-90 transition-all">
            <Plus size={14} /> Crea Bot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {allBots.map((bot) => {
            const isLegacyDisabled = disabledIds.has(bot.id);
            return (
            <div key={bot.id} className={`rounded-xl border p-4 transition-all ${
              isLegacyDisabled ? 'border-amber-500/40 bg-amber-500/5 opacity-80' :
              bot.status === 'running' ? 'border-green-500/30 bg-green-500/5' :
              bot.status === 'error' || bot.status === 'paused' ? 'border-red-500/30 bg-red-500/5' :
              'border-n-border bg-n-card'
            }`}>
              {/* Bot header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-n-text">{bot.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${bot.environment === 'demo' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                      {bot.environment === 'demo' ? 'DEMO' : 'LIVE'}
                    </span>
                    {isLegacyDisabled && (
                      <span
                        className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
                        title="Bot legacy disabilitato dal cleanup zombie. Non viene più eseguito dal cron tick. Usa 'Elimina definitivamente' per rimuoverlo dal database."
                      >
                        LEGACY · disabilitato
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${
                      isLegacyDisabled ? 'bg-amber-400' :
                      bot.status === 'running' ? 'bg-green-400 animate-pulse-dot' :
                      bot.status === 'error' ? 'bg-red-400' : 'bg-n-dim'
                    }`} />
                    <span className="text-[10px] text-n-dim capitalize">
                      {isLegacyDisabled ? 'fermo (legacy)' : bot.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {bot.status === 'running' ? (
                    <button onClick={() => handleStop(bot.id)} className="rounded p-1.5 text-red-400 hover:bg-red-500/10 transition-colors" title="Stop"><Square size={14} /></button>
                  ) : (
                    <button onClick={() => handleStart(bot.id)} className="rounded p-1.5 text-green-400 hover:bg-green-500/10 transition-colors" title="Start"><Play size={14} /></button>
                  )}
                  <button onClick={() => handleDelete(bot.id)} className="rounded p-1.5 text-n-dim hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>

              {/* Config summary */}
              <div className="mb-3 flex flex-wrap gap-1">
                {bot.assets.map(a => (
                  <span key={a} className="rounded bg-n-bg px-1.5 py-0.5 font-mono text-[9px] text-n-dim">{a.replace('/USD', '')}</span>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                {bot.strategies.map(s => (
                  <span key={s} className="rounded bg-n-accent-dim px-1.5 py-0.5 text-[9px] text-n-text-s">{s}</span>
                ))}
              </div>
              <p className="text-[10px] text-n-dim mb-1" suppressHydrationWarning>
                {bot.capitalPercent}% capitale · Rischio {bot.riskLevel}/10 · {bot.operationMode ?? 'intraday'}
                {bot.backtestStrategyId && <span className="ml-1 rounded bg-blue-500/15 px-1 py-0.5 text-[8px] font-bold text-blue-400">AI-CAL</span>}
                {bot.usesMineRules && <span className="ml-1 rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold text-purple-400">MINE RULE</span>}
              </p>
              {bot.calibratedTpPct && bot.calibratedSlPct && (
                <p className="text-[9px] text-n-dim mb-1">
                  TP: <span className="text-green-400">{bot.calibratedTpPct}%</span> · SL: <span className="text-red-400">{bot.calibratedSlPct}%</span>
                  {bot.backtestTimeframe && <> · TF: <span className="text-blue-400">{bot.backtestTimeframe}</span></>}
                </p>
              )}
              {bot.lastTickAt && (
                <p className="text-[9px] text-n-dim mb-2" suppressHydrationWarning>
                  Ultimo tick: {Math.round((Date.now() - new Date(bot.lastTickAt).getTime()) / 1000)}s fa
                </p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded bg-n-bg/60 p-1.5 text-center">
                  <p className={`font-mono text-[11px] font-bold ${bot.stats.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`} suppressHydrationWarning>{fmtPnl(bot.stats.pnl)}</p>
                  <p className="text-[8px] text-n-dim">P&L</p>
                </div>
                <div className="rounded bg-n-bg/60 p-1.5 text-center">
                  <p className="font-mono text-[11px] font-bold text-n-text">{bot.stats.winRate > 0 ? `${bot.stats.winRate.toFixed(0)}%` : '—'}</p>
                  <p className="text-[8px] text-n-dim">Win Rate</p>
                </div>
                <div className="rounded bg-n-bg/60 p-1.5 text-center">
                  <p className="font-mono text-[11px] font-bold text-n-text">{bot.stats.totalTrades}</p>
                  <p className="text-[8px] text-n-dim">Trades</p>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* ═══ MINE ENGINE SECTION ═══ */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Pickaxe size={18} className={mineEnabled ? 'text-green-400' : 'text-n-dim'} />
            <div>
              <h2 className="text-sm font-bold text-n-text">Mine Engine</h2>
              <p className="text-[10px] text-n-dim">
                Trading automatico AIC-driven · {activeMines.length} mine attive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/mines" className="text-[10px] text-n-dim hover:text-n-text flex items-center gap-1">
              Dettagli <ChevronRight size={10} />
            </a>
            <button
              onClick={handleMineToggle}
              disabled={mineToggling}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                mineEnabled
                  ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                  : 'bg-n-bg-s text-n-dim hover:text-n-text'
              }`}
            >
              {mineToggling ? <RefreshCw size={12} className="animate-spin" /> : mineEnabled ? <Power size={12} /> : <PowerOff size={12} />}
              {mineEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {activeMines.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeMines.slice(0, 6).map(mine => {
              const pnlColor = mine.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400';
              return (
                <div key={mine.id} className="flex items-center justify-between rounded-lg bg-n-bg/60 p-2.5">
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-n-text">{mine.symbol.replace('/USD', '')}</span>
                    <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold ${mine.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {mine.direction.toUpperCase()}
                    </span>
                    <p className="text-[9px] text-n-dim">{mine.strategy} · {mine.timeframe}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono text-[11px] font-bold ${pnlColor}`} suppressHydrationWarning>
                      {mine.unrealizedPnl >= 0 ? '+' : ''}{mine.unrealizedPnl.toFixed(2)}$
                    </p>
                    <p className="text-[9px] text-n-dim">{mine.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ CREATE BOT FORM ═══ */}
      {showCreate && (
        <div className="rounded-xl border-2 border-n-border-b bg-n-card p-5 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-n-text">Nuovo Bot</h2>
            <button onClick={() => setShowCreate(false)} className="rounded p-1 text-n-dim hover:text-n-text"><X size={16} /></button>
          </div>

          {/* Mode tabs */}
          <div className="flex rounded-lg border border-n-border">
            <button onClick={() => setCreateMode('ai')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold transition-all ${createMode === 'ai' ? 'bg-blue-500/10 text-blue-400 border-b-2 border-blue-400' : 'text-n-dim hover:text-n-text'}`}>
              <Brain size={14} /> AI Ranking
            </button>
            <button onClick={() => setCreateMode('manual')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold transition-all ${createMode === 'manual' ? 'bg-n-accent-dim text-n-text border-b-2 border-n-text' : 'text-n-dim hover:text-n-text'}`}>
              <Shield size={14} /> Manuale
            </button>
          </div>

          {/* ─── AI RANKING MODE ─── */}
          {createMode === 'ai' && (
            <div className="space-y-4">
              <p className="text-[10px] text-n-dim">Seleziona un asset analizzato dall&apos;AI. Il sistema mostrerà la classifica delle strategie testate su 2 anni di storico con $100k simulati.</p>

              {/* Asset selector */}
              <div>
                <label className="mb-2 block text-[10px] font-medium text-n-dim">Seleziona Asset</label>
                <div className="flex flex-wrap gap-2">
                  {ASSETS.filter(a => a.enabled).map(a => (
                    <button key={a.symbol} onClick={() => loadRankings(a.symbol)}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${rankingsSymbol === a.symbol && rankings.length > 0 ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-n-border text-n-dim hover:text-n-text'}`}>
                      {a.symbol.replace('/USD', '')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rankings table */}
              {rankingsLoading && (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw size={16} className="animate-spin text-n-dim" />
                  <span className="ml-2 text-xs text-n-dim">Caricamento classifica...</span>
                </div>
              )}

              {!rankingsLoading && rankings.length === 0 && (
                <div className="rounded-lg border border-dashed border-n-border p-6 text-center">
                  <Brain size={24} className="mx-auto text-n-dim mb-2" />
                  <p className="text-xs text-n-dim">Nessun backtest disponibile per {rankingsSymbol.replace('/USD', '')}.</p>
                  <p className="text-[10px] text-n-dim mt-1">Vai alla pagina <a href={`/analisi/${encodeURIComponent(rankingsSymbol)}`} className="text-blue-400 hover:underline">Analisi</a> e avvia il training AI.</p>
                </div>
              )}

              {!rankingsLoading && rankings.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] text-n-dim">{rankings.length} strategie testate su {rankingsSymbol} — clicca per selezionare</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-n-dim">
                        <tr>
                          <th className="px-2 py-1.5">#</th>
                          <th className="px-2 py-1.5">Strategia</th>
                          <th className="px-2 py-1.5">TF</th>
                          <th className="px-2 py-1.5">Trades</th>
                          <th className="px-2 py-1.5">WR</th>
                          <th className="px-2 py-1.5">PF</th>
                          <th className="px-2 py-1.5">P&L %</th>
                          <th className="px-2 py-1.5">Max DD</th>
                          <th className="px-2 py-1.5">Sharpe</th>
                          <th className="px-2 py-1.5">TP/SL</th>
                        </tr>
                      </thead>
                      <tbody className="text-n-text">
                        {rankings.slice(0, 15).map((r) => {
                          const isSelected = selectedRanking?.strategyId === r.strategyId && selectedRanking?.timeframe === r.timeframe;
                          return (
                            <tr key={`${r.strategyId}-${r.timeframe}`}
                              onClick={() => setSelectedRanking(r)}
                              className={`cursor-pointer border-t border-n-border transition-all ${isSelected ? 'bg-blue-500/10' : 'hover:bg-n-bg/60'}`}>
                              <td className="px-2 py-2 font-mono">{r.rank}</td>
                              <td className="px-2 py-2">
                                <span className="font-semibold">{r.strategyName.length > 25 ? r.strategyName.slice(0, 25) + '...' : r.strategyName}</span>
                                {r.isMineRule && <span className="ml-1 rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold text-purple-400">AI RULE</span>}
                              </td>
                              <td className="px-2 py-2 font-mono">{r.timeframe}</td>
                              <td className="px-2 py-2">{r.totalTrades}</td>
                              <td className="px-2 py-2">{r.winRate}%</td>
                              <td className="px-2 py-2">{r.profitFactor}</td>
                              <td className={`px-2 py-2 font-mono font-bold ${r.netProfitPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {r.netProfitPct >= 0 ? '+' : ''}{r.netProfitPct}%
                              </td>
                              <td className="px-2 py-2 text-red-300">{r.maxDrawdownPct}%</td>
                              <td className="px-2 py-2">{r.sharpe}</td>
                              <td className="px-2 py-2 text-[10px] text-n-dim">
                                {r.avgTpDistancePct > 0 ? `${r.avgTpDistancePct}/${r.avgSlDistancePct}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Selected strategy details */}
              {selectedRanking && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Crosshair size={14} className="text-blue-400" />
                    <span className="text-xs font-bold text-blue-400">Strategia selezionata</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[9px] text-n-dim">Strategia</p>
                      <p className="text-xs font-semibold text-n-text">{selectedRanking.strategyName}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-n-dim">Timeframe</p>
                      <p className="text-xs font-semibold text-n-text">{selectedRanking.timeframe}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-n-dim">TP medio storico</p>
                      <p className="text-xs font-semibold text-green-400">{selectedRanking.avgTpDistancePct > 0 ? `${selectedRanking.avgTpDistancePct}%` : 'auto'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-n-dim">SL medio storico</p>
                      <p className="text-xs font-semibold text-red-400">{selectedRanking.avgSlDistancePct > 0 ? `${selectedRanking.avgSlDistancePct}%` : 'auto'}</p>
                    </div>
                  </div>

                  {/* Capital slider */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-n-dim">Capitale: {formCapital}%</label>
                    <input type="range" min={5} max={Math.min(availableCapital, 100)} step={5} value={formCapital} onChange={e => setFormCapital(+e.target.value)} className="w-full accent-blue-500" />
                    <p className="mt-1 font-mono text-[10px] text-n-dim" suppressHydrationWarning>
                      {formCapital}% = {accountEquity > 0 ? fmtDollar(accountEquity * formCapital / 100) : '—'}
                    </p>
                  </div>

                  <button
                    onClick={handleCreateFromAI}
                    disabled={creating}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-blue-500 text-white hover:bg-blue-600"
                  >
                    {creating ? <><RefreshCw size={16} className="animate-spin" /> Creazione...</> : <><Rocket size={16} /> Lancia Bot AI-Calibrato</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── MANUAL MODE ─── */}
          {createMode === 'manual' && (
            <div className="space-y-5">
              {/* Step 1: Base */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Nome Bot</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="es. BTC Trend Aggressive" className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Ambiente</label>
                  <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">REAL — Alpaca Paper</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Capitale: {formCapital}%</label>
                  <input type="range" min={5} max={Math.min(availableCapital, 100)} step={5} value={formCapital} onChange={e => setFormCapital(+e.target.value)} className="w-full accent-green-500" />
                  <p className="mt-1 font-mono text-[10px] text-n-dim" suppressHydrationWarning>
                    {formCapital}% = {accountEquity > 0 ? fmtDollar(accountEquity * formCapital / 100) : '—'}
                  </p>
                </div>
              </div>

              {/* Step 2: Assets */}
              <div>
                <label className="mb-2 block text-[10px] font-medium text-n-dim">Asset ({formAssets.size} selezionati)</label>
                <div className="flex flex-wrap gap-2">
                  {ASSETS.map(a => {
                    const selected = formAssets.has(a.symbol);
                    return (
                      <button key={a.symbol} onClick={() => { const s = new Set(formAssets); if (selected) s.delete(a.symbol); else s.add(a.symbol); setFormAssets(s); }}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${selected ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-n-border text-n-dim hover:text-n-text'}`}>
                        {a.symbol.replace('/USD', '')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 3: Strategies */}
              <div>
                <label className="mb-2 block text-[10px] font-medium text-n-dim">Strategie ({formStrategies.size} attive)</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {STRATEGIES.map(s => {
                    const selected = formStrategies.has(s.key);
                    return (
                      <button key={s.key} onClick={() => { const st = new Set(formStrategies); if (selected) st.delete(s.key); else st.add(s.key); setFormStrategies(st); }}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${selected ? 'border-green-500/30 bg-green-500/5' : 'border-n-border'}`}>
                        <span className="text-lg">{s.icon}</span>
                        <div>
                          <p className="text-[11px] font-semibold text-n-text">{s.name}</p>
                          <p className="text-[9px] text-n-dim">WR {s.winRate}% · {s.riskRatio}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 4: Risk + Mode */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Rischio: {formRisk}/10 — {riskLabels[formRisk]}</label>
                  <input type="range" min={1} max={10} value={formRisk} onChange={e => setFormRisk(+e.target.value)} className="w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Max Posizioni</label>
                  <input type="number" value={formMaxPos} onChange={e => setFormMaxPos(+e.target.value)} min={1} max={10} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 font-mono text-xs text-n-text focus:border-n-border-b focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-n-dim">Max Drawdown (%)</label>
                  <input type="number" value={formMaxDD} onChange={e => setFormMaxDD(+e.target.value)} min={5} max={50} className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 font-mono text-xs text-n-text focus:border-n-border-b focus:outline-none" />
                </div>
              </div>

              {/* Operation mode */}
              <div>
                <label className="mb-2 block text-[10px] font-medium text-n-dim">Modalità Operativa</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'scalp', label: 'Scalp', desc: 'Ogni 1 min · SL stretto', icon: '⚡' },
                    { key: 'intraday', label: 'Intraday', desc: 'Ogni 5 min · SL medio', icon: '📊' },
                    { key: 'daily', label: 'Daily', desc: 'Ogni 1h · SL largo', icon: '📈' },
                  ] as const).map(m => (
                    <button key={m.key} onClick={() => setFormMode(m.key)} className={`rounded-lg border p-2.5 text-left transition-all ${formMode === m.key ? 'border-green-500/30 bg-green-500/5' : 'border-n-border'}`}>
                      <p className="text-sm">{m.icon} <span className="text-[11px] font-semibold text-n-text">{m.label}</span></p>
                      <p className="text-[9px] text-n-dim">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Real mode warning */}
              <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500" />
                <span className="text-[11px] text-red-300">Comprendo i rischi e che posso perdere il capitale investito. Confermo di voler procedere con fondi reali.</span>
              </label>

              {/* Create button */}
              <button
                onClick={handleCreate}
                disabled={creating || !formName.trim() || formAssets.size === 0 || formStrategies.size === 0 || !riskAccepted}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-accent text-white hover:opacity-90"
              >
                {creating ? <><RefreshCw size={16} className="animate-spin" /> Creazione...</> : <><Rocket size={16} /> Crea e Avvia Bot</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
