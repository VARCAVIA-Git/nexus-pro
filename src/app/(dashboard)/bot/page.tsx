'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import type { MultiBotConfig } from '@/types/bot';
import type { BacktestStrategySummary } from '@/lib/analytics/types';
import type { Mine } from '@/lib/mine/types';
import Link from 'next/link';
import {
  Bot, Rocket, Plus, Play, Square, Trash2, RefreshCw, X,
  Pickaxe, Power, PowerOff, Brain, Crosshair, Wallet, ChevronRight,
  Loader2, AlertTriangle, TrendingUp,
} from 'lucide-react';

// ── Main wrapper (Suspense for useSearchParams) ──

export default function BotPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>}>
      <BotPage />
    </Suspense>
  );
}

// ── Bot Page ──

function BotPage() {
  const searchParams = useSearchParams();

  // State
  const [bots, setBots] = useState<MultiBotConfig[]>([]);
  const [equity, setEquity] = useState(0);
  const [cash, setCash] = useState(0);
  const [mode, setMode] = useState<'live' | 'paper'>('paper');
  const [loading, setLoading] = useState(true);

  // Mine engine
  const [mineEnabled, setMineEnabled] = useState(false);
  const [activeMines, setActiveMines] = useState<Mine[]>([]);
  const [mineToggling, setMineToggling] = useState(false);

  // Create bot
  const [showCreate, setShowCreate] = useState(false);
  const [rankings, setRankings] = useState<BacktestStrategySummary[]>([]);
  const [rankingsSymbol, setRankingsSymbol] = useState('BTC/USD');
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [selectedRankings, setSelectedRankings] = useState<BacktestStrategySummary[]>([]);
  const [capitalPct, setCapitalPct] = useState(15);
  const [creating, setCreating] = useState(false);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    const [botRes, accRes, engineRes, minesRes] = await Promise.allSettled([
      fetch('/api/bot/status?mode=real'),
      fetch('/api/broker/account'),
      fetch('/api/mine/engine').catch(() => null),
      fetch('/api/mine/list').catch(() => null),
    ]);
    if (botRes.status === 'fulfilled' && botRes.value.ok) {
      const d = await botRes.value.json();
      setBots((d.bots ?? []).filter((b: any) => b.status !== 'stopped' || Date.now() - new Date(b.createdAt).getTime() < 86400000));
    }
    if (accRes.status === 'fulfilled' && accRes.value.ok) {
      const d = await accRes.value.json();
      setEquity(d.equity ?? 0);
      setCash(d.cash ?? 0);
      setMode(d.mode ?? 'paper');
    }
    if (engineRes?.status === 'fulfilled' && engineRes.value?.ok) {
      const d = await engineRes.value.json();
      setMineEnabled(d.enabled ?? false);
    }
    if (minesRes?.status === 'fulfilled' && minesRes.value?.ok) {
      const d = await minesRes.value.json();
      setActiveMines((d.mines ?? []).filter((m: Mine) => m.status === 'open' || m.status === 'pending'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 10000); return () => clearInterval(i); }, [fetchAll]);

  // URL params: pre-select strategy from analisi page
  useEffect(() => {
    const sym = searchParams.get('symbol');
    const strat = searchParams.get('strategy');
    const tf = searchParams.get('tf');
    if (sym && strat && tf) {
      setShowCreate(true);
      setRankingsSymbol(sym);
      const pre: BacktestStrategySummary = {
        rank: 1, strategyId: strat, strategyName: searchParams.get('strategyName') ?? strat,
        timeframe: tf, isMineRule: searchParams.get('isMine') === '1',
        conditions: searchParams.get('conditions')?.split(',').filter(Boolean),
        totalTrades: 0, winRate: parseFloat(searchParams.get('wr') ?? '0'),
        profitFactor: parseFloat(searchParams.get('pf') ?? '0'), netProfitPct: 0,
        maxDrawdownPct: 0, sharpe: 0, avgTpDistancePct: parseFloat(searchParams.get('tp') ?? '0'),
        avgSlDistancePct: parseFloat(searchParams.get('sl') ?? '0'), tpHitRate: 0, slHitRate: 0,
        avgHoldingHours: 0, optimalEntryTimeout: parseInt(searchParams.get('timeout') ?? '12'),
      };
      setSelectedRankings([pre]);
      loadRankings(sym);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeBots = bots.filter(b => b.status === 'running');
  const usedCapital = activeBots.reduce((s, b) => s + b.capitalPercent, 0);

  // Load rankings for an asset
  const loadRankings = async (symbol: string) => {
    setRankingsLoading(true);
    setRankingsSymbol(symbol);
    setSelectedRankings([]);
    try {
      const res = await fetch(`/api/analytics/${encodeURIComponent(symbol)}/backtest?summary=1`);
      if (res.ok) {
        const d = await res.json();
        setRankings(d.summary?.rankings ?? d.topStrategies ?? []);
      } else setRankings([]);
    } catch { setRankings([]); }
    setRankingsLoading(false);
  };

  // Create bot from selected strategies
  const handleCreateBot = async () => {
    if (selectedRankings.length === 0) return;
    setCreating(true);
    const primary = selectedRankings[0];
    const tfMap: Record<string, string> = { '5m': 'scalp', '15m': 'scalp', '1h': 'intraday', '4h': 'daily' };
    const allIds = [...new Set(selectedRankings.map(r => r.isMineRule ? 'combined_ai' : r.strategyId))];
    const avgTp = selectedRankings.reduce((s, r) => s + (r.avgTpDistancePct || 0), 0) / selectedRankings.length;
    const avgSl = selectedRankings.reduce((s, r) => s + (r.avgSlDistancePct || 0), 0) / selectedRankings.length;
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `AI ${rankingsSymbol.replace('/USD', '')} ${selectedRankings.length > 1 ? selectedRankings.length + ' strategie' : primary.strategyName.slice(0, 15)}`,
          environment: 'real', capitalPercent: capitalPct,
          assets: [rankingsSymbol], strategies: allIds, riskLevel: 5,
          stopLossPercent: avgSl || 2, takeProfitPercent: avgTp || 4,
          useTrailingStop: true, maxOpenPositions: selectedRankings.length + 1,
          maxDDDaily: 3, maxDDWeekly: 8, maxDDTotal: 15,
          operationMode: tfMap[primary.timeframe] ?? 'intraday',
          backtestStrategyId: primary.strategyId, backtestTimeframe: primary.timeframe,
          calibratedTpPct: avgTp || undefined, calibratedSlPct: avgSl || undefined,
          entryTimeoutBars: primary.optimalEntryTimeout || undefined,
          usesMineRules: selectedRankings.some(r => r.isMineRule) || undefined,
          mineRuleConditions: selectedRankings.filter(r => r.isMineRule && r.conditions).flatMap(r => r.conditions!) || undefined,
        }),
      });
      if (res.ok) { setShowCreate(false); setSelectedRankings([]); await fetchAll(); }
    } catch {}
    setCreating(false);
  };

  // Bot controls
  const startBot = async (id: string) => { await fetch('/api/bot/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id }) }); fetchAll(); };
  const stopBot = async (id: string) => { await fetch('/api/bot/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id }) }); fetchAll(); };
  const deleteBot = async (id: string) => { if (!confirm('Eliminare questo bot?')) return; await fetch('/api/bot/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: id, action: 'delete' }) }); fetchAll(); };

  // Mine engine toggle
  const toggleMine = async () => {
    setMineToggling(true);
    await fetch('/api/mine/engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mineEnabled ? 'stop' : 'start' }) }).catch(() => {});
    await fetchAll();
    setMineToggling(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Trading Center</h1>
          <p className="text-xs text-n-dim" suppressHydrationWarning>
            {activeBots.length} bot attiv{activeBots.length === 1 ? 'o' : 'i'} ·{' '}
            Equity: <span className="text-n-text font-mono">{equity > 0 ? fmtDollar(equity) : '—'}</span> ·{' '}
            <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${mode === 'live' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {mode === 'live' ? 'LIVE' : 'PAPER'}
            </span>
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-600 transition-all w-full sm:w-auto">
          <Plus size={14} /> Nuovo Bot
        </button>
      </div>

      {/* ═══ ACCOUNT STATS ═══ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Equity" value={equity > 0 ? fmtDollar(equity) : '—'} icon={Wallet} />
        <StatCard label="Capitale usato" value={`${usedCapital}%`} icon={TrendingUp} color={usedCapital > 80 ? 'text-red-400' : undefined} />
        <StatCard label="Bot attivi" value={String(activeBots.length)} icon={Bot} color={activeBots.length > 0 ? 'text-green-400' : undefined} />
        <StatCard label="Mine attive" value={String(activeMines.length)} icon={Pickaxe} color={activeMines.length > 0 ? 'text-green-400' : undefined} />
      </div>

      {/* ═══ ACTIVE BOTS ═══ */}
      {bots.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-n-text">Bot configurati</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {bots.map(bot => (
              <div key={bot.id} className={`rounded-xl border p-4 transition-all ${
                bot.status === 'running' ? 'border-green-500/30 bg-green-500/5' :
                bot.status === 'error' || bot.status === 'paused' ? 'border-red-500/30 bg-red-500/5' :
                'border-n-border bg-n-card'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-n-text">{bot.name}</h3>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${bot.status === 'running' ? 'bg-green-400 animate-pulse' : bot.status === 'error' ? 'bg-red-400' : 'bg-n-dim'}`} />
                      <span className="text-[10px] text-n-dim capitalize">{bot.status}</span>
                      {bot.backtestStrategyId && <span className="rounded bg-blue-500/15 px-1 py-0.5 text-[8px] font-bold text-blue-400">AI</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {bot.status === 'running' ? (
                      <button onClick={() => stopBot(bot.id)} className="rounded p-1.5 text-red-400 hover:bg-red-500/10" title="Stop"><Square size={14} /></button>
                    ) : (
                      <button onClick={() => startBot(bot.id)} className="rounded p-1.5 text-green-400 hover:bg-green-500/10" title="Start"><Play size={14} /></button>
                    )}
                    <button onClick={() => deleteBot(bot.id)} className="rounded p-1.5 text-n-dim hover:text-red-400" title="Elimina"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {bot.assets.map(a => <span key={a} className="rounded bg-n-bg px-1.5 py-0.5 font-mono text-[9px] text-n-dim">{a.replace('/USD', '')}</span>)}
                </div>
                <p className="text-[10px] text-n-dim mb-2" suppressHydrationWarning>
                  {bot.capitalPercent}% capitale · {bot.operationMode ?? 'intraday'}
                  {bot.calibratedTpPct ? ` · TP ${bot.calibratedTpPct}% SL ${bot.calibratedSlPct}%` : ''}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <MiniStat label="P&L" value={fmtPnl(bot.stats.pnl)} color={bot.stats.pnl >= 0 ? 'text-green-400' : 'text-red-400'} />
                  <MiniStat label="Win Rate" value={bot.stats.winRate > 0 ? `${bot.stats.winRate.toFixed(0)}%` : '—'} />
                  <MiniStat label="Trades" value={String(bot.stats.totalTrades)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MINE ENGINE ═══ */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Pickaxe size={18} className={mineEnabled ? 'text-green-400' : 'text-n-dim'} />
            <div>
              <h2 className="text-sm font-bold text-n-text">Mine Engine</h2>
              <p className="text-[10px] text-n-dim">{activeMines.length} mine attive · Trading automatico AI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/mines" className="text-[10px] text-n-dim hover:text-n-text flex items-center gap-1">Dettagli <ChevronRight size={10} /></Link>
            <button onClick={toggleMine} disabled={mineToggling}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${mineEnabled ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'bg-n-bg-s text-n-dim hover:text-n-text'}`}>
              {mineToggling ? <RefreshCw size={12} className="animate-spin" /> : mineEnabled ? <Power size={12} /> : <PowerOff size={12} />}
              {mineEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        {activeMines.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeMines.slice(0, 6).map(mine => (
              <div key={mine.id} className="flex items-center justify-between rounded-lg bg-n-bg/60 p-2.5">
                <div>
                  <span className="font-mono text-[11px] font-semibold text-n-text">{mine.symbol.replace('/USD', '')}</span>
                  <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold ${mine.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {mine.direction.toUpperCase()}
                  </span>
                  <p className="text-[9px] text-n-dim">{mine.strategy} · {mine.timeframe}</p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-[11px] font-bold ${mine.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} suppressHydrationWarning>
                    {mine.unrealizedPnl >= 0 ? '+' : ''}{mine.unrealizedPnl.toFixed(2)}$
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ EMPTY STATE ═══ */}
      {bots.length === 0 && !showCreate && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 py-12 text-center">
          <Bot size={40} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun bot configurato</p>
          <p className="mt-1 text-xs text-n-dim">Vai su AI Analytics, analizza un asset, poi clicca &quot;Lancia Bot&quot; dalla classifica strategie.</p>
          <div className="flex justify-center gap-3 mt-4">
            <Link href="/analisi" className="rounded-lg bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20">AI Analytics</Link>
            <button onClick={() => setShowCreate(true)} className="rounded-lg bg-n-bg-s px-4 py-2 text-xs font-semibold text-n-text hover:bg-n-border">Crea manualmente</button>
          </div>
        </div>
      )}

      {/* ═══ CREATE BOT ═══ */}
      {showCreate && (
        <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/5 p-5 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-blue-300 flex items-center gap-2"><Brain size={16} /> Crea Bot da AI Ranking</h2>
            <button onClick={() => { setShowCreate(false); setSelectedRankings([]); }} className="rounded p-1 text-n-dim hover:text-n-text"><X size={16} /></button>
          </div>

          <p className="text-[10px] text-n-dim">Seleziona un asset, poi scegli le strategie dalla classifica AI. Il bot userà TP/SL calibrati dal backtest storico.</p>

          {/* Asset selector */}
          <div className="flex flex-wrap gap-2">
            {['BTC/USD', 'ETH/USD', 'SOL/USD'].map(sym => (
              <button key={sym} onClick={() => loadRankings(sym)}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${rankingsSymbol === sym && rankings.length > 0 ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-n-border text-n-dim hover:text-n-text'}`}>
                {sym.replace('/USD', '')}
              </button>
            ))}
          </div>

          {/* Rankings */}
          {rankingsLoading && <div className="py-4 text-center"><Loader2 size={16} className="mx-auto animate-spin text-n-dim" /></div>}

          {!rankingsLoading && rankings.length === 0 && (
            <p className="py-4 text-center text-xs text-n-dim">Nessun backtest disponibile. <Link href={`/analisi/${encodeURIComponent(rankingsSymbol)}`} className="text-blue-400 hover:underline">Avvia l&apos;analisi AI</Link></p>
          )}

          {!rankingsLoading && rankings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-n-dim">
                  <tr>
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5">Strategia</th>
                    <th className="px-2 py-1.5">TF</th>
                    <th className="px-2 py-1.5">Trades</th>
                    <th className="px-2 py-1.5">WR</th>
                    <th className="px-2 py-1.5">PF</th>
                    <th className="px-2 py-1.5">P&L</th>
                  </tr>
                </thead>
                <tbody className="text-n-text">
                  {rankings.slice(0, 10).map(r => {
                    const isSelected = selectedRankings.some(s => s.strategyId === r.strategyId && s.timeframe === r.timeframe);
                    return (
                      <tr key={`${r.strategyId}-${r.timeframe}`} onClick={() => {
                        if (isSelected) setSelectedRankings(prev => prev.filter(s => !(s.strategyId === r.strategyId && s.timeframe === r.timeframe)));
                        else setSelectedRankings(prev => [...prev, r]);
                      }} className={`cursor-pointer border-t border-n-border transition-all ${isSelected ? 'bg-blue-500/10' : 'hover:bg-n-bg/60'}`}>
                        <td className="px-2 py-2"><input type="checkbox" checked={isSelected} readOnly className="h-3.5 w-3.5 accent-blue-500" /></td>
                        <td className="px-2 py-2 font-semibold">
                          {r.strategyName.length > 25 ? r.strategyName.slice(0, 25) + '…' : r.strategyName}
                          {r.isMineRule && <span className="ml-1 rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold text-purple-400">AI</span>}
                          {r.strategyId.startsWith('ga_') && <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-bold text-emerald-400">GA</span>}
                        </td>
                        <td className="px-2 py-2 font-mono">{r.timeframe}</td>
                        <td className="px-2 py-2">{r.totalTrades}</td>
                        <td className="px-2 py-2">{r.winRate}%</td>
                        <td className="px-2 py-2">{r.profitFactor}</td>
                        <td className={`px-2 py-2 font-mono ${r.netProfitPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{r.netProfitPct >= 0 ? '+' : ''}{r.netProfitPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Selected + Launch */}
          {selectedRankings.length > 0 && (
            <div className="space-y-3 rounded-lg border border-blue-500/30 bg-n-bg/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400">{selectedRankings.length} strategi{selectedRankings.length === 1 ? 'a' : 'e'} selezionat{selectedRankings.length === 1 ? 'a' : 'e'}</span>
                <button onClick={() => setSelectedRankings([])} className="text-[10px] text-n-dim hover:text-n-text">Reset</button>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-n-dim">Capitale: {capitalPct}%</label>
                <input type="range" min={5} max={Math.min(100 - usedCapital, 100)} step={5} value={capitalPct} onChange={e => setCapitalPct(+e.target.value)} className="w-full accent-blue-500" />
                <p className="mt-1 font-mono text-[10px] text-n-dim" suppressHydrationWarning>{capitalPct}% = {equity > 0 ? fmtDollar(equity * capitalPct / 100) : '—'}</p>
              </div>
              <button onClick={handleCreateBot} disabled={creating}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30 bg-blue-500 text-white hover:bg-blue-600">
                {creating ? <><Loader2 size={16} className="animate-spin" /> Creazione...</> : <><Rocket size={16} /> Lancia Bot</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Components ──

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-n-dim">{label}</p>
        <Icon size={14} className={color ?? 'text-n-dim'} />
      </div>
      <p className={`mt-1.5 font-mono text-lg font-bold ${color ?? 'text-n-text'}`} suppressHydrationWarning>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded bg-n-bg/60 p-1.5 text-center">
      <p className={`font-mono text-[11px] font-bold ${color ?? 'text-n-text'}`} suppressHydrationWarning>{value}</p>
      <p className="text-[8px] text-n-dim">{label}</p>
    </div>
  );
}
