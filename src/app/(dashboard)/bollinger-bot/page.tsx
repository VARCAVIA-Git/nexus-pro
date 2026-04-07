'use client';

import { useState, useEffect, useRef } from 'react';
import { Activity, Play, RefreshCw, TrendingUp, TrendingDown, Award, Database } from 'lucide-react';

const ASSETS = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ'];

const RECOMMENDATION_COLORS: Record<string, string> = {
  STRONG: 'bg-green-500/20 text-green-400 border-green-500/30',
  GOOD: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CAUTION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  AVOID: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function BollingerBotPage() {
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['BTC', 'ETH', 'SOL']);
  const [job, setJob] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/bollinger-bot');
      if (!r.ok) return;
      const d = await r.json();
      setJob(d);
      if (d.phase === 'done') {
        if (pollRef.current) clearInterval(pollRef.current);
        await loadProfiles();
      }
      if (d.phase === 'error') {
        if (pollRef.current) clearInterval(pollRef.current);
        setErr(d.error ?? 'Failed');
      }
    } catch {}
  };

  const loadProfiles = async () => {
    try {
      const r = await fetch('/api/bollinger-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profiles' }) });
      if (r.ok) {
        const d = await r.json();
        setProfiles(d.profiles ?? []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    loadProfiles();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAsset = (a: string) => {
    setSelectedAssets(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const startTraining = async () => {
    setErr(''); setProfiles([]);
    if (selectedAssets.length === 0) { setErr('Seleziona almeno un asset'); return; }
    try {
      const r = await fetch('/api/bollinger-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'train', assets: selectedAssets }) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setErr(e.error ?? `HTTP ${r.status}`);
        return;
      }
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchStatus, 2500);
      fetchStatus();
    } catch (e: any) { setErr(e.message); }
  };

  const busy = job && (job.phase === 'fetching' || job.phase === 'analyzing' || job.phase === 'finalizing');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-n-text">Bollinger Bot</h1>
        <p className="text-xs text-n-dim">Calibrazione per-asset su 4 anni di storico — TP/SL dal 60° percentile delle mosse storiche</p>
      </div>

      {/* Asset selection */}
      <div className="rounded-xl border border-n-border bg-n-card p-4 space-y-3">
        <div>
          <p className="label mb-2">Asset da allenare ({selectedAssets.length} selezionati)</p>
          <div className="flex flex-wrap gap-2">
            {ASSETS.map(a => (
              <button key={a} onClick={() => toggleAsset(a)} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${selectedAssets.includes(a) ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-n-border text-n-dim hover:text-n-text'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <button onClick={startTraining} disabled={!!busy || selectedAssets.length === 0} className="w-full rounded-xl bg-n-text py-2.5 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {busy ? 'Training in corso...' : `Allena su 4 anni (${selectedAssets.length} asset)`}
        </button>
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

      {/* Profiles */}
      {profiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="label">Profili calibrati ({profiles.length})</h3>
            <button onClick={loadProfiles} className="text-[10px] text-n-dim hover:text-n-text"><RefreshCw size={11} className="inline" /> Refresh</button>
          </div>
          {profiles.map((p: any) => (
            <div key={p.asset} className="rounded-xl border border-n-border bg-n-card p-5 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h4 className="text-base font-bold text-n-text">{p.asset}</h4>
                  <span className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-bold ${RECOMMENDATION_COLORS[p.recommendation] ?? ''}`}>
                    {p.recommendation}
                  </span>
                  <span className="text-[10px] text-n-dim">Score: <span className="font-mono text-n-text">{p.overallScore}/100</span></span>
                </div>
                <div className="text-[10px] text-n-dim">
                  Trained {new Date(p.trainedAt).toLocaleDateString('it-IT')}
                </div>
              </div>

              {/* Dataset */}
              <div className="flex flex-wrap gap-3 text-[10px] text-n-dim">
                <span><Database size={10} className="inline" /> {p.dataset.candles} candles</span>
                <span>{p.dataset.firstDate?.slice(0, 10)} → {p.dataset.lastDate?.slice(0, 10)}</span>
                <span>{p.dataset.spanYears}y span</span>
                <span>BB ({p.optimalParams.period}, {p.optimalParams.stdDev})</span>
              </div>

              {/* Long + Short cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* LONG */}
                <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={14} className="text-n-green" />
                    <span className="text-xs text-n-green font-medium">LONG (BB Lower Touch)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <Stat label="Samples" value={p.long.samples} />
                    <Stat label="Est WR" value={`${p.long.estimatedWinRate}%`} color={p.long.estimatedWinRate > 50 ? 'green' : 'text'} />
                    <Stat label="Avg Fav" value={`+${p.long.avgFavorable}%`} color="green" />
                    <Stat label="Avg Adv" value={`${p.long.avgAdverse}%`} color="red" />
                    <Stat label="TP (60°pct)" value={`${p.long.recommendedTP}%`} color="green" />
                    <Stat label="SL (1.2× adv)" value={`${p.long.recommendedSL}%`} color="red" />
                    <Stat label="EV/trade" value={`${p.long.expectedValue > 0 ? '+' : ''}${p.long.expectedValue}%`} color={p.long.expectedValue > 0 ? 'green' : 'red'} />
                    <Stat label="Avg time TP" value={`${p.long.avgTimeToTP}h`} />
                  </div>
                </div>

                {/* SHORT */}
                <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown size={14} className="text-n-red" />
                    <span className="text-xs text-n-red font-medium">SHORT (BB Upper Touch)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <Stat label="Samples" value={p.short.samples} />
                    <Stat label="Est WR" value={`${p.short.estimatedWinRate}%`} color={p.short.estimatedWinRate > 50 ? 'green' : 'text'} />
                    <Stat label="Avg Fav" value={`+${p.short.avgFavorable}%`} color="green" />
                    <Stat label="Avg Adv" value={`${p.short.avgAdverse}%`} color="red" />
                    <Stat label="TP (60°pct)" value={`${p.short.recommendedTP}%`} color="green" />
                    <Stat label="SL (1.2× adv)" value={`${p.short.recommendedSL}%`} color="red" />
                    <Stat label="EV/trade" value={`${p.short.expectedValue > 0 ? '+' : ''}${p.short.expectedValue}%`} color={p.short.expectedValue > 0 ? 'green' : 'red'} />
                    <Stat label="Avg time TP" value={`${p.short.avgTimeToTP}h`} />
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-n-dim italic"><Award size={10} className="inline" /> {p.recommendationReason}</p>
            </div>
          ))}

          {/* CTA */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-center">
            <p className="text-xs text-blue-400 mb-2">I profili sono salvati in Redis. Ora puoi:</p>
            <p className="text-[11px] text-n-dim">
              1. Validali nel <span className="text-n-text font-bold">Backtester</span> con signal source <span className="text-n-text font-bold">"Bollinger Expert"</span>
              <br />2. Se i numeri sono buoni, attivali nel bot live
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!busy && profiles.length === 0 && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-10 text-center">
          <Activity size={32} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-medium text-n-text-s">Bollinger Bot — Calibrazione per asset</p>
          <p className="mt-1 text-xs text-n-dim max-w-md mx-auto">
            Per ogni asset, scarica 4 anni di storico, testa 7 combinazioni di parametri Bollinger Bands,
            misura le mosse storiche dopo ogni segnale, e calcola TP (60° percentile) + SL (1.2× avg adverse).
            Risultato: parametri ottimali specifici per ogni asset.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text' }: { label: string; value: any; color?: 'green' | 'red' | 'text' }) {
  const cls = color === 'green' ? 'text-n-green' : color === 'red' ? 'text-n-red' : 'text-n-text';
  return (
    <div className="rounded bg-n-bg/50 p-1.5 text-center">
      <p className="text-[8px] text-n-dim uppercase">{label}</p>
      <p className={`font-mono text-xs font-bold ${cls}`}>{value}</p>
    </div>
  );
}
