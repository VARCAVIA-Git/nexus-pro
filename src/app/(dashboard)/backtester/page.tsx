'use client';

import { useState, useEffect, useRef } from 'react';
import { BarChart3, Play, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Check, X } from 'lucide-react';

const PRESETS = [
  { id: 'btc_only',       label: 'Solo BTC',           assets: ['BTC/USD'] },
  { id: 'crypto_diverse', label: 'Crypto Diversified', assets: ['BTC/USD', 'ETH/USD', 'SOL/USD'] },
  { id: 'multi_class_5',  label: 'Multi-Class (5)',    assets: ['BTC/USD', 'ETH/USD', 'AAPL', 'NVDA', 'SPY'] },
  { id: 'multi_class_8',  label: 'Multi-Class (8)',    assets: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ'] },
];

type Tab = 'overview' | 'asset' | 'monthly' | 'rules' | 'trades';

export default function BacktesterPage() {
  const [preset, setPreset] = useState('crypto_diverse');
  const [months, setMonths] = useState(3);
  const [risk, setRisk] = useState(1.5);
  const [tpMult, setTpMult] = useState(3);
  const [slMult, setSlMult] = useState(1.5);
  const [signalSource, setSignalSource] = useState<'strategies' | 'deepmap' | 'both'>('strategies');

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activePreset = PRESETS.find(p => p.id === preset)!;

  const fetchStatus = async (id: string) => {
    try {
      const r = await fetch(`/api/backtester?id=${id}`);
      if (!r.ok) return;
      const d = await r.json();
      setJob(d);
      if (d.phase === 'done') {
        if (pollRef.current) clearInterval(pollRef.current);
        const rr = await fetch('/api/backtester', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'results', id }) });
        if (rr.ok) setResults(await rr.json());
      }
      if (d.phase === 'error') {
        if (pollRef.current) clearInterval(pollRef.current);
        setErr(d.error ?? 'Failed');
      }
    } catch {}
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const start = async () => {
    setErr(''); setJob(null); setResults(null); setJobId(null);
    try {
      const r = await fetch('/api/backtester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start', preset, months,
          riskPerTrade: risk, tpMultiplier: tpMult, slMultiplier: slMult,
          initialCapital: 10000,
          signalSource,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? `HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      setJobId(d.id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => fetchStatus(d.id), 2000);
      fetchStatus(d.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const busy = job && job.phase !== 'done' && job.phase !== 'error' && job.phase !== 'idle';
  const stats = results?.stats;
  const verdictBg = results?.verdict === 'GREEN' ? 'bg-green-500/10 border-green-500/30 text-n-green'
    : results?.verdict === 'YELLOW' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
    : 'bg-red-500/10 border-red-500/30 text-n-red';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-n-text">Backtester</h1>
        <p className="text-xs text-n-dim">Multi-asset backtest con money management e correlation control</p>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="label mb-1">Preset asset</p>
            <select value={preset} onChange={e => setPreset(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <p className="text-[9px] text-n-dim mt-1">{activePreset.assets.join(', ')}</p>
          </div>
          <div>
            <p className="label mb-1">Periodo (mesi)</p>
            <select value={months} onChange={e => setMonths(+e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">
              {[1, 2, 3, 6].map(m => <option key={m} value={m}>{m} mesi</option>)}
            </select>
          </div>
          <div>
            <p className="label mb-1">Rischio per trade %</p>
            <input type="number" step="0.5" min="0.5" max="3" value={risk} onChange={e => setRisk(parseFloat(e.target.value))} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]" />
          </div>
          <div>
            <p className="label mb-1">TP multiplier (× ATR)</p>
            <input type="number" step="0.5" min="1" max="6" value={tpMult} onChange={e => setTpMult(parseFloat(e.target.value))} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]" />
          </div>
          <div>
            <p className="label mb-1">SL multiplier (× ATR)</p>
            <input type="number" step="0.5" min="0.5" max="4" value={slMult} onChange={e => setSlMult(parseFloat(e.target.value))} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]" />
          </div>
          <div className="sm:col-span-2">
            <p className="label mb-1">Signal source</p>
            <div className="flex gap-2">
              {[
                { v: 'strategies', l: 'Strategie hard-coded' },
                { v: 'deepmap', l: 'Deep Map rules' },
                { v: 'both', l: 'Entrambe' },
              ].map(o => (
                <button key={o.v} onClick={() => setSignalSource(o.v as any)} className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors min-h-[44px] ${signalSource === o.v ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-n-border text-n-dim hover:text-n-text'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <button onClick={start} disabled={!!busy} className="w-full rounded-xl bg-n-text py-2 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {busy ? 'In corso...' : 'Avvia Backtest'}
            </button>
          </div>
        </div>
      </div>

      {err && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">{err}</div>}

      {/* Progress */}
      {job && job.phase !== 'idle' && (
        <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-n-dim">Phase: <span className="text-n-text font-medium">{job.phase}</span></span>
            <span className="font-mono text-xs text-n-text">{job.progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-n-bg overflow-hidden">
            <div className={`h-full transition-all ${job.phase === 'done' ? 'bg-n-green' : job.phase === 'error' ? 'bg-n-red' : 'bg-blue-500'}`} style={{ width: `${job.progress}%` }} />
          </div>
          <p className="text-[11px] text-n-dim font-mono">{job.message}</p>
        </div>
      )}

      {/* Results */}
      {results && stats && (
        <>
          {/* Verdict */}
          <div className={`rounded-xl border-2 p-5 ${verdictBg}`}>
            <div className="flex items-center gap-2 mb-2">
              {results.verdict === 'GREEN' ? <Check size={18} /> : results.verdict === 'YELLOW' ? <AlertTriangle size={18} /> : <X size={18} />}
              <h3 className="text-sm font-bold">VERDETTO: {results.verdict}</h3>
            </div>
            <p className="text-xs">{results.verdictReason}</p>
            <p className="text-[10px] mt-2 opacity-80">
              Signal source: <span className="font-mono font-bold">{results.config.signalSource ?? 'strategies'}</span>
              {results.deepMapStats && (results.deepMapStats.loaded > 0 || results.deepMapStats.skipped > 0) && (
                <> · DeepMap rules loaded: <span className="font-mono">{results.deepMapStats.loaded}</span>
                {results.deepMapStats.skipped > 0 && <> · skipped (no rules): <span className="font-mono">{results.deepMapStats.skipped}</span></>}
                </>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="rounded-xl border border-n-border bg-n-card overflow-hidden">
            <div className="flex border-b border-n-border overflow-x-auto">
              {(['overview', 'asset', 'monthly', 'rules', 'trades'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 min-w-[100px] py-3 px-4 text-xs font-medium transition-colors ${tab === t ? 'bg-n-bg/50 text-n-text border-b-2 border-blue-500' : 'text-n-dim hover:text-n-text'}`}>
                  {t === 'overview' ? 'Overview' : t === 'asset' ? 'Per Asset' : t === 'monthly' ? 'Mensile' : t === 'rules' ? 'Strategie' : 'Trade Log'}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* OVERVIEW */}
              {tab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Initial" value={`$${stats.initialCapital.toLocaleString()}`} />
                    <Stat label="Final" value={`$${stats.finalCapital.toFixed(0)}`} color={stats.totalReturn > 0 ? 'green' : 'red'} />
                    <Stat label="Return" value={`${stats.totalReturnPct > 0 ? '+' : ''}${stats.totalReturnPct}%`} color={stats.totalReturnPct > 0 ? 'green' : 'red'} />
                    <Stat label="Trades" value={stats.totalTrades} />
                    <Stat label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate > 55 ? 'green' : stats.winRate < 45 ? 'red' : 'text'} />
                    <Stat label="Profit Factor" value={stats.profitFactor} color={stats.profitFactor > 1.3 ? 'green' : stats.profitFactor < 1 ? 'red' : 'text'} />
                    <Stat label="Sharpe" value={stats.sharpeRatio} color={stats.sharpeRatio > 1 ? 'green' : 'text'} />
                    <Stat label="Calmar" value={stats.calmarRatio} color={stats.calmarRatio > 1 ? 'green' : 'text'} />
                    <Stat label="Sortino" value={stats.sortinoRatio} color={stats.sortinoRatio > 1 ? 'green' : 'text'} />
                    <Stat label="Max DD" value={`${stats.maxDrawdownPct}%`} color="red" />
                    <Stat label="Avg Win" value={`$${stats.avgWin}`} color="green" />
                    <Stat label="Avg Loss" value={`$${stats.avgLoss}`} color="red" />
                  </div>

                  {/* Equity curve */}
                  {results.equityCurve?.length > 0 && (
                    <div>
                      <p className="text-xs text-n-dim mb-2">Equity curve</p>
                      <EquityCurve curve={results.equityCurve} initial={stats.initialCapital} />
                    </div>
                  )}

                  {Object.keys(results.rejectionStats ?? {}).length > 0 && (
                    <div>
                      <p className="text-xs text-n-dim mb-2">Trade respinti dal money management</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(results.rejectionStats).map(([reason, count]) => (
                          <span key={reason} className="rounded-lg bg-n-bg/50 px-2 py-1 text-[10px] font-mono text-n-dim">
                            {reason}: <span className="text-n-text">{count as number}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PER ASSET */}
              {tab === 'asset' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead><tr className="border-b border-n-border">
                      <th className="pb-2 text-[9px] text-n-dim">Asset</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Trades</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Wins</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">PnL</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Avg Ret</th>
                    </tr></thead>
                    <tbody>{Object.entries(results.perAsset).sort((a: any, b: any) => b[1].pnl - a[1].pnl).map(([asset, a]: any) => (
                      <tr key={asset} className="border-b border-n-border/30">
                        <td className="py-2 text-n-text font-medium">{asset}</td>
                        <td className="py-2 text-right font-mono text-n-dim">{a.trades}</td>
                        <td className="py-2 text-right font-mono text-n-text">{a.wins}</td>
                        <td className={`py-2 text-right font-mono ${a.winRate > 55 ? 'text-n-green' : a.winRate < 45 ? 'text-n-red' : 'text-n-text'}`}>{a.winRate}%</td>
                        <td className={`py-2 text-right font-mono font-bold ${a.pnl > 0 ? 'text-n-green' : 'text-n-red'}`}>{a.pnl > 0 ? '+' : ''}${a.pnl}</td>
                        <td className={`py-2 text-right font-mono ${a.avgReturn > 0 ? 'text-n-green' : 'text-n-red'}`}>{a.avgReturn > 0 ? '+' : ''}{a.avgReturn}%</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {/* MONTHLY */}
              {tab === 'monthly' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[400px]">
                    <thead><tr className="border-b border-n-border">
                      <th className="pb-2 text-[9px] text-n-dim">Mese</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Trades</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">PnL</th>
                    </tr></thead>
                    <tbody>{results.monthly.map((m: any) => (
                      <tr key={m.month} className="border-b border-n-border/30">
                        <td className="py-2 text-n-text font-mono">{m.month}</td>
                        <td className="py-2 text-right font-mono text-n-dim">{m.trades}</td>
                        <td className={`py-2 text-right font-mono ${m.winRate > 55 ? 'text-n-green' : m.winRate < 45 ? 'text-n-red' : 'text-n-text'}`}>{m.winRate}%</td>
                        <td className={`py-2 text-right font-mono font-bold ${m.pnl > 0 ? 'text-n-green' : 'text-n-red'}`}>{m.pnl > 0 ? '+' : ''}${m.pnl}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {/* RULES (per strategy) */}
              {tab === 'rules' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead><tr className="border-b border-n-border">
                      <th className="pb-2 text-[9px] text-n-dim">Strategia</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Trades</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">PnL</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Avg Ret</th>
                    </tr></thead>
                    <tbody>{Object.entries(results.perStrategy).sort((a: any, b: any) => b[1].pnl - a[1].pnl).map(([s, st]: any) => (
                      <tr key={s} className="border-b border-n-border/30">
                        <td className="py-2 text-n-text font-medium">{s}</td>
                        <td className="py-2 text-right font-mono text-n-dim">{st.trades}</td>
                        <td className={`py-2 text-right font-mono ${st.winRate > 55 ? 'text-n-green' : 'text-n-text'}`}>{st.winRate}%</td>
                        <td className={`py-2 text-right font-mono font-bold ${st.pnl > 0 ? 'text-n-green' : 'text-n-red'}`}>{st.pnl > 0 ? '+' : ''}${st.pnl}</td>
                        <td className={`py-2 text-right font-mono ${st.avgReturn > 0 ? 'text-n-green' : 'text-n-red'}`}>{st.avgReturn > 0 ? '+' : ''}{st.avgReturn}%</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {/* TRADES */}
              {tab === 'trades' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead><tr className="border-b border-n-border">
                      <th className="pb-2 text-[9px] text-n-dim">Asset</th>
                      <th className="pb-2 text-[9px] text-n-dim">Side</th>
                      <th className="pb-2 text-[9px] text-n-dim">Entry</th>
                      <th className="pb-2 text-[9px] text-n-dim">Exit</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Entry $</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">Exit $</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">PnL</th>
                      <th className="pb-2 text-[9px] text-n-dim text-right">PnL %</th>
                      <th className="pb-2 text-[9px] text-n-dim">Reason</th>
                    </tr></thead>
                    <tbody>{results.trades.slice(-100).reverse().map((t: any, i: number) => (
                      <tr key={i} className="border-b border-n-border/30">
                        <td className="py-1.5 text-n-text">{t.asset}</td>
                        <td className={`py-1.5 ${t.side === 'long' ? 'text-n-green' : 'text-n-red'}`}>{t.side}</td>
                        <td className="py-1.5 text-n-dim text-[10px]">{new Date(t.entryTime).toISOString().slice(5, 16)}</td>
                        <td className="py-1.5 text-n-dim text-[10px]">{new Date(t.exitTime).toISOString().slice(5, 16)}</td>
                        <td className="py-1.5 text-right font-mono text-n-dim">${t.entryPrice.toFixed(2)}</td>
                        <td className="py-1.5 text-right font-mono text-n-dim">${t.exitPrice.toFixed(2)}</td>
                        <td className={`py-1.5 text-right font-mono font-bold ${t.pnl > 0 ? 'text-n-green' : 'text-n-red'}`}>{t.pnl > 0 ? '+' : ''}${t.pnl}</td>
                        <td className={`py-1.5 text-right font-mono ${t.pnlPct > 0 ? 'text-n-green' : 'text-n-red'}`}>{t.pnlPct > 0 ? '+' : ''}{t.pnlPct}%</td>
                        <td className={`py-1.5 text-[10px] ${t.exitReason === 'tp' ? 'text-n-green' : t.exitReason === 'sl' ? 'text-n-red' : 'text-n-dim'}`}>{t.exitReason}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {results.trades.length > 100 && <p className="text-[10px] text-n-dim mt-2">Showing last 100 of {results.trades.length} trades</p>}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!results && !job && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-10 text-center">
          <BarChart3 size={32} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-medium text-n-text-s">Backtester multi-asset</p>
          <p className="mt-1 text-xs text-n-dim max-w-md mx-auto">Simula trade su più asset in parallelo con money management completo (1-2% rischio, max 10% esposizione totale, 6% per gruppo correlato), TP/SL ATR-based, e produce equity curve, drawdown, Sharpe, Calmar.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text' }: { label: string; value: any; color?: 'green' | 'red' | 'text' }) {
  const cls = color === 'green' ? 'text-n-green' : color === 'red' ? 'text-n-red' : 'text-n-text';
  return (
    <div className="rounded-lg bg-n-bg/50 p-2.5 text-center">
      <p className="text-[9px] text-n-dim uppercase">{label}</p>
      <p className={`font-mono text-sm font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function EquityCurve({ curve, initial }: { curve: any[]; initial: number }) {
  if (curve.length === 0) return null;
  const values = curve.map(c => c.value);
  const min = Math.min(...values, initial);
  const max = Math.max(...values, initial);
  const range = max - min || 1;
  const W = 600, H = 140;
  // Subsample if too many points
  const step = Math.max(1, Math.floor(curve.length / 200));
  const points = curve.filter((_, i) => i % step === 0).map((c, i, arr) => {
    const x = (i / (arr.length - 1 || 1)) * W;
    const y = H - ((c.value - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const initialY = H - ((initial - min) / range) * H;

  return (
    <div className="rounded-lg bg-n-bg/30 p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: '500px' }}>
        <line x1="0" y1={initialY} x2={W} y2={initialY} stroke="#525252" strokeWidth="0.5" strokeDasharray="2 2" />
        <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      </svg>
      <p className="text-[9px] text-n-dim mt-1 font-mono">${min.toFixed(0)} → ${max.toFixed(0)}</p>
    </div>
  );
}
