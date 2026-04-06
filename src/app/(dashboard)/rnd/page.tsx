'use client';

import { useState, useEffect } from 'react';
import { Database, RefreshCw, FlaskConical, Zap, Target } from 'lucide-react';

const ASSETS = [
  { symbol: 'BTC/USD', label: 'BTC' }, { symbol: 'ETH/USD', label: 'ETH' }, { symbol: 'SOL/USD', label: 'SOL' }, { symbol: 'LINK/USD', label: 'LINK' },
  { symbol: 'AAPL', label: 'AAPL' }, { symbol: 'NVDA', label: 'NVDA' }, { symbol: 'TSLA', label: 'TSLA' }, { symbol: 'SPY', label: 'SPY' },
];
const TFS = ['5m', '15m', '1h', '4h', '1d'];
const GRADE_COLORS: Record<string, string> = { A: 'bg-green-500/20 text-green-400', B: 'bg-blue-500/15 text-blue-400', C: 'bg-yellow-500/15 text-yellow-400', D: 'bg-orange-500/15 text-orange-400', F: 'bg-red-500/15 text-red-400' };

type Phase = 'idle' | 'loading' | 'complete' | 'error';

export default function RnDPage() {
  const [asset, setAsset] = useState('BTC/USD');
  const [tf, setTf] = useState('1h');
  const [tab, setTab] = useState<'analysis' | 'knowledge'>('analysis');

  const [phase1, setPhase1] = useState<Phase>('idle');
  const [phase2, setPhase2] = useState<Phase>('idle');
  const [phase3, setPhase3] = useState<Phase>('idle');
  const [phase4, setPhase4] = useState<Phase>('idle');

  const [downloadResult, setDownloadResult] = useState<any>(null);
  const [indicatorResult, setIndicatorResult] = useState<any[]>([]);
  const [patternResult, setPatternResult] = useState<any>(null);
  const [strategyResult, setStrategyResult] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/rnd?action=knowledge').then(r => r.ok ? r.json() : null).then(d => { if (d?.knowledge) setKnowledge(d.knowledge); }).catch(() => {});
  }, []);

  const anyLoading = phase1 === 'loading' || phase2 === 'loading' || phase3 === 'loading' || phase4 === 'loading';

  const runFullAnalysis = async () => {
    setPhase1('loading'); setPhase2('idle'); setPhase3('idle'); setPhase4('idle');
    setDownloadResult(null); setIndicatorResult([]); setPatternResult(null); setStrategyResult([]);

    try {
      const r1 = await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'download-history', asset, timeframe: tf }) });
      const d1 = await r1.json();
      setDownloadResult(d1);
      setPhase1(d1.candles > 0 ? 'complete' : 'error');
    } catch { setPhase1('error'); return; }

    setPhase2('loading');
    try {
      await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan', assets: [asset] }) });
      const ir = await fetch(`/api/rnd?action=indicators&asset=${encodeURIComponent(asset)}`);
      if (ir.ok) { const id = await ir.json(); setIndicatorResult(id.indicators ?? []); }
      setPhase2('complete');
    } catch { setPhase2('error'); }

    setPhase3('loading');
    try {
      const pr = await fetch(`/api/rnd?action=patterns&asset=${encodeURIComponent(asset)}`);
      if (pr.ok) setPatternResult((await pr.json()).patterns);
      setPhase3('complete');
    } catch { setPhase3('error'); }

    setPhase4('loading');
    try {
      for (const s of ['trend', 'momentum', 'combined_ai', 'reversion']) {
        await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'train', asset, timeframe: tf, strategy: s }) }).catch(() => {});
      }
      const tr = await fetch('/api/rnd?action=training-results');
      if (tr.ok) { const td = await tr.json(); setStrategyResult((td.results ?? []).filter((r: any) => r.asset === asset).sort((a: any, b: any) => b.score - a.score)); }
      setPhase4('complete');
    } catch { setPhase4('error'); }

    const kbr = await fetch('/api/rnd?action=knowledge');
    if (kbr.ok) { const d = await kbr.json(); setKnowledge(d.knowledge ?? []); }
  };

  const PI = ({ p, label }: { p: Phase; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${p === 'complete' ? 'text-n-green' : p === 'loading' ? 'text-n-yellow' : p === 'error' ? 'text-n-red' : 'text-n-dim'}`}>
      {p === 'loading' ? <RefreshCw size={11} className="animate-spin" /> : p === 'complete' ? '✓' : p === 'error' ? '✗' : '○'} {label}
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-n-text">R&D Lab</h1>

      <div className="flex gap-1 rounded-xl border border-n-border p-1">
        <button onClick={() => setTab('analysis')} className={`flex-1 rounded-lg py-2 text-xs font-medium ${tab === 'analysis' ? 'bg-n-card text-n-text' : 'text-n-dim'}`}>Analisi Profonda</button>
        <button onClick={() => setTab('knowledge')} className={`flex-1 rounded-lg py-2 text-xs font-medium ${tab === 'knowledge' ? 'bg-n-card text-n-text' : 'text-n-dim'}`}>Knowledge Base ({knowledge.length})</button>
      </div>

      {tab === 'analysis' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-n-border bg-n-card p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="label mb-1.5">Asset</p>
                <select value={asset} onChange={e => setAsset(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2.5 text-sm text-n-text min-h-[44px]">
                  {ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <p className="label mb-1.5">Timeframe</p>
                <select value={tf} onChange={e => setTf(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2.5 text-sm text-n-text min-h-[44px]">
                  {TFS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={runFullAnalysis} disabled={anyLoading} className="w-full rounded-xl bg-n-text py-2.5 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
                  {anyLoading ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />} {anyLoading ? 'Analisi in corso...' : 'Analisi Completa'}
                </button>
              </div>
            </div>
          </div>

          {phase1 !== 'idle' && (
            <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PI p={phase1} label={`Download (${downloadResult?.candles ?? '?'})`} />
                <PI p={phase2} label={`Indicatori (${indicatorResult.length})`} />
                <PI p={phase3} label="Pattern" />
                <PI p={phase4} label={`Strategie (${strategyResult.length})`} />
              </div>

              {indicatorResult.length > 0 && (
                <div>
                  <p className="label mb-2">Top indicatori per {asset}</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {indicatorResult.sort((a: any, b: any) => b.winRate1d - a.winRate1d).slice(0, 8).map((ind: any, i: number) => (
                      <div key={i} className="rounded-lg bg-n-bg/50 p-2.5">
                        <p className="text-[10px] text-n-dim truncate">{ind.condition}</p>
                        <p className={`font-mono text-sm font-medium ${ind.winRate1d > 0.6 ? 'text-n-green' : ind.winRate1d < 0.4 ? 'text-n-red' : 'text-n-text'}`}>{(ind.winRate1d * 100).toFixed(0)}%</p>
                        <p className="text-[9px] text-n-dim">{ind.sampleSize}n · avg {(ind.avgReturn1d * 100).toFixed(2)}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {patternResult?.byPattern && Object.keys(patternResult.byPattern).length > 0 && (
                <div>
                  <p className="label mb-2">Pattern su {asset}</p>
                  <div className="space-y-1">
                    {Object.entries(patternResult.byPattern).sort(([,a]: any, [,b]: any) => b.winRate1d - a.winRate1d).slice(0, 6).map(([name, stats]: [string, any]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span className="text-n-text">{name.replace(/_/g, ' ')}</span>
                        <span className={`font-mono ${stats.winRate1d > 0.6 ? 'text-n-green' : 'text-n-text'}`}>{(stats.winRate1d * 100).toFixed(0)}% ({stats.occurrences}x)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {strategyResult.length > 0 && (
                <div>
                  <p className="label mb-2">Strategie ranked</p>
                  {strategyResult.slice(0, 6).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-n-dim">{i + 1}.</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${GRADE_COLORS[s.grade] ?? ''}`}>{s.grade}</span>
                        <span className="text-xs text-n-text">{s.strategy}</span>
                      </div>
                      <span className="font-mono text-[10px] text-n-dim">WR {s.metrics.winRate}% · S {s.metrics.sharpe} · SL {s.bestParams.stopLoss}%</span>
                    </div>
                  ))}

                  {strategyResult.filter((s: any) => s.grade === 'A' || s.grade === 'B').length > 0 && (
                    <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
                      <p className="text-xs text-n-green font-medium mb-1">Consigliate per {asset}:</p>
                      {strategyResult.filter((s: any) => s.grade === 'A' || s.grade === 'B').slice(0, 2).map((s: any, i: number) => (
                        <p key={i} className="text-xs text-n-text">→ {s.strategy} — SL {s.bestParams.stopLoss}% · TP {s.bestParams.takeProfit}%</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase1 === 'idle' && (
            <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-8 text-center">
              <FlaskConical size={28} className="mx-auto text-n-dim mb-2" />
              <p className="text-sm text-n-dim">Seleziona asset e timeframe, poi clicca "Analisi Completa"</p>
            </div>
          )}
        </div>
      )}

      {tab === 'knowledge' && (
        <div className="space-y-2">
          {knowledge.length === 0 ? (
            <p className="text-sm text-n-dim text-center py-8">Esegui un'analisi per popolare la Knowledge Base</p>
          ) : knowledge.slice(0, 30).map((k: any) => (
            <div key={k.id} className="flex items-start gap-3 rounded-xl border border-n-border bg-n-card p-3">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] text-n-dim">{k.asset}</span>
                <p className="text-[11px] text-n-text leading-snug">{k.finding}</p>
              </div>
              <span className={`font-mono text-xs font-medium shrink-0 ${k.winRate > 0.6 ? 'text-n-green' : 'text-n-text'}`}>{(k.winRate * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
