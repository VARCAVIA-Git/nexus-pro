'use client';

import { useState, useEffect } from 'react';
import type { KnowledgeEntry } from '@/lib/engine/rnd/knowledge-base';
import type { TrainingResult } from '@/lib/engine/rnd/strategy-trainer';
import { Database, RefreshCw, FlaskConical, BookOpen, Zap } from 'lucide-react';

const TABS = ['Overview', 'Training', 'Knowledge Base'] as const;
type Tab = typeof TABS[number];

const GRADE_COLORS: Record<string, string> = { A: 'bg-green-500/20 text-green-400', B: 'bg-blue-500/15 text-blue-400', C: 'bg-yellow-500/15 text-yellow-400', D: 'bg-orange-500/15 text-orange-400', F: 'bg-red-500/15 text-red-400' };
const CONFIDENCE_COLORS: Record<string, string> = { low: 'bg-red-500/10 text-red-400', medium: 'bg-yellow-500/10 text-yellow-400', high: 'bg-green-500/10 text-green-400', very_high: 'bg-green-500/20 text-green-400' };

export default function RnDPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [warehouse, setWarehouse] = useState<any>(null);
  const [kbCount, setKbCount] = useState(0);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [training, setTraining] = useState<TrainingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [kbFilter, setKbFilter] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sRes, kbRes, trRes] = await Promise.allSettled([
        fetch('/api/rnd?action=status'), fetch('/api/rnd?action=knowledge'), fetch('/api/rnd?action=training-results'),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value.ok) { const d = await sRes.value.json(); setWarehouse(d.warehouse); setKbCount(d.knowledgeEntries); }
      if (kbRes.status === 'fulfilled' && kbRes.value.ok) { const d = await kbRes.value.json(); setKnowledge(d.knowledge ?? []); }
      if (trRes.status === 'fulfilled' && trRes.value.ok) { const d = await trRes.value.json(); setTraining(d.results ?? []); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const runAction = async (action: string, label: string) => {
    setActionLoading(true); setActionMsg(`${label}...`);
    try {
      const res = await fetch('/api/rnd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json();
      setActionMsg(d.ok ? `${label} completato` : `Errore: ${d.error ?? 'sconosciuto'}`);
      await fetchAll();
    } catch (e: any) { setActionMsg(`Errore: ${e.message}`); }
    setActionLoading(false);
    setTimeout(() => setActionMsg(''), 5000);
  };

  const filteredKb = knowledge.filter(k => !kbFilter || k.asset.toLowerCase().includes(kbFilter.toLowerCase()) || k.category.includes(kbFilter.toLowerCase()));

  // Group training results into a matrix
  const trainingMatrix: Record<string, Record<string, TrainingResult>> = {};
  for (const t of training) {
    if (!trainingMatrix[t.asset]) trainingMatrix[t.asset] = {};
    const existing = trainingMatrix[t.asset][t.timeframe];
    if (!existing || t.score > existing.score) trainingMatrix[t.asset][t.timeframe] = t;
  }
  const allTFs = [...new Set(training.map(t => t.timeframe))].sort();

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-n-text">R&D Lab</h1>
        <div className="flex gap-2">
          <button onClick={() => runAction('download-all', 'Download dati')} disabled={actionLoading} className="flex items-center gap-1.5 rounded-xl border border-n-border px-3 py-2 text-xs text-n-dim hover:text-n-text min-h-[40px] disabled:opacity-50">
            <Database size={12} className={actionLoading ? 'animate-spin' : ''} /> Aggiorna Dati
          </button>
          <button onClick={() => runAction('scan', 'Scansione')} disabled={actionLoading} className="flex items-center gap-1.5 rounded-xl border border-n-border px-3 py-2 text-xs text-n-dim hover:text-n-text min-h-[40px] disabled:opacity-50">
            <FlaskConical size={12} /> Scansione
          </button>
          <button onClick={() => runAction('train-all', 'Training')} disabled={actionLoading} className="flex items-center gap-1.5 rounded-xl bg-n-text px-3 py-2 text-xs font-medium text-n-bg min-h-[40px] disabled:opacity-50">
            <Zap size={12} /> Training
          </button>
        </div>
      </div>

      {actionMsg && <div className={`rounded-xl px-4 py-2.5 text-sm ${actionMsg.includes('Errore') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{actionMsg}</div>}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-n-border p-1">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${tab === t ? 'bg-n-card text-n-text' : 'text-n-dim hover:text-n-text'}`}>{t}</button>)}
      </div>

      {/* TAB: Overview */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-n-border bg-n-card p-4 text-center"><p className="label">Dataset</p><p className="mt-1 font-mono text-2xl font-medium text-n-text">{warehouse?.items?.length ?? 0}</p></div>
            <div className="rounded-xl border border-n-border bg-n-card p-4 text-center"><p className="label">Candele</p><p className="mt-1 font-mono text-2xl font-medium text-n-text">{warehouse?.items?.reduce((s: number, i: any) => s + (i.candles ?? 0), 0) ?? 0}</p></div>
            <div className="rounded-xl border border-n-border bg-n-card p-4 text-center"><p className="label">Knowledge</p><p className="mt-1 font-mono text-2xl font-medium text-n-text">{kbCount}</p></div>
          </div>

          {knowledge.length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-4">
              <h3 className="label mb-3">Ultime scoperte</h3>
              <div className="space-y-1.5">
                {knowledge.slice(0, 8).map(k => (
                  <div key={k.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-n-dim shrink-0">{k.asset}</span>
                      <span className="text-n-text-s truncate">{k.finding.slice(0, 60)}</span>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${CONFIDENCE_COLORS[k.confidence] ?? ''}`}>{(k.winRate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knowledge.length === 0 && (
            <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-8 text-center">
              <FlaskConical size={24} className="mx-auto text-n-dim mb-2" />
              <p className="text-sm text-n-dim">Clicca "Aggiorna Dati" poi "Scansione" per popolare la Knowledge Base</p>
            </div>
          )}
        </div>
      )}

      {/* TAB: Training */}
      {tab === 'Training' && (
        <div className="space-y-4">
          {Object.keys(trainingMatrix).length === 0 ? (
            <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-8 text-center">
              <Zap size={24} className="mx-auto text-n-dim mb-2" />
              <p className="text-sm text-n-dim">Clicca "Training" per testare tutte le combinazioni asset × timeframe × strategia</p>
            </div>
          ) : (
            <div className="rounded-xl border border-n-border bg-n-card overflow-x-auto">
              <table className="w-full text-left min-w-[500px]">
                <thead>
                  <tr className="border-b border-n-border">
                    <th className="px-3 py-2.5 text-[10px] font-medium text-n-dim">Asset</th>
                    {allTFs.map(tf => <th key={tf} className="px-3 py-2.5 text-[10px] font-medium text-n-dim text-center">{tf}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(trainingMatrix).map(([asset, tfs]) => (
                    <tr key={asset} className="border-b border-n-border/50">
                      <td className="px-3 py-2 font-mono text-xs font-medium text-n-text">{asset}</td>
                      {allTFs.map(tf => {
                        const r = tfs[tf];
                        return (
                          <td key={tf} className="px-3 py-2 text-center">
                            {r ? (
                              <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${GRADE_COLORS[r.grade] ?? ''}`} title={`${r.strategy} — WR ${r.metrics.winRate}% — Sharpe ${r.metrics.sharpe}`}>
                                {r.grade}-{r.strategy.slice(0, 4)}
                              </span>
                            ) : <span className="text-[10px] text-n-dim">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {training.filter(t => t.grade === 'A' || t.grade === 'B').length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-4">
              <h3 className="label mb-3">Top Combinazioni</h3>
              <div className="space-y-1.5">
                {training.filter(t => t.grade === 'A' || t.grade === 'B').slice(0, 10).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-n-text">{t.asset} × {t.timeframe} × {t.strategy}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${GRADE_COLORS[t.grade]}`}>{t.grade}</span>
                      <span className="font-mono text-n-dim">WR {t.metrics.winRate}% · S {t.metrics.sharpe}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Knowledge Base */}
      {tab === 'Knowledge Base' && (
        <div className="space-y-3">
          <input type="text" value={kbFilter} onChange={e => setKbFilter(e.target.value)} placeholder="Filtra per asset o categoria..." className="w-full rounded-xl border border-n-border bg-n-card px-4 py-2.5 text-sm text-n-text placeholder:text-n-dim focus:outline-none focus:border-n-accent" />

          {filteredKb.length === 0 ? (
            <p className="text-sm text-n-dim text-center py-8">Nessuna entry. Avvia "Scansione" per popolare.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredKb.slice(0, 40).map(k => (
                <div key={k.id} className="flex items-start gap-3 rounded-xl border border-n-border bg-n-card p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-mono text-[10px] text-n-dim">{k.asset}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${CONFIDENCE_COLORS[k.confidence] ?? ''}`}>{k.confidence}</span>
                      {k.actionable && <span className="rounded bg-green-500/10 px-1 py-0.5 text-[8px] font-medium text-green-400">ACTIONABLE</span>}
                    </div>
                    <p className="text-[11px] text-n-text leading-snug">{k.finding}</p>
                    <p className="text-[9px] text-n-dim mt-0.5">{k.recommendation}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono text-xs font-medium ${k.winRate > 0.6 ? 'text-n-green' : k.winRate < 0.4 ? 'text-n-red' : 'text-n-text'}`}>{(k.winRate * 100).toFixed(0)}%</p>
                    <p className="text-[8px] text-n-dim">{k.sampleSize}n</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
