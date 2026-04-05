'use client';

import { useState, useEffect } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import type { MasterSignal, EconomicEvent } from '@/types/intelligence';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Calendar, Newspaper,
  BarChart3, ChevronDown, AlertTriangle, Zap, Target, Shield,
} from 'lucide-react';

const REC_COLORS: Record<string, string> = {
  STRONG_ENTER: 'bg-green-500/20 text-green-400',
  ENTER: 'bg-green-500/10 text-green-400',
  HOLD: 'bg-n-border text-n-dim',
  EXIT: 'bg-red-500/10 text-red-400',
  STRONG_EXIT: 'bg-red-500/20 text-red-400',
};

const IMPACT_COLORS: Record<string, string> = {
  low: 'bg-n-border text-n-dim',
  medium: 'bg-yellow-500/15 text-yellow-400',
  high: 'bg-orange-500/15 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

function AlignmentArrows({ alignment, direction }: { alignment: string; direction: string }) {
  if (alignment === 'strong') return <span className={direction === 'long' ? 'text-green-400' : 'text-red-400'}>{'↑↑↑'}</span>;
  if (alignment === 'moderate') return <span className="text-yellow-400">{'↑↑↓'}</span>;
  if (alignment === 'conflicting') return <span className="text-red-400">{'↑↓↑'}</span>;
  return <span className="text-n-dim">{'→→→'}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score > 65 ? 'bg-green-400' : score > 45 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-n-border">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-[10px] font-bold text-n-text">{score}</span>
    </div>
  );
}

export default function IntelligencePage() {
  const [signals, setSignals] = useState<MasterSignal[]>([]);
  const [calendar, setCalendar] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence');
      if (res.ok) {
        const d = await res.json();
        setSignals(d.signals ?? []);
        setCalendar(d.calendar ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Intelligence</h1>
          <p className="text-xs text-n-dim">Multi-timeframe analysis + News + Calendario economico</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors disabled:opacity-50 self-start">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Aggiorna
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <RefreshCw size={28} className="mx-auto animate-spin text-n-dim" />
            <p className="mt-3 text-xs text-n-dim">Analisi multi-timeframe in corso...</p>
            <p className="mt-1 text-[10px] text-n-dim">Fetch dati da CoinGecko + Twelve Data + Alpaca News</p>
          </div>
        </div>
      ) : (
        <>
          {/* ═══ MARKET OVERVIEW TABLE ═══ */}
          <div className="rounded-xl border border-n-border bg-n-card">
            <div className="border-b border-n-border px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} className="text-n-text-s" />
                <h2 className="text-xs font-bold text-n-text">Market Overview</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[650px]">
                <thead>
                  <tr className="border-b border-n-border">
                    <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Asset</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">MTF</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">News</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Score</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Recommendation</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim">Calendar</th>
                    <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-n-dim"></th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => (
                    <>
                      <tr key={s.asset} className="border-b border-n-border/50 transition-colors hover:bg-n-card-h cursor-pointer" onClick={() => setExpanded(expanded === s.asset ? null : s.asset)}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs font-bold text-n-text">{s.asset}</p>
                          <p className="text-[9px] text-n-dim">{s.direction}</p>
                        </td>
                        <td className="px-3 py-3">
                          <AlignmentArrows alignment={s.components.mtf.alignment} direction={s.direction} />
                          <p className="text-[9px] text-n-dim">{s.components.mtf.alignment}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-n-border">
                            <div className={`h-full rounded-full ${s.components.news.score > 20 ? 'bg-green-400' : s.components.news.score < -20 ? 'bg-red-400' : 'bg-gray-400'}`}
                              style={{ width: `${50 + s.components.news.score / 2}%`, marginLeft: s.components.news.score < 0 ? `${50 + s.components.news.score / 2}%` : '50%' }} />
                          </div>
                          <p className="font-mono text-[9px] text-n-dim">{s.components.news.score > 0 ? '+' : ''}{s.components.news.score}</p>
                        </td>
                        <td className="px-3 py-3"><ScoreBar score={s.score} /></td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${REC_COLORS[s.recommendation] ?? ''}`}>
                            {s.recommendation.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {s.components.calendar.blocked ? (
                            <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle size={10} /> Blocked</span>
                          ) : s.components.calendar.nearbyEvents.length > 0 ? (
                            <span className="text-[10px] text-yellow-400">{s.components.calendar.nearbyEvents[0]?.name?.slice(0, 15)}</span>
                          ) : (
                            <span className="text-[10px] text-n-dim">Clear</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <ChevronDown size={12} className={`text-n-dim transition-transform ${expanded === s.asset ? 'rotate-180' : ''}`} />
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {expanded === s.asset && (
                        <tr key={`${s.asset}-detail`}>
                          <td colSpan={7} className="border-b border-n-border bg-n-bg/30 px-4 py-4">
                            <div className="space-y-4 animate-fade-in">
                              {/* Timeframe grid */}
                              <div>
                                <p className="mb-2 text-[10px] font-bold text-n-dim">MULTI-TIMEFRAME ANALYSIS</p>
                                <div className="grid grid-cols-5 gap-2">
                                  {(['15m', '1h', '4h', '1d', '1w'] as const).map((tf) => {
                                    const a = s.components.mtf.timeframes[tf];
                                    return (
                                      <div key={tf} className="rounded-lg bg-n-card p-2.5 text-center">
                                        <p className="text-[9px] font-bold text-n-dim">{tf}</p>
                                        <p className={`font-mono text-xs font-bold ${a.trend === 'bullish' ? 'text-green-400' : a.trend === 'bearish' ? 'text-red-400' : 'text-n-dim'}`}>
                                          {a.trend === 'bullish' ? '↑' : a.trend === 'bearish' ? '↓' : '→'} {a.strength}
                                        </p>
                                        <div className="mt-1 space-y-0.5 text-[8px] text-n-dim">
                                          <p>RSI {a.indicators.rsi.toFixed(0)}</p>
                                          <p>ADX {a.indicators.adx.toFixed(0)}</p>
                                          <p>{a.indicators.emaCross ? 'EMA ↑' : 'EMA ↓'}</p>
                                        </div>
                                        {a.support > 0 && <p className="mt-1 font-mono text-[8px] text-n-dim">S:{fmtDollar(a.support)}</p>}
                                        {a.resistance > 0 && <p className="font-mono text-[8px] text-n-dim">R:{fmtDollar(a.resistance)}</p>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* News */}
                              {s.components.news.latestHeadlines.length > 0 && (
                                <div>
                                  <p className="mb-2 text-[10px] font-bold text-n-dim">NEWS SENTIMENT ({s.components.news.score > 0 ? '+' : ''}{s.components.news.score})</p>
                                  <div className="space-y-1">
                                    {s.components.news.latestHeadlines.map((h, i) => (
                                      <div key={i} className="flex items-start gap-2 rounded bg-n-card px-2 py-1.5">
                                        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${h.sentiment === 'positive' ? 'bg-green-400' : h.sentiment === 'negative' ? 'bg-red-400' : 'bg-gray-400'}`} />
                                        <p className="text-[10px] text-n-text leading-snug">{h.title}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Reasoning */}
                              <div>
                                <p className="mb-2 text-[10px] font-bold text-n-dim">REASONING</p>
                                <div className="space-y-1">
                                  {s.reasoning.map((r, i) => (
                                    <p key={i} className="text-[10px] text-n-text-s">• {r}</p>
                                  ))}
                                </div>
                              </div>

                              {/* Trade suggestion */}
                              {s.recommendation !== 'HOLD' && s.suggestedSL > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded bg-n-card p-2 text-center">
                                    <p className="text-[8px] text-n-dim">Suggested SL</p>
                                    <p className="font-mono text-[11px] font-bold text-red-400" suppressHydrationWarning>{fmtDollar(s.suggestedSL)}</p>
                                  </div>
                                  <div className="rounded bg-n-card p-2 text-center">
                                    <p className="text-[8px] text-n-dim">Suggested TP</p>
                                    <p className="font-mono text-[11px] font-bold text-green-400" suppressHydrationWarning>{fmtDollar(s.suggestedTP)}</p>
                                  </div>
                                  <div className="rounded bg-n-card p-2 text-center">
                                    <p className="text-[8px] text-n-dim">Size</p>
                                    <p className="font-mono text-[11px] font-bold text-n-text">{s.suggestedSize === 1 ? '100%' : '50%'}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ UPCOMING EVENTS ═══ */}
          {calendar.length > 0 && (
            <div className="rounded-xl border border-n-border bg-n-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Calendar size={14} className="text-n-text-s" />
                <h2 className="text-xs font-bold text-n-text">Calendario Economico</h2>
              </div>
              <div className="space-y-1.5">
                {calendar.slice(0, 10).map((e, i) => {
                  const date = new Date(e.datetime);
                  const isPast = date < new Date();
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-lg bg-n-bg/50 px-3 py-2 ${isPast ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${IMPACT_COLORS[e.impact] ?? ''}`}>
                          {e.impact.toUpperCase()}
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-n-text">{e.name}</p>
                          <p className="text-[9px] text-n-dim">{e.affectsAssets.slice(0, 4).join(', ')}</p>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-n-dim" suppressHydrationWarning>
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
