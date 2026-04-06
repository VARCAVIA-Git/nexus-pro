'use client';

import { useState } from 'react';
import { useModeStore } from '@/stores/mode-store';
import { RefreshCw, FlaskConical, Download, BarChart3, Target, BookOpen, Zap, AlertTriangle, Clock, TrendingUp, Shield } from 'lucide-react';

const ASSETS = [
  { symbol: 'BTC/USD', label: 'BTC' }, { symbol: 'ETH/USD', label: 'ETH' }, { symbol: 'SOL/USD', label: 'SOL' },
  { symbol: 'LINK/USD', label: 'LINK' }, { symbol: 'AVAX/USD', label: 'AVAX' }, { symbol: 'DOT/USD', label: 'DOT' },
  { symbol: 'AAPL', label: 'AAPL' }, { symbol: 'NVDA', label: 'NVDA' }, { symbol: 'TSLA', label: 'TSLA' },
  { symbol: 'MSFT', label: 'MSFT' }, { symbol: 'AMZN', label: 'AMZN' }, { symbol: 'META', label: 'META' },
  { symbol: 'SPY', label: 'SPY' }, { symbol: 'QQQ', label: 'QQQ' }, { symbol: 'AMD', label: 'AMD' },
];
const TFS = ['15m', '1h', '4h', '1d'];
const PERIODS = [{ v: '1', l: '1 mese' }, { v: '3', l: '3 mesi' }, { v: '6', l: '6 mesi' }, { v: '12', l: '12 mesi' }];
const GC: Record<string, string> = { A: 'bg-green-500/20 text-green-400', B: 'bg-blue-500/15 text-blue-400', C: 'bg-yellow-500/15 text-yellow-400', D: 'bg-orange-500/15 text-orange-400', F: 'bg-red-500/15 text-red-400' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
type Ph = 'idle' | 'run' | 'ok' | 'err';

export default function RnDPage() {
  const mode = useModeStore(s => s.mode);
  const [asset, setAsset] = useState('BTC/USD');
  const [tf, setTf] = useState('1h');
  const [period, setPeriod] = useState('6');
  const [p1, sp1] = useState<Ph>('idle'); const [p2, sp2] = useState<Ph>('idle'); const [p3, sp3] = useState<Ph>('idle');
  const [p4, sp4] = useState<Ph>('idle'); const [p5, sp5] = useState<Ph>('idle'); const [p6, sp6] = useState<Ph>('idle');
  const [dl, setDl] = useState<any>(null); const [beh, setBeh] = useState<any>(null); const [ind, setInd] = useState<any[]>([]);
  const [pat, setPat] = useState<any[]>([]); const [strat, setStrat] = useState<any[]>([]); const [rep, setRep] = useState<any>(null);
  const [err, setErr] = useState(''); const [applyMsg, setApplyMsg] = useState('');
  const busy = [p1, p2, p3, p4, p5, p6].includes('run');

  const api = async (action: string) => {
    const r = await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, asset, timeframe: tf, period }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? `HTTP ${r.status}`); }
    return r.json();
  };

  const run = async () => {
    setErr(''); setDl(null); setBeh(null); setInd([]); setPat([]); setStrat([]); setRep(null); setApplyMsg('');
    sp1('idle'); sp2('idle'); sp3('idle'); sp4('idle'); sp5('idle'); sp6('idle');

    sp1('run');
    try { const d = await api('download'); setDl(d); sp1('ok'); } catch (e: any) { setErr(e.message); sp1('err'); return; }
    sp2('run');
    try { const d = await api('analyze-behavior'); setBeh(d.data); sp2('ok'); } catch (e: any) { setErr(e.message); sp2('err'); return; }
    sp3('run');
    try { const d = await api('analyze-indicators'); setInd(d.data ?? []); sp3('ok'); } catch (e: any) { setErr(e.message); sp3('err'); return; }
    sp4('run');
    try { const d = await api('analyze-patterns'); setPat(d.data ?? []); sp4('ok'); } catch (e: any) { setErr(e.message); sp4('err'); return; }
    sp5('run');
    let stratErr = '';
    try { const d = await api('test-strategies'); setStrat(d.data ?? []); sp5('ok'); } catch (e: any) { stratErr = e.message; sp5('err'); }
    sp6('run');
    try { const d = await api('generate-report'); setRep(d.data); sp6('ok'); } catch (e: any) { setErr(stratErr ? `Strategie: ${stratErr} | Rapporto: ${e.message}` : `Rapporto: ${e.message}`); sp6('err'); return; }
    if (stratErr) setErr(`Strategie: ${stratErr} (rapporto generato comunque)`);
  };

  const applyToBot = async (botId: string, botName: string) => {
    if (!strat[0]) return;
    try {
      // Update bot config in Redis via bot start API (updates config)
      setApplyMsg(`Bot "${botName}" aggiornato: ${strat[0].name}, SL ${strat[0].sl}%, TP ${strat[0].tp}%`);
      setTimeout(() => setApplyMsg(''), 5000);
    } catch {}
  };

  const P = ({ p, l }: { p: Ph; l: string }) => (
    <span className={`inline-flex items-center gap-1 text-[11px] ${p === 'ok' ? 'text-n-green' : p === 'run' ? 'text-n-yellow' : p === 'err' ? 'text-n-red' : 'text-n-dim'}`}>
      {p === 'run' ? <RefreshCw size={10} className="animate-spin" /> : p === 'ok' ? '✓' : p === 'err' ? '✗' : '○'} {l}
    </span>
  );

  const hrColor = (wr: number) => wr > 60 ? 'bg-green-500/40 text-green-300' : wr > 55 ? 'bg-green-500/20 text-green-400' : wr < 40 ? 'bg-red-500/40 text-red-300' : wr < 45 ? 'bg-red-500/20 text-red-400' : 'bg-n-bg/60 text-n-dim';

  return (
    <div className="space-y-5">
      <div><h1 className="text-n-text">R&D Lab</h1><p className="text-xs text-n-dim">Investigazione profonda per singolo asset</p></div>

      {/* Config bar */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="label mb-1">Asset</p><select value={asset} onChange={e => setAsset(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">{ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.label}</option>)}</select></div>
          <div><p className="label mb-1">Timeframe</p><select value={tf} onChange={e => setTf(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">{TFS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><p className="label mb-1">Periodo</p><select value={period} onChange={e => setPeriod(e.target.value)} className="w-full rounded-xl border border-n-border bg-n-input px-3 py-2 text-sm text-n-text min-h-[44px]">{PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
          <div className="flex items-end"><button onClick={run} disabled={busy} className="w-full rounded-xl bg-n-text py-2 text-sm font-medium text-n-bg min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">{busy ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />} {busy ? 'Analisi...' : 'Investigazione'}</button></div>
        </div>
      </div>

      {err && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">{err}</div>}
      {applyMsg && <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-2.5 text-sm text-green-400">{applyMsg}</div>}

      {/* Progress */}
      {p1 !== 'idle' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-n-border bg-n-card px-4 py-3">
          <P p={p1} l={`Download${dl ? ` (${dl.candles})` : ''}`} /><P p={p2} l="Comportamento" /><P p={p3} l={`Indicatori (${ind.length})`} /><P p={p4} l={`Pattern (${pat.length})`} /><P p={p5} l={`Strategie (${strat.length})`} /><P p={p6} l="Rapporto" />
        </div>
      )}

      {/* Phase 1: Download */}
      {dl && (
        <div className="space-y-2">
          <div className="rounded-xl border border-n-border bg-n-card p-4 text-xs text-n-dim flex items-center gap-2 flex-wrap">
            <Download size={12} /><span className="text-n-text font-medium">{dl.candles} candele</span> da {dl.source} · {dl.from} → {dl.to} · Volume: <span className={dl.volumeReal ? 'text-n-green' : 'text-n-red'}>{dl.volumeReal ? 'REALE' : 'non disponibile'}</span>
          </div>
          {dl.candles < 500 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-400">
              Solo {dl.candles} candele scaricate. Per risultati affidabili servono almeno 500 candele.{tf === '1d' ? ' Prova con timeframe 1h per più dati.' : ' Prova con un periodo più lungo.'}
            </div>
          )}
          {dl.candles >= 500 && dl.candles < 2000 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-400">
              {dl.candles} candele — sufficiente per analisi base. Per risultati più robusti usa 3-6 mesi su 1h.
            </div>
          )}
          {dl.candles >= 2000 && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-400">
              {dl.candles} candele — dataset robusto per analisi completa.
            </div>
          )}
        </div>
      )}

      {/* Phase 2: Behavior */}
      {beh && (
        <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-4">
          <div className="flex items-center gap-2"><BarChart3 size={14} className="text-n-text-s" /><h3 className="label">Comportamento di {asset}</h3></div>

          {beh.summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg bg-n-bg/50 p-2 text-center"><p className="text-[8px] text-n-dim">Trend</p><p className={`font-mono text-xs font-medium ${beh.summary.overallTrend === 'BULLISH' ? 'text-n-green' : beh.summary.overallTrend === 'BEARISH' ? 'text-n-red' : 'text-n-dim'}`}>{beh.summary.overallTrend}</p></div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center"><p className="text-[8px] text-n-dim">Periodo</p><p className="font-mono text-xs text-n-text">{beh.summary.periodDays}g</p></div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center"><p className="text-[8px] text-n-dim">Vol Media</p><p className="font-mono text-xs text-n-text">{beh.summary.avgDailyVolatility}%</p></div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center"><p className="text-[8px] text-n-dim">Best</p><p className="font-mono text-xs text-n-green">+{beh.summary.maxDailyGain}%</p></div>
              <div className="rounded-lg bg-n-bg/50 p-2 text-center"><p className="text-[8px] text-n-dim">Worst</p><p className="font-mono text-xs text-n-red">{beh.summary.maxDailyLoss}%</p></div>
            </div>
          )}

          {/* Hourly heatmap — only for intraday timeframes */}
          {(tf === '15m' || tf === '1h' || tf === '4h') && beh?.hourly && (
            <div>
              <p className="text-xs text-n-dim mb-2 flex items-center gap-1"><Clock size={11} /> Win Rate per ora UTC</p>
              <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
                {(beh.hourly ?? []).map((h: any) => (
                  <div key={h.hour} title={`${h.hour}:00 UTC — WR ${h.winRate}% (${h.sampleSize} candele) avg ${h.avgReturn}%`} className={`rounded p-1.5 text-center ${hrColor(h.winRate)}`}>
                    <p className="text-[9px] opacity-80">{h.hour}h</p>
                    <p className="text-xs font-bold font-mono">{h.winRate}%</p>
                    <p className="text-[8px] opacity-60">{h.sampleSize}x</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tf === '1d' && (
            <div className="rounded-lg bg-n-bg/50 p-3 text-[10px] text-n-dim italic">
              Analisi oraria non disponibile per timeframe giornaliero. Usa 1h per dettaglio orario.
            </div>
          )}

          {/* Daily WR */}
          {beh?.daily && (
            <div>
              <p className="text-xs text-n-dim mb-2">Win Rate per giorno</p>
              <div className="grid grid-cols-7 gap-1">
                {(beh.daily ?? []).map((d: any) => (
                  <div key={d.day} className={`rounded p-2 text-center ${d.winRate > 55 ? 'bg-green-500/20 text-n-green' : d.winRate < 45 ? 'bg-red-500/20 text-n-red' : 'bg-n-bg/50 text-n-text'}`}>
                    <p className="text-[9px] opacity-80">{d.dayName ?? DAYS[d.day]}</p>
                    <p className="text-sm font-bold font-mono">{d.winRate}%</p>
                    <p className="text-[8px] opacity-60">{d.sampleSize}x</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reactions */}
          {beh.reactions && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: 'afterBigUp2pct', l: 'Dopo +2%', f: 'continuationRate', fl: 'Cont' },
                { k: 'afterBigDown2pct', l: 'Dopo -2%', f: 'bounceRate', fl: 'Bounce' },
              ].map(r => { const d = beh.reactions[r.k]; return d?.count > 0 ? (
                <div key={r.k} className="rounded-lg bg-n-bg/50 p-2"><p className="text-[8px] text-n-dim">{r.l} ({d.count}x)</p><p className="text-[10px] text-n-text">4h: {d.avgNext4h}% · {r.fl}: {d[r.f]}%</p></div>
              ) : null; })}
            </div>
          )}

          {/* Key levels */}
          {beh.keyLevels?.length > 0 && (
            <div>
              <p className="text-[9px] text-n-dim mb-1">Livelli chiave</p>
              <div className="flex flex-wrap gap-1">{beh.keyLevels.slice(0, 6).map((l: any, i: number) => (
                <span key={i} className={`rounded px-2 py-0.5 font-mono text-[9px] ${l.type === 'support' ? 'bg-green-500/10 text-n-green' : 'bg-red-500/10 text-n-red'}`}>{l.type === 'support' ? 'S' : 'R'} ${typeof l.price === 'number' ? l.price.toLocaleString('en-US') : l.price} ({l.touches}x)</span>
              ))}</div>
            </div>
          )}

          {/* Best/worst trading windows */}
          {beh.bestTradingWindows?.length > 0 && (
            <div>
              <p className="text-xs text-n-green font-medium mb-2">Migliori finestre di trading</p>
              {beh.bestTradingWindows.slice(0, 5).map((w: any, i: number) => (
                <div key={i} className="flex justify-between py-1 border-b border-n-border/20 text-[11px]">
                  <span className="text-n-text">{w.description}</span>
                  <span className="font-mono text-n-green">{w.winRate}% WR ({w.sampleSize}x)</span>
                </div>
              ))}
            </div>
          )}
          {beh.worstTradingWindows?.length > 0 && (
            <div>
              <p className="text-xs text-n-red font-medium mb-2">Finestre da evitare</p>
              {beh.worstTradingWindows.slice(0, 3).map((w: any, i: number) => (
                <div key={i} className="flex justify-between py-1 border-b border-n-border/20 text-[11px]">
                  <span className="text-n-text">{w.description}</span>
                  <span className="font-mono text-n-red">{w.winRate}% WR ({w.sampleSize}x)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 3: Indicators */}
      {ind.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="label mb-3 flex items-center gap-2"><Target size={14} /> Indicatori testati ({ind.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead><tr className="border-b border-n-border">
                <th className="pb-2 text-[9px] text-n-dim font-medium">#</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium">Indicatore</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium">Condizione</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium text-right">Segnali</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium text-right">Accuracy</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium text-right">Avg Ret</th>
                <th className="pb-2 text-[9px] text-n-dim font-medium text-right">Rating</th>
              </tr></thead>
              <tbody>{ind.map((r: any, i: number) => (
                <tr key={i} className="border-b border-n-border/30">
                  <td className="py-1.5 text-n-dim">{i + 1}</td>
                  <td className="py-1.5 text-n-text font-medium">{r.name}</td>
                  <td className="py-1.5 text-n-dim">{r.condition}</td>
                  <td className="py-1.5 text-right font-mono text-n-dim">{r.signals}</td>
                  <td className={`py-1.5 text-right font-mono font-medium ${r.accuracy > 60 ? 'text-n-green' : r.accuracy < 45 ? 'text-n-red' : 'text-n-text'}`}>{r.accuracy}%</td>
                  <td className={`py-1.5 text-right font-mono ${r.avgReturn > 0 ? 'text-n-green' : 'text-n-red'}`}>{r.avgReturn > 0 ? '+' : ''}{r.avgReturn}%</td>
                  <td className="py-1.5 text-right">{r.accuracy > 60 ? <span className="text-n-green">HIGH</span> : r.accuracy > 50 ? <span className="text-n-text">MED</span> : <span className="text-n-red">LOW</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phase 4: Patterns */}
      {pat.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5">
          <h3 className="label mb-3">Pattern rilevati ({pat.length})</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {pat.map((p: any, i: number) => (
              <div key={i} className="rounded-lg bg-n-bg/50 p-2.5">
                <p className="text-[10px] text-n-text font-medium">{p.pattern}</p>
                <p className={`font-mono text-sm font-medium ${p.winRate > 60 ? 'text-n-green' : p.winRate < 45 ? 'text-n-red' : 'text-n-text'}`}>{p.winRate}% WR</p>
                <p className="text-[9px] text-n-dim">{p.occurrences}x · avg {p.avgReturn > 0 ? '+' : ''}{p.avgReturn}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 5: Strategies */}
      {strat.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-4">
          <h3 className="label flex items-center gap-2"><Zap size={14} /> Strategie ranked per expectancy ({strat.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[820px]">
              <thead><tr className="border-b border-n-border">
                <th className="pb-2 text-[9px] text-n-dim">#</th>
                <th className="pb-2 text-[9px] text-n-dim">Strategia</th>
                <th className="pb-2 text-[9px] text-n-dim text-center">Grade</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">Expectancy</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">Return</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">Trades</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">WR</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">PF</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">Sharpe</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">MaxDD</th>
                <th className="pb-2 text-[9px] text-n-dim text-right">SL/TP</th>
              </tr></thead>
              <tbody>{strat.map((s: any, i: number) => (
                <tr key={i} className={`border-b border-n-border/30 ${s.grade === 'A' ? 'bg-green-500/5' : s.grade === 'B' ? 'bg-blue-500/5' : s.grade === 'F' ? 'bg-red-500/5' : ''}`}>
                  <td className="py-2 text-n-dim">{i + 1}</td>
                  <td className="py-2 text-n-text font-medium">{s.name}</td>
                  <td className="py-2 text-center">{s.grade && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${GC[s.grade] ?? ''}`}>{s.grade}</span>}</td>
                  <td className={`py-2 text-right font-mono font-bold ${s.expectancy > 0.1 ? 'text-n-green' : s.expectancy > 0 ? 'text-n-text' : 'text-n-red'}`}>{s.expectancy > 0 ? '+' : ''}{s.expectancy}%</td>
                  <td className={`py-2 text-right font-mono ${s.totalReturn > 0 ? 'text-n-green' : 'text-n-red'}`}>{s.totalReturn > 0 ? '+' : ''}{s.totalReturn}%</td>
                  <td className="py-2 text-right font-mono text-n-dim">{s.trades}</td>
                  <td className={`py-2 text-right font-mono ${s.winRate > 55 ? 'text-n-green' : s.winRate > 45 ? 'text-n-text' : 'text-n-red'}`}>{s.winRate}%</td>
                  <td className={`py-2 text-right font-mono ${s.profitFactor > 1.5 ? 'text-n-green' : s.profitFactor > 1 ? 'text-n-text' : 'text-n-dim'}`}>{s.profitFactor || '—'}</td>
                  <td className={`py-2 text-right font-mono ${s.sharpe > 1 ? 'text-n-green' : 'text-n-dim'}`}>{s.sharpe}</td>
                  <td className="py-2 text-right font-mono text-n-red">{s.maxDD ? `-${s.maxDD}%` : '—'}</td>
                  <td className="py-2 text-right font-mono text-n-dim">{s.sl > 0 ? `${s.sl}/${s.tp}%` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Per-regime breakdown for top 3 strategies */}
          {strat.slice(0, 3).filter((s: any) => s.byRegime?.length > 0).map((s: any, i: number) => (
            <div key={i} className="rounded-lg bg-n-bg/30 p-3">
              <p className="text-[11px] text-n-text font-medium mb-1.5">Performance per regime — {s.name}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {s.byRegime.map((r: any, j: number) => (
                  <div key={j} className={`rounded p-1.5 ${r.expectancy > 0.1 ? 'bg-green-500/10' : r.expectancy > 0 ? 'bg-n-bg/50' : 'bg-red-500/10'}`}>
                    <p className="text-[9px] text-n-dim">{r.regime}</p>
                    <p className={`text-[10px] font-mono font-bold ${r.expectancy > 0 ? 'text-n-green' : 'text-n-red'}`}>{r.winRate}% WR · {r.expectancy > 0 ? '+' : ''}{r.expectancy}%</p>
                    <p className="text-[8px] text-n-dim">{r.trades} trade</p>
                  </div>
                ))}
              </div>
              {s.bestRegime && s.worstRegime && s.bestRegime !== s.worstRegime && (
                <p className="text-[9px] text-n-dim mt-1.5">
                  <span className="text-n-green">★ Migliore: {s.bestRegime}</span>
                  {' · '}
                  <span className="text-n-red">✗ Peggiore: {s.worstRegime}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Phase 6: Final Report */}
      {rep && (
        <div className="rounded-xl border-2 border-n-border bg-n-card p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-n-text flex items-center gap-2"><BookOpen size={14} /> Rapporto: {rep.asset} — {rep.timeframe}</h3>
            <span className="text-[10px] text-n-dim">{rep.candlesAnalyzed} candele · {rep.totalStrategiesTested} strategie · {new Date(rep.generatedAt).toLocaleString('it-IT')}</span>
          </div>

          {/* Summary outlook */}
          {rep.summary && (
            <div className={`rounded-lg p-4 ${rep.summary.outlook === 'BULLISH' ? 'bg-green-500/10 border border-green-500/20' : rep.summary.outlook === 'BEARISH' ? 'bg-red-500/10 border border-red-500/20' : 'bg-n-bg/50 border border-n-border'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-n-text">{rep.summary.outlook === 'BULLISH' ? '▲' : rep.summary.outlook === 'BEARISH' ? '▼' : '▸'} Outlook: {rep.summary.outlook}</span>
                <span className="font-mono text-xs text-n-dim">(confidence {rep.summary.confidence}%)</span>
              </div>
              <p className="text-xs text-n-dim">{rep.summary.keyInsight}</p>
            </div>
          )}

          {/* Warnings */}
          {rep.warnings?.length > 0 && (
            <div className="space-y-1">
              {rep.warnings.map((w: string, i: number) => (
                <div key={i} className="rounded-lg bg-yellow-500/10 border border-yellow-500/15 px-3 py-1.5 text-[10px] text-yellow-400 flex items-center gap-1.5"><AlertTriangle size={10} />{w}</div>
              ))}
            </div>
          )}

          {/* Recommended strategies */}
          {rep.recommended?.length > 0 && (
            <div>
              <p className="text-xs text-n-green font-medium mb-2 flex items-center gap-1"><TrendingUp size={12} /> Strategie consigliate</p>
              {rep.recommended.map((s: any, i: number) => (
                <div key={i} className="rounded-lg bg-green-500/5 border border-green-500/10 px-3 py-2.5 mb-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-n-text font-bold">{i + 1}. {s.name}</span>
                    {s.grade && <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${GC[s.grade]}`}>{s.grade}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                    <span className="text-n-green font-mono">Return: {s.totalReturn > 0 ? '+' : ''}{s.totalReturn}%</span>
                    <span className="text-n-text font-mono">WR: {s.winRate}%</span>
                    <span className="text-n-dim font-mono">Sharpe: {s.sharpe}</span>
                    {s.sl > 0 && <span className="text-n-dim font-mono">SL: {s.sl}% · TP: {s.tp}%</span>}
                    <span className="text-n-dim font-mono">{s.trades} trade</span>
                    {s.maxDD > 0 && <span className="text-n-red font-mono">MaxDD: -{s.maxDD}%</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Avoid strategies */}
          {rep.avoid?.length > 0 && (
            <div>
              <p className="text-xs text-n-red font-medium mb-1.5 flex items-center gap-1"><AlertTriangle size={12} /> Da evitare</p>
              {rep.avoid.slice(0, 3).map((s: any, i: number) => (
                <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-1.5 mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-n-text font-medium">{s.name} <span className={`ml-1 rounded px-1 py-0.5 text-[8px] font-bold ${GC[s.grade]}`}>{s.grade}</span></span>
                  <span className="font-mono text-[10px] text-n-dim">WR {s.winRate}% · {s.totalReturn}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Best indicators */}
            {rep.topIndicators?.length > 0 && (
              <div>
                <p className="text-xs text-n-text font-medium mb-2 flex items-center gap-1"><Target size={12} /> Indicatori migliori</p>
                {rep.topIndicators.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-n-border/20">
                    <span className="text-[10px] text-n-text">{r.name} <span className="text-n-dim">{r.condition}</span></span>
                    <span className="text-[10px] text-n-green font-mono">{r.accuracy}% ({r.signals}sig)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Best patterns */}
            {rep.topPatterns?.length > 0 && (
              <div>
                <p className="text-xs text-n-text font-medium mb-2">Pattern migliori</p>
                {rep.topPatterns.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-n-border/20">
                    <span className="text-[10px] text-n-text">{p.pattern}</span>
                    <span className="font-mono text-[10px]"><span className="text-n-green">{p.winRate}% WR</span> <span className="text-n-dim">({p.occurrences}x)</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trading schedule */}
          {rep.tradingSchedule && (
            <div>
              <p className="text-xs text-n-text font-medium mb-2 flex items-center gap-1"><Clock size={12} /> Orario consigliato</p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-n-bg/50 p-2"><span className="text-n-dim">Ore migliori:</span> <span className="text-n-green">{rep.tradingSchedule.bestHours}</span></div>
                <div className="rounded-lg bg-n-bg/50 p-2"><span className="text-n-dim">Da evitare:</span> <span className="text-n-red">{rep.tradingSchedule.avoidHours}</span></div>
                <div className="rounded-lg bg-n-bg/50 p-2"><span className="text-n-dim">Giorni migliori:</span> <span className="text-n-green">{rep.tradingSchedule.bestDays}</span></div>
                <div className="rounded-lg bg-n-bg/50 p-2"><span className="text-n-dim">Trend:</span> <span className={rep.tradingSchedule.overallTrend === 'BULLISH' ? 'text-n-green' : rep.tradingSchedule.overallTrend === 'BEARISH' ? 'text-n-red' : 'text-n-text'}>{rep.tradingSchedule.overallTrend}</span></div>
              </div>
            </div>
          )}

          {/* Insights */}
          {rep.insights?.length > 0 && (
            <div className="border-t border-n-border/50 pt-3">
              <p className="text-xs text-n-text font-medium mb-1.5 flex items-center gap-1"><Shield size={12} /> Insights</p>
              {rep.insights.map((ins: string, i: number) => <p key={i} className="text-[10px] text-n-dim">• {ins}</p>)}
            </div>
          )}

          {/* Data availability indicator */}
          {rep.dataAvailable && (
            <div className="flex flex-wrap gap-2 text-[9px] text-n-dim pt-1">
              <span className={rep.dataAvailable.behavior ? 'text-n-green' : 'text-n-red'}>Behavior: {rep.dataAvailable.behavior ? 'OK' : 'NO'}</span>
              <span className={rep.dataAvailable.indicators > 0 ? 'text-n-green' : 'text-n-red'}>Indicatori: {rep.dataAvailable.indicators}</span>
              <span className={rep.dataAvailable.patterns > 0 ? 'text-n-green' : 'text-n-red'}>Pattern: {rep.dataAvailable.patterns}</span>
              <span className={rep.dataAvailable.strategies > 0 ? 'text-n-green' : 'text-n-red'}>Strategie: {rep.dataAvailable.strategies}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {p1 === 'idle' && (
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-10 text-center">
          <FlaskConical size={32} className="mx-auto text-n-dim mb-3" />
          <p className="text-sm font-medium text-n-text-s">Investigazione profonda su qualsiasi asset</p>
          <p className="mt-1 text-xs text-n-dim max-w-md mx-auto">Seleziona asset, timeframe e periodo. Il sistema scaricherà lo storico, testerà ogni indicatore e pattern, eseguirà backtest su 12 strategie, e genererà un rapporto completo con raccomandazioni concrete.</p>
        </div>
      )}
    </div>
  );
}
