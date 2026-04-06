'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtDollar, fmtPnl } from '@/lib/utils/format';
import type { IChartApi } from 'lightweight-charts';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Zap, Brain,
  AlertTriangle, ChevronDown, Calendar, Newspaper, Target,
} from 'lucide-react';
import Link from 'next/link';

const ALL_ASSETS = [
  // Crypto
  { symbol: 'BTC/USD', label: 'BTC', cat: 'crypto' }, { symbol: 'ETH/USD', label: 'ETH', cat: 'crypto' }, { symbol: 'SOL/USD', label: 'SOL', cat: 'crypto' },
  { symbol: 'LINK/USD', label: 'LINK', cat: 'crypto' }, { symbol: 'AVAX/USD', label: 'AVAX', cat: 'crypto' }, { symbol: 'DOT/USD', label: 'DOT', cat: 'crypto' },
  // Stocks
  { symbol: 'AAPL', label: 'AAPL', cat: 'stock' }, { symbol: 'NVDA', label: 'NVDA', cat: 'stock' }, { symbol: 'TSLA', label: 'TSLA', cat: 'stock' },
  { symbol: 'AMZN', label: 'AMZN', cat: 'stock' }, { symbol: 'MSFT', label: 'MSFT', cat: 'stock' }, { symbol: 'META', label: 'META', cat: 'stock' },
  { symbol: 'AMD', label: 'AMD', cat: 'stock' }, { symbol: 'NFLX', label: 'NFLX', cat: 'stock' }, { symbol: 'SPY', label: 'SPY', cat: 'stock' }, { symbol: 'QQQ', label: 'QQQ', cat: 'stock' },
];
const TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
const REC_COLORS: Record<string, string> = { STRONG_BUY: 'bg-green-500/20 text-green-400', BUY: 'bg-green-500/10 text-green-400', HOLD: 'bg-n-border text-n-dim', SELL: 'bg-red-500/10 text-red-400', STRONG_SELL: 'bg-red-500/20 text-red-400' };

export default function AnalysisPage() {
  const [asset, setAsset] = useState('BTC/USD');
  const [tf, setTf] = useState('1h');
  const [assetSearch, setAssetSearch] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const ASSETS = ALL_ASSETS.filter(a => !assetSearch || a.label.toLowerCase().includes(assetSearch.toLowerCase()) || a.symbol.toLowerCase().includes(assetSearch.toLowerCase()));

  // Fetch chart data + indicators on asset/tf change
  const fetchData = useCallback(async () => {
    setChartLoading(true);
    try {
      const res = await fetch('/api/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset, timeframe: tf }) });
      if (res.ok) setAnalysis(await res.json());
    } catch {}
    setChartLoading(false);
  }, [asset, tf]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Render chart (dynamic import to avoid SSR issues)
  useEffect(() => {
    if (!chartRef.current || !analysis?.chartData?.length) return;

    // Cleanup old chart
    if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }

    import('lightweight-charts').then(({ createChart: create }) => {
    if (!chartRef.current) return;

    const chart = create(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: window.innerWidth < 768 ? 280 : 420,
      layout: { background: { color: 'transparent' } as any, textColor: '#64748b' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    chartInstance.current = chart;

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#34d399', downColor: '#f87171',
      borderVisible: false, wickUpColor: '#34d399', wickDownColor: '#f87171',
    });

    const candleData = analysis.chartData.map((d: any) => {
      let ts: number;
      if (typeof d.date === 'string') {
        ts = Math.floor(new Date(d.date).getTime() / 1000);
      } else { ts = d.date; }
      return { time: ts as any, open: d.open, high: d.high, low: d.low, close: d.close };
    }).filter((d: any) => d.time > 0);

    if (candleData.length > 0) candleSeries.setData(candleData);

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const volData = analysis.chartData.map((d: any, i: number) => {
      let ts: number;
      if (typeof d.date === 'string') ts = Math.floor(new Date(d.date).getTime() / 1000);
      else ts = d.date;
      return { time: ts as any, value: d.volume, color: d.close >= d.open ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)' };
    }).filter((d: any) => d.time > 0);

    if (volData.length > 0) volumeSeries.setData(volData);

    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    }); // end dynamic import

    return () => { if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; } };
  }, [analysis]);

  const score = analysis?.score ?? 50;
  const dir = analysis?.direction ?? 'neutral';
  const rec = analysis?.recommendation ?? 'HOLD';

  return (
    <div className="space-y-5">
      {/* Asset + Timeframe selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Cerca..." className="rounded-lg border border-n-border bg-n-card px-2.5 py-1.5 text-xs text-n-text w-20 focus:outline-none focus:border-n-accent" />
          {ASSETS.slice(0, 12).map(a => (
            <button key={a.symbol} onClick={() => { setAsset(a.symbol); setAssetSearch(''); }} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${asset === a.symbol ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:text-n-text'}`}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-n-border p-0.5">
          {TFS.map(t => (
            <button key={t} onClick={() => setTf(t)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all ${tf === t ? 'bg-n-card text-n-text' : 'text-n-dim hover:text-n-text'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Left: Chart + Indicators */}
        <div className="xl:col-span-3 space-y-4">
          {/* Candlestick Chart */}
          <div className="rounded-xl border border-n-border bg-n-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="label">{asset} · {tf.toUpperCase()}</h3>
              {chartLoading && <RefreshCw size={14} className="animate-spin text-n-dim" />}
            </div>
            <div ref={chartRef} className="w-full" style={{ minHeight: 280 }} />
          </div>

          {/* Mini indicator panels */}
          {analysis?.indicators && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'RSI', value: analysis.indicators.rsi?.slice(-1)[0]?.toFixed(0) ?? '—', sub: analysis.indicators.rsi?.slice(-1)[0] < 30 ? 'Oversold' : analysis.indicators.rsi?.slice(-1)[0] > 70 ? 'Overbought' : 'Normal', color: analysis.indicators.rsi?.slice(-1)[0] < 30 ? 'text-n-green' : analysis.indicators.rsi?.slice(-1)[0] > 70 ? 'text-n-red' : 'text-n-text' },
                { name: 'MACD', value: analysis.indicators.macd?.histogram?.slice(-1)[0]?.toFixed(2) ?? '—', sub: (analysis.indicators.macd?.histogram?.slice(-1)[0] ?? 0) > 0 ? 'Bullish' : 'Bearish', color: (analysis.indicators.macd?.histogram?.slice(-1)[0] ?? 0) > 0 ? 'text-n-green' : 'text-n-red' },
                { name: 'ADX', value: analysis.indicators.adx?.slice(-1)[0]?.toFixed(0) ?? '—', sub: (analysis.indicators.adx?.slice(-1)[0] ?? 0) > 25 ? 'Strong trend' : 'Weak trend', color: (analysis.indicators.adx?.slice(-1)[0] ?? 0) > 25 ? 'text-n-text' : 'text-n-dim' },
                { name: 'Stoch %K', value: analysis.indicators.stochastic?.k?.slice(-1)[0]?.toFixed(0) ?? '—', sub: (analysis.indicators.stochastic?.k?.slice(-1)[0] ?? 50) < 20 ? 'Oversold' : (analysis.indicators.stochastic?.k?.slice(-1)[0] ?? 50) > 80 ? 'Overbought' : 'Normal', color: 'text-n-text' },
                { name: 'Regime', value: analysis.regime ?? 'NORMAL', sub: '', color: 'text-n-text' },
                { name: 'Volume', value: analysis.indicators.volume?.slice(-1)[0] ? `${(analysis.indicators.volume.slice(-1)[0] / 1e6).toFixed(1)}M` : '—', sub: analysis.indicators.volume?.slice(-1)[0] > (analysis.indicators.volumeAvg?.slice(-1)[0] ?? 0) * 1.5 ? 'Spike!' : 'Normal', color: 'text-n-text' },
              ].map(ind => (
                <div key={ind.name} className="rounded-xl border border-n-border bg-n-card p-3.5">
                  <p className="label mb-1">{ind.name}</p>
                  <p className={`font-mono text-xl font-medium ${ind.color}`}>{ind.value}</p>
                  {ind.sub && <p className="text-[10px] text-n-dim mt-0.5">{ind.sub}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: AI Analysis Panel */}
        <div className="xl:col-span-2 space-y-4">
          {/* Launch Analysis button (shows when no analysis yet) */}
          {!analysis && !chartLoading && (
            <button onClick={fetchData} className="w-full rounded-xl bg-n-text py-4 text-base font-medium text-n-bg min-h-[56px] flex items-center justify-center gap-2">
              <Brain size={20} /> Lancia Analisi AI
            </button>
          )}

          {analysis && (
            <>
              {/* Verdict */}
              <div className="rounded-xl border border-n-border bg-n-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="label">Verdetto AI</h3>
                  <button onClick={fetchData} disabled={chartLoading} className="rounded-lg p-1.5 text-n-dim hover:text-n-text"><RefreshCw size={14} className={chartLoading ? 'animate-spin' : ''} /></button>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold ${score > 60 ? 'bg-green-500/15 text-green-400' : score < 40 ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {score}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${dir === 'long' ? 'bg-green-500/10 text-green-400' : dir === 'short' ? 'bg-red-500/10 text-red-400' : 'bg-n-border text-n-dim'}`}>
                        {dir === 'long' ? '↑ LONG' : dir === 'short' ? '↓ SHORT' : '→ NEUTRAL'}
                      </span>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${REC_COLORS[rec] ?? ''}`}>{rec.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-n-dim">Confidence</span>
                      <div className="h-1.5 w-20 rounded-full bg-n-border overflow-hidden"><div className={`h-full rounded-full ${score > 60 ? 'bg-green-400' : score < 40 ? 'bg-red-400' : 'bg-yellow-400'}`} style={{ width: `${Math.min(score, 100)}%` }} /></div>
                      <span className="font-mono text-xs text-n-text">{score}%</span>
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="space-y-1.5">
                  {(analysis.reasoning ?? []).map((r: string, i: number) => (
                    <p key={i} className="text-[12px] text-n-text-s leading-relaxed">
                      <span className={r.includes('✗') || r.includes('negativ') || r.includes('ribassist') ? 'text-red-400' : r.includes('✓') || r.includes('positiv') || r.includes('rialzist') ? 'text-green-400' : 'text-yellow-400'}>
                        {r.includes('negativ') || r.includes('ribassist') || r.includes('overbought') ? '✗' : r.includes('Evento') || r.includes('neutro') ? '⚠' : '✓'}
                      </span> {r}
                    </p>
                  ))}
                </div>
              </div>

              {/* MTF */}
              {analysis.mtfAnalysis && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <h3 className="label mb-3">Multi-Timeframe</h3>
                  <div className="space-y-1.5">
                    {Object.entries(analysis.mtfAnalysis.timeframes).map(([tfKey, data]: [string, any]) => (
                      <div key={tfKey} className="flex items-center justify-between">
                        <span className="font-mono text-xs text-n-dim w-8">{tfKey}</span>
                        <span className={`text-xs font-medium ${data.trend === 'bullish' ? 'text-green-400' : data.trend === 'bearish' ? 'text-red-400' : 'text-n-dim'}`}>
                          {data.trend === 'bullish' ? '▲' : data.trend === 'bearish' ? '▼' : '►'} {data.trend}
                        </span>
                        <div className="h-1 w-16 rounded-full bg-n-border overflow-hidden"><div className={`h-full rounded-full ${data.strength > 60 ? 'bg-green-400' : data.strength < 40 ? 'bg-red-400' : 'bg-yellow-400'}`} style={{ width: `${data.strength}%` }} /></div>
                        <span className="font-mono text-[10px] text-n-dim">{data.strength}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-n-dim">Alignment: <span className="text-n-text font-medium">{analysis.mtfAnalysis.alignment}</span></p>
                </div>
              )}

              {/* Patterns */}
              {analysis.patterns?.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <h3 className="label mb-3">Pattern rilevati</h3>
                  <div className="space-y-1.5">
                    {analysis.patterns.slice(-5).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${p.signal === 'BUY' ? 'text-green-400' : p.signal === 'SELL' ? 'text-red-400' : 'text-n-dim'}`}>
                          {p.signal === 'BUY' ? '▲' : p.signal === 'SELL' ? '▼' : '►'} {p.type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-n-dim">{(p.strength * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* News */}
              {analysis.news?.latestHeadlines?.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <div className="flex items-center gap-2 mb-3"><Newspaper size={14} className="text-n-dim" /><h3 className="label">News ({analysis.news.score > 0 ? '+' : ''}{analysis.news.score})</h3></div>
                  <div className="space-y-1.5">
                    {analysis.news.latestHeadlines.slice(0, 4).map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${h.sentiment === 'positive' ? 'bg-green-400' : h.sentiment === 'negative' ? 'bg-red-400' : 'bg-gray-400'}`} />
                        <p className="text-[11px] text-n-text-s leading-snug">{h.title.slice(0, 80)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calendar */}
              {analysis.calendar?.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <div className="flex items-center gap-2 mb-3"><Calendar size={14} className="text-n-dim" /><h3 className="label">Prossimi eventi</h3></div>
                  <div className="space-y-1.5">
                    {analysis.calendar.slice(0, 3).map((e: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-n-text">{e.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${e.impact === 'critical' ? 'bg-red-500/15 text-red-400' : e.impact === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-n-border text-n-dim'}`}>{e.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Training suggestion */}
              {analysis.trainingResult && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <div className="flex items-center gap-2 mb-3"><Target size={14} className="text-n-dim" /><h3 className="label">Strategia consigliata</h3></div>
                  <p className="text-sm text-n-text">{analysis.trainingResult.strategy} — Grade {analysis.trainingResult.grade}</p>
                  <p className="text-xs text-n-dim mt-1">SL: {analysis.trainingResult.bestParams?.stopLoss}% · TP: {analysis.trainingResult.bestParams?.takeProfit}% · WR: {analysis.trainingResult.metrics?.winRate}%</p>
                  <Link href="/strategy" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-n-accent-dim px-4 py-2.5 text-xs font-medium text-accent min-h-[44px]">
                    Crea Bot con questa strategia
                  </Link>
                </div>
              )}

              {/* Knowledge insights */}
              {analysis.knowledgeInsights?.length > 0 && (
                <div className="rounded-xl border border-n-border bg-n-card p-5">
                  <h3 className="label mb-3">Storico reazioni (R&D)</h3>
                  <div className="space-y-1.5">
                    {analysis.knowledgeInsights.slice(0, 4).map((k: any, i: number) => (
                      <p key={i} className="text-[11px] text-n-text-s leading-relaxed">{k.finding.slice(0, 80)}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
