'use client';

import { useState, useEffect, useRef } from 'react';
import { Microscope, Play, RefreshCw, TrendingUp, TrendingDown, Database, Clock } from 'lucide-react';

const ASSETS = ['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'TSLA'];

type Phase = 'idle' | 'downloading' | 'analyzing' | 'mining' | 'finalizing' | 'complete' | 'error';

interface JobState {
  asset: string;
  phase: Phase;
  progress: number;
  message: string;
  error?: string;
}

export default function DeepMappingPage() {
  const [asset, setAsset] = useState('BTC');
  const [job, setJob] = useState<JobState | null>(null);
  const [results, setResults] = useState<any>(null);
  const [err, setErr] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const r = await fetch(`/api/deep-mapping?asset=${asset}`);
      if (!r.ok) return;
      const d = await r.json();
      setJob(d);
      if (d.phase === 'complete') {
        const rr = await fetch('/api/deep-mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'results', asset }) });
        if (rr.ok) setResults(await rr.json());
        if (pollRef.current) clearInterval(pollRef.current);
      }
      if (d.phase === 'error') {
        if (pollRef.current) clearInterval(pollRef.current);
        setErr(d.error ?? d.message ?? 'Failed');
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const start = async () => {
    setErr(''); setResults(null);
    try {
      const r = await fetch('/api/deep-mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', asset }) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? `HTTP ${r.status}`);
        return;
      }
      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchStatus, 3000);
      fetchStatus();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const busy = job && (job.phase === 'downloading' || job.phase === 'analyzing' || job.phase === 'mining' || job.phase === 'finalizing');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-n-text">Deep Mapping</h1>
        <p className="text-xs text-n-dim">Mining automatico di pattern profittevoli su storico completo</p>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="label mb-1">Asset</p>
            <select value={asset} onChange={e => setAsset(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">
              {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <button onClick={start} disabled={!!busy} className="w-full rounded-xl bg-n-text py-2 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {busy ? 'Mining in corso...' : 'Avvia Deep Mapping'}
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
            <div className={`h-full transition-all ${job.phase === 'complete' ? 'bg-n-green' : job.phase === 'error' ? 'bg-n-red' : 'bg-blue-500'}`} style={{ width: `${job.progress}%` }} />
          </div>
          <p className="text-[11px] text-n-dim">{job.message}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Dataset info */}
          <div className="rounded-xl border border-n-border bg-n-card p-5">
            <h3 className="label mb-3 flex items-center gap-2"><Database size={14} /> Dataset</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(results.dataset).filter(([k]) => k !== 'firstDate' && k !== 'lastDate').map(([tf, count]) => (
                <div key={tf} className="rounded-lg bg-n-bg/50 p-2 text-center">
                  <p className="text-[8px] text-n-dim uppercase">{tf}</p>
                  <p className="font-mono text-sm font-bold text-n-text">{count as number}</p>
                </div>
              ))}
            </div>
            {results.dataset.firstDate && (
              <p className="text-[10px] text-n-dim mt-2">{results.dataset.firstDate.slice(0, 10)} → {results.dataset.lastDate.slice(0, 10)}</p>
            )}
          </div>

          {/* Stats */}
          <div className="rounded-xl border border-n-border bg-n-card p-5">
            <h3 className="label mb-3">Statistiche globali (24h forward)</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                <p className="text-[8px] text-n-dim">Contesti</p>
                <p className="font-mono text-xs text-n-text">{results.stats.contextsAnalyzed}</p>
              </div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                <p className="text-[8px] text-n-dim">Avg Ret</p>
                <p className={`font-mono text-xs ${results.stats.avgReturn24h > 0 ? 'text-n-green' : 'text-n-red'}`}>{results.stats.avgReturn24h > 0 ? '+' : ''}{results.stats.avgReturn24h}%</p>
              </div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                <p className="text-[8px] text-n-dim">Volatility</p>
                <p className="font-mono text-xs text-n-text">{results.stats.volatility24h}%</p>
              </div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                <p className="text-[8px] text-n-dim">Max Gain</p>
                <p className="font-mono text-xs text-n-green">+{results.stats.maxGain24h}%</p>
              </div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                <p className="text-[8px] text-n-dim">Max Loss</p>
                <p className="font-mono text-xs text-n-red">{results.stats.maxLoss24h}%</p>
              </div>
            </div>
          </div>

          {/* Regime distribution */}
          <div className="rounded-xl border border-n-border bg-n-card p-5">
            <h3 className="label mb-3">Distribuzione regimi</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(results.regimeDistribution).map(([reg, count]) => (
                <div key={reg} className="rounded-lg bg-n-bg/50 px-3 py-1.5">
                  <span className="text-[10px] text-n-dim">{reg}</span>
                  <span className="ml-2 font-mono text-xs text-n-text">{count as number}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hourly profile */}
          {results.hourlyProfile?.length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="label mb-3 flex items-center gap-2"><Clock size={14} /> Profilo orario (WR 24h)</h3>
              <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
                {results.hourlyProfile.map((h: any) => (
                  <div key={h.hour} className={`rounded p-1.5 text-center ${h.winRate > 55 ? 'bg-green-500/20 text-n-green' : h.winRate < 45 ? 'bg-red-500/20 text-n-red' : 'bg-n-bg/50 text-n-text'}`}>
                    <p className="text-[9px]">{h.hour}h</p>
                    <p className="text-xs font-bold font-mono">{h.winRate}%</p>
                    <p className="text-[8px] opacity-60">{h.count}x</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top BUY rules */}
          {results.topBuyRules?.length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="label mb-3 flex items-center gap-2 text-n-green"><TrendingUp size={14} /> Top {results.topBuyRules.length} regole BUY</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead><tr className="border-b border-n-border">
                    <th className="pb-2 text-[9px] text-n-dim">#</th>
                    <th className="pb-2 text-[9px] text-n-dim">Condizioni</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">AvgRet</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">Occorr.</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">Edge</th>
                  </tr></thead>
                  <tbody>{results.topBuyRules.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-n-border/30">
                      <td className="py-1.5 text-n-dim">{i + 1}</td>
                      <td className="py-1.5 text-n-text font-mono text-[10px]">{r.conditions.join(' + ')}</td>
                      <td className="py-1.5 text-right font-mono text-n-green">{r.winRate}%</td>
                      <td className="py-1.5 text-right font-mono text-n-green">+{r.avgReturn}%</td>
                      <td className="py-1.5 text-right font-mono text-n-dim">{r.occurrences}</td>
                      <td className="py-1.5 text-right font-mono text-n-text">{r.edgeScore.toFixed(2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top SELL rules */}
          {results.topSellRules?.length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-5">
              <h3 className="label mb-3 flex items-center gap-2 text-n-red"><TrendingDown size={14} /> Top {results.topSellRules.length} regole SELL</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead><tr className="border-b border-n-border">
                    <th className="pb-2 text-[9px] text-n-dim">#</th>
                    <th className="pb-2 text-[9px] text-n-dim">Condizioni</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">AvgRet</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">Occorr.</th>
                    <th className="pb-2 text-[9px] text-n-dim text-right">Edge</th>
                  </tr></thead>
                  <tbody>{results.topSellRules.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-n-border/30">
                      <td className="py-1.5 text-n-dim">{i + 1}</td>
                      <td className="py-1.5 text-n-text font-mono text-[10px]">{r.conditions.join(' + ')}</td>
                      <td className="py-1.5 text-right font-mono text-n-red">{r.winRate}%</td>
                      <td className="py-1.5 text-right font-mono text-n-red">{r.avgReturn}%</td>
                      <td className="py-1.5 text-right font-mono text-n-dim">{r.occurrences}</td>
                      <td className="py-1.5 text-right font-mono text-n-text">{r.edgeScore.toFixed(2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
            <p className="text-xs text-blue-400">Le {results.totalRules} regole sono salvate in Redis e i bot le consultano automaticamente ad ogni tick.</p>
          </div>
        </>
      )}

      {/* Empty state */}
      {!job && !results && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-10 text-center">
          <Microscope size={32} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-medium text-n-text-s">Mining automatico di pattern</p>
          <p className="mt-1 text-xs text-n-dim max-w-md mx-auto">Scarica fino a 4 anni di storico, analizza ogni candela con il contesto completo (RSI, BB, MACD, regime, volume), e testa migliaia di combinazioni di condizioni per trovare regole con edge statistico significativo.</p>
        </div>
      )}
    </div>
  );
}
