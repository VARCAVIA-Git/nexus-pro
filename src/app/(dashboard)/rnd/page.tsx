'use client';

import { useState } from 'react';
import { RefreshCw, FlaskConical, Download, BarChart3, Target, BookOpen, ChevronRight } from 'lucide-react';

const ASSETS = [
  { symbol: 'BTC/USD', label: 'BTC' }, { symbol: 'ETH/USD', label: 'ETH' }, { symbol: 'SOL/USD', label: 'SOL' }, { symbol: 'LINK/USD', label: 'LINK' },
  { symbol: 'AAPL', label: 'AAPL' }, { symbol: 'NVDA', label: 'NVDA' }, { symbol: 'TSLA', label: 'TSLA' }, { symbol: 'SPY', label: 'SPY' }, { symbol: 'QQQ', label: 'QQQ' },
];
const TFS = ['15m', '1h', '4h', '1d'];
const GRADE_COLORS: Record<string, string> = { A: 'bg-green-500/20 text-green-400', B: 'bg-blue-500/15 text-blue-400', C: 'bg-yellow-500/15 text-yellow-400', D: 'bg-orange-500/15 text-orange-400', F: 'bg-red-500/15 text-red-400' };
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function RnDPage() {
  const [asset, setAsset] = useState('BTC/USD');
  const [tf, setTf] = useState('1h');

  const [p1, setP1] = useState<Phase>('idle');
  const [p2, setP2] = useState<Phase>('idle');
  const [p3, setP3] = useState<Phase>('idle');
  const [p4, setP4] = useState<Phase>('idle');
  const [p5, setP5] = useState<Phase>('idle');
  const [p6, setP6] = useState<Phase>('idle');

  const [download, setDownload] = useState<any>(null);
  const [behavior, setBehavior] = useState<any>(null);
  const [indicators, setIndicators] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState('');

  const anyRunning = [p1, p2, p3, p4, p5, p6].includes('running');

  const api = async (action: string) => {
    const res = await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, asset, timeframe: tf }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `HTTP ${res.status}`); }
    return res.json();
  };

  const runFull = async () => {
    setError(''); setDownload(null); setBehavior(null); setIndicators([]); setPatterns([]); setStrategies([]); setReport(null);
    setP1('idle'); setP2('idle'); setP3('idle'); setP4('idle'); setP5('idle'); setP6('idle');

    // Phase 1: Download
    setP1('running');
    try { const d = await api('download'); setDownload(d); setP1('done'); } catch (e: any) { setError(e.message); setP1('error'); return; }

    // Phase 2: Behavior
    setP2('running');
    try { const d = await api('analyze-behavior'); setBehavior(d.data); setP2('done'); } catch (e: any) { setError(e.message); setP2('error'); return; }

    // Phase 3: Indicators
    setP3('running');
    try { const d = await api('analyze-indicators'); setIndicators(d.data ?? []); setP3('done'); } catch (e: any) { setError(e.message); setP3('error'); return; }

    // Phase 4: Patterns
    setP4('running');
    try { const d = await api('analyze-patterns'); setPatterns(d.data ?? []); setP4('done'); } catch (e: any) { setError(e.message); setP4('error'); return; }

    // Phase 5: Strategies
    setP5('running');
    try { const d = await api('test-strategies'); setStrategies(d.data ?? []); setP5('done'); } catch (e: any) { setError(e.message); setP5('error'); return; }

    // Phase 6: Report
    setP6('running');
    try { const d = await api('generate-report'); setReport(d.data); setP6('done'); } catch (e: any) { setError(e.message); setP6('error'); }
  };

  const PI = ({ phase, label }: { phase: Phase; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs ${phase === 'done' ? 'text-n-green' : phase === 'running' ? 'text-n-yellow' : phase === 'error' ? 'text-n-red' : 'text-n-dim'}`}>
      {phase === 'running' ? <RefreshCw size={11} className="animate-spin" /> : phase === 'done' ? '✓' : phase === 'error' ? '✗' : '○'} {label}
    </span>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-n-text">R&D Lab</h1>

      {/* Config */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="label mb-1.5">Asset da investigare</p>
            <select value={asset} onChange={e => setAsset(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2.5 text-sm text-n-text min-h-[44px]">
              {ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.label} — {a.symbol}</option>)}
            </select>
          </div>
          <div>
            <p className="label mb-1.5">Timeframe</p>
            <select value={tf} onChange={e => setTf(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2.5 text-sm text-n-text min-h-[44px]">
              {TFS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={runFull} disabled={anyRunning} className="w-full rounded-xl bg-n-text py-2.5 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
              {anyRunning ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              {anyRunning ? 'Analisi in corso...' : 'Investigazione Completa'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>}

      {/* Progress */}
      {p1 !== 'idle' && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-n-border bg-n-card px-4 py-3">
          <PI phase={p1} label={`Download${download ? ` (${download.candles})` : ''}`} />
          <PI phase={p2} label="Comportamento" />
          <PI phase={p3} label={`Indicatori (${indicators.length})`} />
          <PI phase={p4} label={`Pattern (${patterns.length})`} />
          <PI phase={p5} label={`Strategie (${strategies.length})`} />
          <PI phase={p6} label="Rapporto" />
        </div>
      )}

      {/* Download info */}
      {download && (
        <div className="rounded-xl border border-n-border bg-n-card p-4 text-xs text-n-dim">
          <Download size={12} className="inline mr-1" /> {download.candles} candele da {download.source} · {download.from} → {download.to} · Volume: {download.volumeReal ? 'REALE' : 'non disponibile'}
        </div>
      )}

      {/* Behavior */}
      {behavior && (
        <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-4">
          <h3 className="label flex items-center gap-2"><BarChart3 size={14} /> Comportamento di {asset}</h3>

          {/* Hourly heatmap */}
          <div>
            <p className="text-xs text-n-dim mb-2">Win Rate per ora UTC</p>
            <div className="flex gap-0.5 flex-wrap">
              {behavior.hourly?.map((h: any) => (
                <div key={h.hour} title={`${h.hour}:00 — WR ${h.winRate}% (${h.samples}n)`} className={`w-6 h-6 rounded text-[8px] flex items-center justify-center font-mono ${h.winRate > 58 ? 'bg-green-500/30 text-green-400' : h.winRate < 42 ? 'bg-red-500/30 text-red-400' : 'bg-n-bg/60 text-n-dim'}`}>
                  {h.hour}
                </div>
              ))}
            </div>
          </div>

          {/* Daily */}
          <div className="flex gap-2 flex-wrap">
            {behavior.daily?.map((d: any) => (
              <div key={d.day} className="rounded-lg bg-n-bg/50 px-3 py-1.5 text-center">
                <p className="text-[9px] text-n-dim">{DAY_NAMES[d.day]}</p>
                <p className={`font-mono text-xs font-medium ${d.winRate > 55 ? 'text-n-green' : d.winRate < 45 ? 'text-n-red' : 'text-n-text'}`}>{d.winRate}%</p>
              </div>
            ))}
          </div>

          {behavior.bestHours?.length > 0 && <p className="text-xs text-n-green">Migliori ore: {behavior.bestHours.join(', ')} UTC</p>}
          {behavior.worstHours?.length > 0 && <p className="text-xs text-n-red">Evitare: {behavior.worstHours.join(', ')} UTC</p>}
        </div>
      )}

      {/* Indicators */}
      {indicators.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="label mb-3 flex items-center gap-2"><Target size={14} /> Indicatori testati ({indicators.length})</h3>
          <div className="space-y-1">
            {indicators.slice(0, 12).map((ind, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  <span className="text-n-dim w-16">{ind.name}</span>
                  <span className="text-n-text">{ind.condition}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-medium ${ind.accuracy > 60 ? 'text-n-green' : ind.accuracy < 45 ? 'text-n-red' : 'text-n-text'}`}>{ind.accuracy}%</span>
                  <span className="text-n-dim">{ind.signals}n</span>
                  <span className={`font-mono ${ind.avgReturn > 0 ? 'text-n-green' : 'text-n-red'}`}>{ind.avgReturn > 0 ? '+' : ''}{ind.avgReturn}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {patterns.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="label mb-3">Pattern rilevati ({patterns.length})</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {patterns.slice(0, 8).map((p, i) => (
              <div key={i} className="rounded-lg bg-n-bg/50 p-2.5">
                <p className="text-[10px] text-n-dim">{p.pattern}</p>
                <p className={`font-mono text-sm font-medium ${p.winRate > 60 ? 'text-n-green' : p.winRate < 45 ? 'text-n-red' : 'text-n-text'}`}>{p.winRate}% WR</p>
                <p className="text-[9px] text-n-dim">{p.occurrences}x · avg {p.avgReturn > 0 ? '+' : ''}{p.avgReturn}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategies */}
      {strategies.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="label mb-3">Strategie ranked ({strategies.length})</h3>
          <div className="space-y-1.5">
            {strategies.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-n-dim w-5">{i + 1}.</span>
                  {s.grade && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${GRADE_COLORS[s.grade] ?? ''}`}>{s.grade}</span>}
                  <span className="text-xs font-medium text-n-text">{s.name}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-n-dim">
                  <span>WR {s.winRate}%</span>
                  <span>Ret {s.totalReturn > 0 ? '+' : ''}{s.totalReturn}%</span>
                  <span>S {s.sharpe}</span>
                  {s.sl > 0 && <span>SL {s.sl}%</span>}
                  {s.tp > 0 && <span>TP {s.tp}%</span>}
                  <span>{s.trades}t</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {report && (
        <div className="rounded-xl border-2 border-green-500/20 bg-green-500/5 p-5 space-y-3">
          <h3 className="text-sm font-medium text-n-text flex items-center gap-2"><BookOpen size={14} /> Rapporto: {report.asset} — {report.timeframe}</h3>
          <p className="text-xs text-n-dim">{report.candlesAnalyzed} candele analizzate · {report.totalStrategiesTested} strategie testate</p>

          {report.recommended?.length > 0 && (
            <div>
              <p className="text-xs text-n-green font-medium mb-1">Strategie consigliate:</p>
              {report.recommended.map((s: any, i: number) => (
                <p key={i} className="text-xs text-n-text">→ {s.name} — SL {s.sl}% · TP {s.tp}% · WR {s.winRate}% · Sharpe {s.sharpe}</p>
              ))}
            </div>
          )}

          {report.avoid?.length > 0 && (
            <div>
              <p className="text-xs text-n-red font-medium mb-1">Da evitare:</p>
              {report.avoid.map((s: any, i: number) => (
                <p key={i} className="text-xs text-n-dim">✗ {s.name} — WR {s.winRate}%</p>
              ))}
            </div>
          )}

          {report.insights?.length > 0 && (
            <div>
              <p className="text-xs text-n-text font-medium mb-1">Insights:</p>
              {report.insights.map((insight: string, i: number) => (
                <p key={i} className="text-xs text-n-dim">• {insight}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {p1 === 'idle' && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-10 text-center">
          <FlaskConical size={32} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-medium text-n-text-s">Seleziona un asset e clicca "Investigazione Completa"</p>
          <p className="mt-1 text-xs text-n-dim">Il sistema scaricherà lo storico, testerà ogni indicatore, pattern e strategia, e genererà un rapporto dettagliato con raccomandazioni.</p>
        </div>
      )}
    </div>
  );
}
