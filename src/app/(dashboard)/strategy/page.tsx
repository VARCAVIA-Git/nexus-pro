'use client';

import { useState, useEffect, useCallback } from 'react';
import { ASSETS, STRATEGIES, calculateRiskParams, type AssetConfig, type StrategyConfig } from '@/lib/config/assets';
import { fmtDollar, fmtPnl, fmtPercent } from '@/lib/utils/format';
import { useModeStore } from '@/stores/mode-store';
import type { MultiBotConfig } from '@/types/bot';
import {
  Bot, Rocket, TrendingUp, Shield, Search, Plus, Play, Square,
  AlertTriangle, Zap, Target, Activity, Trash2, RefreshCw, X, ChevronRight,
} from 'lucide-react';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition-all ${checked ? 'bg-green-500' : 'bg-n-border-b'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function StrategyPage() {
  const mode = useModeStore((s) => s.mode);
  const [allBots, setAllBots] = useState<MultiBotConfig[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [accountEquity, setAccountEquity] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formEnv, setFormEnv] = useState<'demo' | 'real'>(mode);
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
      const res = await fetch(`/api/bot/status?mode=${mode}`);
      if (res.ok) {
        const d = await res.json();
        setAllBots(d.bots ?? []);
        setDisabledIds(new Set<string>(Array.isArray(d.disabledIds) ? d.disabledIds : []));
        setAccountEquity(d.accountEquity ?? 0);
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

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      {/* Strategy V2 banner */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
            <Zap size={16} />
          </div>
          <div className="flex-1 text-xs">
            <div className="mb-1 font-semibold text-blue-300">Strategy V2 in arrivo</div>
            <p className="text-n-dim">
              Ogni Strategy userà le AI Analytic dei tuoi asset.{' '}
              <a href="/assets" className="font-semibold text-blue-300 underline-offset-2 hover:underline">
                Vai su /assets
              </a>{' '}
              per assegnarle.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Strategy Manager</h1>
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
              </p>
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

      {/* ═══ CREATE BOT FORM ═══ */}
      {showCreate && (
        <div className="rounded-xl border-2 border-n-border-b bg-n-card p-5 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-n-text">Nuovo Bot</h2>
            <button onClick={() => setShowCreate(false)} className="rounded p-1 text-n-dim hover:text-n-text"><X size={16} /></button>
          </div>

          {/* Step 1: Base */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Nome Bot</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="es. BTC Trend Aggressive" className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Ambiente</label>
              <div className="flex rounded-lg border border-n-border">
                <button onClick={() => setFormEnv('demo')} className={`flex-1 py-2 text-xs font-semibold transition-colors ${formEnv === 'demo' ? 'bg-amber-500/15 text-amber-400' : 'text-n-dim'}`}>Demo</button>
                <button onClick={() => setFormEnv('real')} className={`flex-1 py-2 text-xs font-semibold transition-colors ${formEnv === 'real' ? 'bg-blue-500/15 text-blue-400' : 'text-n-dim'}`}>Real</button>
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

          {/* Step 4: Risk */}
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
          {formEnv === 'real' && (
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500" />
              <span className="text-[11px] text-red-300">Comprendo i rischi e che posso perdere il capitale investito. Confermo di voler procedere con fondi reali.</span>
            </label>
          )}

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={creating || !formName.trim() || formAssets.size === 0 || formStrategies.size === 0 || (formEnv === 'real' && !riskAccepted)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              formEnv === 'demo' ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-red-500 text-white hover:bg-red-400'
            }`}
          >
            {creating ? <><RefreshCw size={16} className="animate-spin" /> Creazione...</> : <><Rocket size={16} /> Crea e Avvia Bot — {formEnv === 'demo' ? 'DEMO' : 'REAL'}</>}
          </button>
        </div>
      )}
    </div>
  );
}
