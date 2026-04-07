'use client';

import { useState, useEffect } from 'react';
import { fmtPercent } from '@/lib/utils/format';
import type { AssetInsights, AdaptiveWeights, OptimizedParams } from '@/lib/analytics/learning/types';
import {
  Brain, RefreshCw, TrendingUp, Clock, BarChart3, Target, Zap, AlertTriangle,
} from 'lucide-react';

function SampleBadge({ size }: { size: number }) {
  if (size < 10) return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">Dati insufficienti ({size})</span>;
  if (size < 30) return <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[9px] font-bold text-yellow-400">Preliminari ({size})</span>;
  if (size < 100) return <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-400">Affidabili ({size})</span>;
  return <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">Robusti ({size})</span>;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

export default function LearningPage() {
  const [data, setData] = useState<{
    totalOutcomes: number;
    insights: Record<string, AssetInsights>;
    weights: Record<string, AdaptiveWeights>;
    optimizations: Record<string, OptimizedParams[]>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/learning');
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={24} className="animate-spin text-n-dim" /></div>;

  const assets = data ? Object.keys(data.insights) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Adaptive Learning</h1>
          <p className="text-xs text-n-dim">Analisi storica per migliorare le decisioni future — {data?.totalOutcomes ?? 0} trade analizzati</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors self-start">
          <RefreshCw size={13} /> Aggiorna
        </button>
      </div>

      {(data?.totalOutcomes ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-n-border bg-n-card/50 py-16">
          <Brain size={40} className="text-n-dim mb-3" />
          <p className="text-sm font-semibold text-n-text-s">Nessun trade da analizzare</p>
          <p className="mt-1 text-xs text-n-dim text-center px-6">
            Il sistema inizierà a imparare dopo che il bot avrà eseguito almeno 10 trade. Avvia un bot dalla pagina Strategy.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-n-bg/60 p-3"><p className="font-mono text-lg font-bold text-red-400">&lt;10</p><p className="text-[9px] text-n-dim">Insufficiente</p></div>
            <div className="rounded-lg bg-n-bg/60 p-3"><p className="font-mono text-lg font-bold text-yellow-400">10-30</p><p className="text-[9px] text-n-dim">Preliminare</p></div>
            <div className="rounded-lg bg-n-bg/60 p-3"><p className="font-mono text-lg font-bold text-green-400">100+</p><p className="text-[9px] text-n-dim">Robusto</p></div>
          </div>
        </div>
      ) : (
        <>
          {/* Per-asset insights */}
          {assets.map(asset => {
            const insight = data!.insights[asset];
            const weight = data!.weights[asset];
            const opts = data!.optimizations[asset] ?? [];
            if (!insight) return null;

            return (
              <div key={asset} className="rounded-xl border border-n-border bg-n-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-mono text-sm font-bold text-n-text">{asset}</h2>
                    <SampleBadge size={insight.sampleSize} />
                  </div>
                </div>

                {insight.sampleSize >= 10 && (
                  <>
                    {/* Best strategy */}
                    {Object.keys(insight.bestStrategy).length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold text-n-dim">MIGLIORI STRATEGIE</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {Object.entries(insight.bestStrategy)
                            .sort(([,a], [,b]) => b.winRate - a.winRate)
                            .map(([name, stats]) => (
                              <div key={name} className="rounded-lg bg-n-bg/60 p-2.5">
                                <p className="text-[11px] font-semibold text-n-text">{name}</p>
                                <p className={`font-mono text-xs font-bold ${stats.winRate > 55 ? 'text-green-400' : stats.winRate < 45 ? 'text-red-400' : 'text-n-text'}`}>
                                  {stats.winRate.toFixed(1)}% WR
                                </p>
                                <p className="font-mono text-[9px] text-n-dim">{stats.trades} trades · avg {stats.avgPnlPct >= 0 ? '+' : ''}{stats.avgPnlPct.toFixed(1)}%</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Best timing */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-[10px] font-bold text-n-dim">TIMING</p>
                        <div className="space-y-1.5">
                          {insight.bestTiming.bestHours.length > 0 && (
                            <p className="text-[10px] text-n-text">
                              <span className="text-green-400">Migliori ore:</span> {insight.bestTiming.bestHours.map(h => `${h}:00`).join(', ')}
                            </p>
                          )}
                          {insight.bestTiming.worstDays.length > 0 && (
                            <p className="text-[10px] text-n-text">
                              <span className="text-red-400">Evita:</span> {insight.bestTiming.worstDays.map(d => DAY_NAMES[d]).join(', ')}
                            </p>
                          )}
                          {insight.bestTiming.bestDays.length > 0 && (
                            <p className="text-[10px] text-n-text">
                              <span className="text-green-400">Migliori giorni:</span> {insight.bestTiming.bestDays.map(d => DAY_NAMES[d]).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[10px] font-bold text-n-dim">NEWS IMPACT</p>
                        <div className="space-y-1">
                          {[
                            { label: 'Positive', stats: insight.newsImpact.positive, color: 'text-green-400' },
                            { label: 'Neutral', stats: insight.newsImpact.neutral, color: 'text-n-dim' },
                            { label: 'Negative', stats: insight.newsImpact.negative, color: 'text-red-400' },
                          ].map(n => n.stats.trades >= 5 ? (
                            <p key={n.label} className="text-[10px] text-n-text">
                              <span className={n.color}>{n.label}:</span> {n.stats.winRate.toFixed(0)}% WR ({n.stats.trades} trades)
                            </p>
                          ) : null)}
                        </div>
                      </div>
                    </div>

                    {/* Optimal parameters */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                        <p className="text-[9px] text-n-dim">Optimal RSI Buy</p>
                        <p className="font-mono text-xs font-bold text-n-text">{insight.optimalRSI.bestBuyRange[0]}-{insight.optimalRSI.bestBuyRange[1]}</p>
                      </div>
                      <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                        <p className="text-[9px] text-n-dim">Min Score</p>
                        <p className="font-mono text-xs font-bold text-n-text">{insight.optimalMinScore}</p>
                      </div>
                      <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                        <p className="text-[9px] text-n-dim">Event Impact</p>
                        <p className={`font-mono text-xs font-bold ${insight.eventImpact.nearEvent.winRate < insight.eventImpact.noEvent.winRate ? 'text-red-400' : 'text-green-400'}`}>
                          {insight.eventImpact.nearEvent.trades >= 5 ? `${insight.eventImpact.nearEvent.winRate.toFixed(0)}% vs ${insight.eventImpact.noEvent.winRate.toFixed(0)}%` : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-n-bg/60 p-2.5 text-center">
                        <p className="text-[9px] text-n-dim">Adaptive</p>
                        <p className="font-mono text-xs font-bold text-n-text">
                          {weight?.lastUpdated && weight.lastUpdated > 0 ? 'Active' : 'Default'}
                        </p>
                      </div>
                    </div>

                    {/* Optimization suggestions */}
                    {opts.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold text-n-dim">SUGGERIMENTI OTTIMIZZAZIONE</p>
                        <div className="space-y-1.5">
                          {opts.slice(0, 3).map(o => (
                            <div key={o.strategy} className="flex items-center justify-between rounded-lg bg-n-bg/40 px-3 py-2">
                              <div>
                                <p className="text-[11px] font-semibold text-n-text">{o.strategy}</p>
                                <p className="text-[9px] text-n-dim">SL: {o.optimalStopLoss}% · TP: {o.optimalTakeProfit}% · Conf: {(o.optimalConfidence * 100).toFixed(0)}%</p>
                              </div>
                              <div className="text-right">
                                <p className={`font-mono text-[11px] font-bold ${o.improvement.winRateDelta > 0 ? 'text-green-400' : o.improvement.winRateDelta < 0 ? 'text-red-400' : 'text-n-dim'}`}>
                                  {o.improvement.winRateDelta > 0 ? '+' : ''}{o.improvement.winRateDelta.toFixed(1)}% WR
                                </p>
                                <p className="text-[9px] text-n-dim">{o.sampleSize} trades</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
