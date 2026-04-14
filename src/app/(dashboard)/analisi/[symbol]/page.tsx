'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  AssetAnalytic,
  JobStatus,
  AnalyticReport,
  LiveContext,
  NewsDigest,
  MacroEvent,
  BacktestStrategySummary,
} from '@/lib/analytics/types';
import type { PredictiveProfile, TierProfile, PredictiveCombination, RiskTier } from '@/lib/analytics/predictive-discovery';
import type { DistributionProfile, ConditionDistribution, TradeSetup } from '@/lib/analytics/v2/distribution-forecaster';
import { ArrowLeft, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle, Clock, Lightbulb, Bot, Rocket } from 'lucide-react';
import { LiveContextCard } from '@/components/analytics/LiveContextCard';
import { AICInsightsCard } from '@/components/analytics/AICInsightsCard';
import { AssetIntelCard } from '@/components/analytics/AssetIntelCard';
import { DataFreshnessBar } from '@/components/analytics/DataFreshnessBar';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import { filterZonesByDistance } from '@/lib/analytics/zone-filter';
import { useExplainMode } from '@/hooks/useExplainMode';
import { useLivePrice } from '@/hooks/useLivePrice';
import { ruleToItalian, regimeLabel } from '@/lib/analytics/labels';

export default function AssetDetailPage() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol);

  const [analytic, setAnalytic] = useState<AssetAnalytic | null>(null);
  const [report, setReport] = useState<AnalyticReport | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [live, setLive] = useState<LiveContext | null>(null);
  const [news, setNews] = useState<NewsDigest | null>(null);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [aicData, setAicData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [explainMode, toggleExplain] = useExplainMode();
  const [creatingBot, setCreatingBot] = useState(false);
  const [botCreated, setBotCreated] = useState<string | null>(null);

  // Phase 6: Real-time price from CoinGecko/Alpaca (updates every 10s)
  const { price: realTimePrice } = useLivePrice(symbol);

  const load = useCallback(async () => {
    const r = await fetch(`/api/analytics/${encodeURIComponent(symbol)}`);
    if (r.ok) {
      const d = await r.json();
      setAnalytic(d.analytic);
      setReport(d.report ?? null);
    } else {
      setAnalytic(null);
      setReport(null);
    }
    setLoading(false);
  }, [symbol]);

  const loadLive = useCallback(async () => {
    const r = await fetch(`/api/analytics/${encodeURIComponent(symbol)}/live`);
    if (r.ok) {
      const d = await r.json();
      setLive(d.live ?? null);
      setNews(d.news ?? null);
      setEvents(Array.isArray(d.events) ? d.events : []);
    }
  }, [symbol]);

  const loadJob = useCallback(async () => {
    const r = await fetch(`/api/analytics/${encodeURIComponent(symbol)}/job`);
    if (r.ok) {
      const d = await r.json();
      setJob(d.job ?? null);
    }
  }, [symbol]);

  const loadAIC = useCallback(async () => {
    try {
      const [sRes, rRes, cRes] = await Promise.allSettled([
        fetch(`/api/aic/status?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/aic/research?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/aic/confluence?symbol=${encodeURIComponent(symbol)}`),
      ]);
      const sData = sRes.status === 'fulfilled' && sRes.value.ok ? await sRes.value.json() : null;
      const rData = rRes.status === 'fulfilled' && rRes.value.ok ? await rRes.value.json() : null;
      const cData = cRes.status === 'fulfilled' && cRes.value.ok ? await cRes.value.json() : null;
      // Unwrap API wrappers: { status: {...} } → {...}, { research: {...} } → {...}
      const status = sData?.status ?? sData;
      const research = rData?.research ?? rData;
      const confluence = cData?.confluence ?? status?.confluence;
      setAicData({ status, research, confluence });
    } catch { /* AIC may be offline */ }
  }, [symbol]);

  useEffect(() => {
    load();
    loadLive();
    loadAIC();
  }, [load, loadLive, loadAIC]);

  // Polling job status while training
  useEffect(() => {
    if (!analytic) return;
    if (analytic.status !== 'training' && analytic.status !== 'queued' && analytic.status !== 'refreshing') return;
    loadJob();
    const id = setInterval(() => {
      loadJob();
      load();
    }, 3000);
    return () => clearInterval(id);
  }, [analytic, loadJob, load]);

  // Auto-refresh live context + AIC every 30s when ready
  useEffect(() => {
    if (!analytic || analytic.status !== 'ready') return;
    const id = setInterval(() => {
      loadLive();
      loadAIC();
      load();
    }, 30000);
    return () => clearInterval(id);
  }, [analytic, loadLive, loadAIC, load]);

  async function refresh() {
    setBusy(true);
    try {
      await fetch(`/api/analytics/${encodeURIComponent(symbol)}/refresh`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Rimuovere l'AI Analytic di ${symbol}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/analytics/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      router.push('/analisi');
    } finally {
      setBusy(false);
    }
  }

  async function createBotFromAnalysis() {
    if (!report) return;
    setCreatingBot(true);
    setBotCreated(null);
    try {
      // Phase 4.6: Use backtest summary if available (best ranked strategy)
      const rankings = report.backtestSummary?.rankings ?? [];
      const bestBacktest = rankings[0]; // top ranked from full backtest

      let botConfig: Record<string, any>;

      if (bestBacktest && bestBacktest.totalTrades >= 10) {
        // Use AI-calibrated config from full backtester
        const tfModeMap: Record<string, string> = { '5m': 'scalp', '15m': 'scalp', '1h': 'intraday', '4h': 'daily' };
        const operationMode = tfModeMap[bestBacktest.timeframe] ?? 'intraday';

        botConfig = {
          name: `AI ${symbol} ${bestBacktest.strategyName.slice(0, 20)}`,
          environment: 'real',
          capitalPercent: 15,
          assets: [symbol],
          strategies: bestBacktest.isMineRule ? ['combined_ai'] : [bestBacktest.strategyId],
          riskLevel: 5,
          stopLossPercent: bestBacktest.avgSlDistancePct,
          takeProfitPercent: bestBacktest.avgTpDistancePct,
          useTrailingStop: true,
          maxOpenPositions: 2,
          maxDDDaily: 3,
          maxDDWeekly: 8,
          maxDDTotal: 15,
          operationMode,
          // AI-calibrated fields
          backtestStrategyId: bestBacktest.strategyId,
          backtestTimeframe: bestBacktest.timeframe,
          calibratedTpPct: bestBacktest.avgTpDistancePct,
          calibratedSlPct: bestBacktest.avgSlDistancePct,
          entryTimeoutBars: bestBacktest.optimalEntryTimeout,
          usesMineRules: bestBacktest.isMineRule,
          mineRuleConditions: bestBacktest.conditions,
        };
      } else {
        // Fallback to legacy strategy fit
        const fits = (report.strategyFit ?? [])
          .filter(f => f.totalTrades >= 10 && f.profitFactor > 1)
          .sort((a, b) => {
            const wA = Math.min(1, a.totalTrades / 30) * a.profitFactor;
            const wB = Math.min(1, b.totalTrades / 30) * b.profitFactor;
            return wB - wA;
          });
        const bestStrategies = fits.length > 0
          ? [...new Set(fits.slice(0, 2).map(f => f.strategyName))]
          : ['combined_ai'];
        const modeMap: Record<string, string> = { scalp: 'scalp', intraday: 'intraday', daily: 'daily', swing: 'daily' };
        const operationMode = modeMap[report.recommendedOperationMode] ?? 'intraday';
        const vol1d = report.globalStats?.volatility?.['1d'] ?? 0;
        const riskLevel = vol1d > 0.04 ? 3 : vol1d > 0.02 ? 5 : vol1d > 0.01 ? 6 : 7;

        botConfig = {
          name: `AI ${symbol} ${bestStrategies[0]}`,
          environment: 'real',
          capitalPercent: 15,
          assets: [symbol],
          strategies: bestStrategies,
          riskLevel,
          stopLossPercent: 2,
          takeProfitPercent: 4,
          useTrailingStop: true,
          maxOpenPositions: 2,
          maxDDDaily: 3,
          maxDDWeekly: 8,
          maxDDTotal: 15,
          operationMode,
        };
      }

      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botConfig),
      });
      if (res.ok) {
        const d = await res.json();
        setBotCreated(d.botId ?? 'ok');
      }
    } catch {}
    setCreatingBot(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-n-dim" />
      </div>
    );
  }

  if (!analytic) {
    return (
      <div className="space-y-4">
        <Link href="/analisi" className="inline-flex items-center gap-2 text-xs text-n-dim hover:text-n-text">
          <ArrowLeft size={14} /> Assets
        </Link>
        <div className="rounded-xl border border-dashed border-n-border bg-n-card/50 p-8 text-center text-sm text-n-dim">
          Nessuna AI Analytic per <span className="font-mono">{symbol}</span>.
        </div>
      </div>
    );
  }

  const isTraining = analytic.status === 'training' || analytic.status === 'queued' || analytic.status === 'refreshing';
  const isReady = analytic.status === 'ready';
  const lastTrained = analytic.lastTrainedAt ? new Date(analytic.lastTrainedAt).toLocaleString() : '—';
  const lastTrainedAgo = analytic.lastTrainedAt ? formatAgo(Date.now() - analytic.lastTrainedAt) : '—';
  const nextRefreshIn = analytic.nextScheduledRefresh
    ? formatAgo(analytic.nextScheduledRefresh - Date.now())
    : '—';

  return (
    <div className="space-y-5">
      <Link href="/analisi" className="inline-flex items-center gap-2 text-xs text-n-dim hover:text-n-text">
        <ArrowLeft size={14} /> Assets
      </Link>

      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-n-text">{symbol}</h1>
            <p className="text-xs text-n-dim">
              Stato: <span className="font-semibold text-n-text">{analytic.status}</span> · Ultimo refresh: {lastTrained}
            </p>
            {isReady && (
              <p className="mt-1 text-[10px] text-n-dim">
                <span className="rounded bg-n-bg-s px-2 py-0.5">Last train: {lastTrainedAgo} fa</span>
                {analytic.nextScheduledRefresh && (
                  <span className="ml-1.5 rounded bg-n-bg-s px-2 py-0.5">Next: in {nextRefreshIn}</span>
                )}
                {analytic.currentRegime && (
                  <span className="ml-1.5 rounded bg-blue-500/10 px-2 py-0.5 text-blue-300">
                    Regime: {analytic.currentRegime}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isReady && report && (
              botCreated ? (
                <a
                  href="/bot"
                  className="flex items-center gap-2 rounded-lg bg-green-500/15 px-3 py-2 text-[11px] font-semibold text-green-400 hover:bg-green-500/25"
                >
                  <Bot size={12} /> Bot creato — Vai al Manager
                </a>
              ) : (
                <button
                  onClick={createBotFromAnalysis}
                  disabled={creatingBot}
                  className="flex items-center gap-2 rounded-lg bg-accent/15 px-3 py-2 text-[11px] font-semibold text-accent hover:bg-accent/25 disabled:opacity-50"
                  title="Crea un bot pre-configurato con le migliori strategie trovate dall'AI"
                >
                  {creatingBot ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />} Crea Bot da Analisi
                </button>
              )
            )}
            <button
              onClick={toggleExplain}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all ${
                explainMode
                  ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                  : 'bg-n-bg-s text-n-dim hover:bg-n-border hover:text-n-text'
              }`}
              title="Mostra spiegazioni dettagliate per ogni metrica"
            >
              <Lightbulb size={12} /> Spiega {explainMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={refresh}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-n-bg-s px-3 py-2 text-[11px] font-semibold text-n-text hover:bg-n-border disabled:opacity-50"
            >
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Aggiorna ora
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
            >
              <Trash2 size={12} /> Rimuovi
            </button>
          </div>
        </div>
      </div>

      {isTraining && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
            <Loader2 size={16} className="animate-spin" />
            {analytic.status === 'queued' ? 'In coda di training' : analytic.status === 'refreshing' ? 'Refresh in corso' : 'Training in corso'}
          </div>
          {job && (
            <>
              <div className="text-xs text-n-dim">{job.message}</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-n-bg-s">
                <div
                  className="h-full bg-blue-400 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-n-dim">
                <span>Fase: {job.phase}</span>
                <span>ETA ~{Math.round(job.etaSeconds / 60)} min</span>
              </div>
            </>
          )}
        </div>
      )}

      {isReady && (
        <>
          {/* Data freshness indicator */}
          <DataFreshnessBar
            priceUpdatedAt={null}
            contextUpdatedAt={live?.updatedAt ?? null}
            aicOnline={!!aicData?.status}
            lastTrainedAt={analytic?.lastTrainedAt ?? null}
            nextRefreshAt={analytic?.nextScheduledRefresh ?? null}
          />
          <LiveContextCard context={live} symbol={symbol} onRefresh={loadLive} />
          <AICInsightsCard data={aicData} symbol={symbol} />
          <AssetIntelCard symbol={symbol} />
        </>
      )}

      {isReady && report && (
        <ReportView
          report={report}
          currentPrice={realTimePrice ?? live?.price ?? null}
          symbol={symbol}
          explainMode={explainMode}
        />
      )}
      {isReady && !report && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={16} /> AI Analytic pronta
          </div>
          <p className="mt-2 text-xs text-n-dim">Report non disponibile.</p>
        </div>
      )}

      {analytic.status === 'failed' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
            <AlertTriangle size={16} /> Ultimo training fallito
          </div>
          <p className="mt-2 text-xs text-n-dim">Riprova con &quot;Aggiorna ora&quot;.</p>
        </div>
      )}

      {analytic.status === 'unassigned' && (
        <div className="rounded-2xl border border-n-border bg-n-card p-5 text-xs text-n-dim">
          <Clock size={14} className="mr-2 inline" />
          Nessun training avviato. Usa &quot;Aggiorna ora&quot; per accodarne uno.
        </div>
      )}
    </div>
  );
}

// ─── Report rendering ───────────────────────────────────────────────

function formatAgo(deltaMs: number): string {
  if (Number.isNaN(deltaMs)) return '—';
  const abs = Math.abs(deltaMs);
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return 'pochi sec';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}g`;
}

function fmtPct(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function ReportView({
  report,
  currentPrice,
  symbol,
  explainMode,
}: {
  report: AnalyticReport;
  currentPrice: number | null;
  symbol: string;
  explainMode: boolean;
}) {
  const tfCounts = report.datasetCoverage?.candleCounts ?? {};
  // Show human-readable time spans
  const tfToMonths: Record<string, (n: number) => string> = {
    '5m': (n) => `${Math.round(n * 5 / 60 / 24 / 30)}m`,
    '15m': (n) => `${Math.round(n * 15 / 60 / 24 / 30)}m`,
    '1h': (n) => `${Math.round(n / 24 / 30)}m`,
    '4h': (n) => `${Math.round(n * 4 / 24 / 30)}m`,
    '1d': (n) => `${Math.round(n / 30)}m`,
  };
  const datasetSummary = ['5m', '15m', '1h', '4h', '1d']
    .filter((tf) => (tfCounts[tf] ?? 0) > 0)
    .map((tf) => `${tf}: ${tfCounts[tf]} candele (~${tfToMonths[tf]?.(tfCounts[tf]) ?? '?'} di storico)`)
    .join(' · ');
  const generated = new Date(report.generatedAt).toLocaleString();

  const safeTopRules = Array.isArray(report.topRules) ? report.topRules : [];
  const buyRules = safeTopRules
    .filter((r) => r?.direction === 'long')
    .sort((a, b) => (b?.confidenceScore ?? 0) - (a?.confidenceScore ?? 0))
    .slice(0, 10);
  const sellRules = safeTopRules
    .filter((r) => r?.direction === 'short')
    .sort((a, b) => (b?.confidenceScore ?? 0) - (a?.confidenceScore ?? 0))
    .slice(0, 10);
  // Phase 3.6: filtra le reaction zones a ±15% dal prezzo corrente, ordinate per vicinanza.
  // Se currentPrice non è disponibile, fallback su tutte le zone (decorate distancePct=0).
  const allZones = Array.isArray(report.reactionZones) ? report.reactionZones : [];
  const filteredZones = filterZonesByDistance(allZones, currentPrice, 0.15).slice(0, 15);
  const zonesHasFilter = currentPrice != null && currentPrice > 0;
  // Phase 3.6: strategy fit N-gate.
  // - Le righe con trades<10 sono mostrate ma marcate "low sample" e
  //   *escluse dal ranking*. Le righe con trades>=10 sono ordinate per
  //   PF × min(1, N/30) (penalizza sample size piccolo).
  const allFits = (Array.isArray(report.strategyFit) ? report.strategyFit : []).map((f) => {
    const trades = f?.totalTrades ?? 0;
    const pf = f?.profitFactor ?? 0;
    const weight = Math.min(1, trades / 30);
    return { ...f, _weightedScore: pf * weight, _lowSample: trades < 10 };
  });
  const reliableFits = allFits
    .filter((f) => !f._lowSample)
    .sort((a, b) => (b._weightedScore ?? 0) - (a._weightedScore ?? 0));
  const lowSampleFits = allFits.filter((f) => f._lowSample);
  // Riassegna rank in base al ranking pesato
  reliableFits.forEach((f, i) => ((f as any).rank = i + 1));
  const fits = [...reliableFits, ...lowSampleFits].slice(0, 12);
  const indicators = report.indicatorReactivity && typeof report.indicatorReactivity === 'object'
    ? Object.values(report.indicatorReactivity)
    : [];
  // Phase 3 optional sections (caso report Phase 2 legacy senza questi campi)
  const eventImpacts = Array.isArray(report.eventImpacts) ? report.eventImpacts : [];
  const trainingHistory = Array.isArray(report.trainingHistory) ? report.trainingHistory : [];
  void eventImpacts;
  void trainingHistory;

  // Calculate total candles analyzed and date range
  const totalCandles = Object.values(tfCounts).reduce((sum: number, n: any) => sum + (Number(n) || 0), 0);
  const rangeStart = report.datasetCoverage?.rangeStart ? new Date(report.datasetCoverage.rangeStart) : null;
  const rangeEnd = report.datasetCoverage?.rangeEnd ? new Date(report.datasetCoverage.rangeEnd) : null;
  const yearsAnalyzed = rangeStart && rangeEnd ? ((rangeEnd.getTime() - rangeStart.getTime()) / (365 * 24 * 60 * 60 * 1000)).toFixed(1) : '?';

  // Find best strategy from backtest summary
  const bestStrategy = report.backtestSummary?.rankings?.[0];

  return (
    <div className="space-y-5">
      {/* ═══ HERO: Stato AI ═══ */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={16} /> AI pronta su {symbol}
          </div>
          <span className="text-[10px] text-n-dim" suppressHydrationWarning>Aggiornata {generated}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-n-bg/60 p-3 text-center">
            <p className="text-[10px] text-n-dim">Storico analizzato</p>
            <p className="text-lg font-bold text-n-text">{yearsAnalyzed} anni</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-3 text-center">
            <p className="text-[10px] text-n-dim">Opportunit&agrave; trovate</p>
            <p className="text-lg font-bold text-emerald-400">{report.distributionProfile?.conditionDistributions?.length ?? report.backtestSummary?.rankings?.length ?? 0}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-3 text-center">
            <p className="text-[10px] text-n-dim">Stile consigliato</p>
            <p className="text-lg font-bold text-n-text">{report.recommendedOperationMode === 'scalp' ? 'Scalping' : report.recommendedOperationMode === 'intraday' ? 'Intraday' : report.recommendedOperationMode === 'daily' ? 'Swing' : 'Position'}</p>
          </div>
        </div>
      </div>

      {/* ═══ V2.0: Opportunita di Trading Scoperte dall'AI ═══ */}
      {report.distributionProfile && report.distributionProfile.conditionDistributions.length > 0 && (
        <V2DistributionView profile={report.distributionProfile} symbol={symbol} />
      )}

      {/* Fallback: vecchio simulatore se V2 non disponibile */}
      {!report.distributionProfile && report.backtestSummary && report.backtestSummary.rankings.length > 0 && (
        <TradingSimulator rankings={report.backtestSummary.rankings} symbol={symbol} />
      )}

      {/* Come operare */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">Raccomandazioni AI per {symbol}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Stile consigliato" value={report.recommendedOperationMode === 'scalp' ? 'Scalping (veloce)' : report.recommendedOperationMode === 'intraday' ? 'Intraday' : report.recommendedOperationMode === 'daily' ? 'Swing (multi-day)' : 'Position'} />
          <Stat label="Timeframe migliore" value={report.recommendedTimeframe} />
          <Stat label="Quando comprare" value={regimeLabel(report.globalStats?.bestRegimeForLong)} />
          <Stat label="Quando vendere" value={regimeLabel(report.globalStats?.bestRegimeForShort)} />
        </div>
      </div>

      {/* Segnali storici rimossi — ridondanti con V2 Distribution View */}

      {/* Reaction zones — Phase 3.6: filtrate ±15% dal prezzo corrente */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-n-text">
            {zonesHasFilter ? 'Zone vicine al prezzo corrente (±15%)' : 'Reaction zones'}
          </h2>
          {zonesHasFilter && (
            <span className="text-[10px] text-n-dim">
              Prezzo: <span className="font-mono text-n-text">{fmtNum(currentPrice, 2)}</span>
              {' · '}
              {filteredZones.length}/{allZones.length} zone
            </span>
          )}
        </div>
        {filteredZones.length === 0 ? (
          <p className="text-xs text-n-dim">
            {zonesHasFilter
              ? 'Nessuna zona di reazione storica vicina al prezzo corrente — territorio vergine (possibile breakout).'
              : 'Nessuna zona identificata.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Livello</th>
                  <th className="px-2 py-1.5">Δ%</th>
                  <th className="px-2 py-1.5">Tipo</th>
                  <th className="px-2 py-1.5">Strength</th>
                  <th className="px-2 py-1.5">Touches</th>
                  <th className="px-2 py-1.5">P(bounce)</th>
                  <th className="px-2 py-1.5">Avg bounce</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {filteredZones.map((z, i) => {
                  const distancePct = (z as any).distancePct ?? 0;
                  const distanceLabel =
                    distancePct === 0
                      ? '—'
                      : `a ${distancePct > 0 ? '+' : ''}${(distancePct * 100).toFixed(2)}% dal prezzo attuale`;
                  const bouncePct = (z?.bounceProbability ?? 0) * 100;
                  const isStrongSupport = z?.type === 'support' && bouncePct >= 70;
                  const isStrongResistance = z?.type === 'resistance' && bouncePct >= 70;
                  const friendlyLabel = isStrongSupport
                    ? '🟢 I trader storicamente comprano qui'
                    : isStrongResistance
                    ? '🔴 I trader storicamente vendono qui'
                    : '⚪ Zona di reazione meno marcata';
                  return (
                    <tr key={i} className="border-t border-n-border align-top">
                      <td className="px-2 py-1.5 font-mono">
                        {fmtNum(z?.priceLevel, 2)}
                        <div className="mt-1 max-w-[180px] whitespace-normal text-[10px] font-sans text-n-dim">
                          {friendlyLabel}
                        </div>
                      </td>
                      <td
                        className={`px-2 py-1.5 font-mono ${
                          distancePct > 0 ? 'text-emerald-300' : distancePct < 0 ? 'text-red-300' : 'text-n-dim'
                        }`}
                      >
                        {distanceLabel}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            z?.type === 'support' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {z?.type === 'support' ? 'supporto' : z?.type === 'resistance' ? 'resistenza' : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{z?.strength ?? '—'}</td>
                      <td className="px-2 py-1.5">{z?.touchCount ?? '—'}</td>
                      <td className="px-2 py-1.5">{fmtPct(bouncePct)}</td>
                      <td className="px-2 py-1.5">{fmtPct(z?.avgBounceMagnitude)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sezione "Strategie testate (base)" rimossa — ridondante con Classifica Strategie */}

      {/* Phase 4.6: Full Backtest Results */}
      {report.backtestSummary && report.backtestSummary.rankings.length > 0 && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-blue-300">Strategie Disponibili</h2>
          <p className="mb-4 text-[10px] text-n-dim">
            L&apos;AI ha testato {report.backtestSummary.totalStrategiesTested} strategie sullo storico reale.
            La previsione di profitto &egrave; basata sulla performance storica annualizzata.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {report.backtestSummary.rankings.slice(0, 8).map((r) => {
              // Calculate annualized return projection
              const dateRange = report.backtestSummary?.dateRange;
              let periodYears = 4; // default
              if (dateRange?.start && dateRange?.end) {
                const ms = new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime();
                periodYears = Math.max(0.5, ms / (365.25 * 86400000));
              }
              const annualizedPct = periodYears > 0 ? (r.netProfitPct / periodYears) : r.netProfitPct;
              const monthly = annualizedPct / 12;
              const isProfit = r.netProfitPct > 0;
              const tradesPerMonth = r.totalTrades / (periodYears * 12);

              // Strategy name in Italian
              const friendlyName = r.isMineRule
                ? 'Regola AI'
                : r.strategyId.startsWith('ga_')
                ? 'Strategia Evoluta (GA)'
                : r.strategyName === 'Combined AI' ? 'AI Combinata'
                : r.strategyName === 'Breakout' ? 'Rottura livelli'
                : r.strategyName === 'Mean Reversion' ? 'Inversione media'
                : r.strategyName === 'Trend Following' ? 'Segui il trend'
                : r.strategyName;

              const botParams = new URLSearchParams({
                symbol,
                strategy: r.strategyId,
                strategyName: r.strategyName,
                tf: r.timeframe,
                tp: String(r.avgTpDistancePct || ''),
                sl: String(r.avgSlDistancePct || ''),
                timeout: String(r.optimalEntryTimeout || ''),
                isMine: r.isMineRule ? '1' : '',
                conditions: r.conditions?.join(',') ?? '',
                wr: String(r.winRate),
                pf: String(r.profitFactor),
              });

              return (
              <div key={`${r.strategyId}-${r.timeframe}`} className={`rounded-xl border p-4 ${isProfit ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-n-border bg-n-bg/40'}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-n-text">{friendlyName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-n-dim">TF {r.timeframe}</span>
                      {r.isMineRule && <span className="rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold text-purple-400">AI</span>}
                      {r.strategyId.startsWith('ga_') && <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[8px] font-bold text-emerald-400">GA</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-n-dim">#{r.rank}</span>
                </div>

                {/* Profit projection — the key feature */}
                <div className={`rounded-lg p-3 mb-3 ${isProfit ? 'bg-emerald-500/10' : 'bg-n-bg/60'}`}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[9px] text-n-dim">Previsione annuale</p>
                    <p className={`font-mono text-lg font-bold ${annualizedPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {annualizedPct >= 0 ? '+' : ''}{annualizedPct.toFixed(1)}%
                    </p>
                  </div>
                  <p className="text-[9px] text-n-dim mt-0.5">
                    ~{monthly >= 0 ? '+' : ''}{monthly.toFixed(1)}% al mese · ~{tradesPerMonth.toFixed(0)} operazioni/mese
                  </p>
                </div>

                {/* Key stats */}
                <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
                  <div>
                    <p className="text-n-dim">Vincite</p>
                    <p className="font-bold text-n-text">{r.winRate}%</p>
                  </div>
                  <div>
                    <p className="text-n-dim">Profitto storico</p>
                    <p className={`font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.netProfitPct >= 0 ? '+' : ''}{r.netProfitPct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-n-dim">Rischio max</p>
                    <p className="font-bold text-red-300">{r.maxDrawdownPct}%</p>
                  </div>
                </div>

                {/* Conditions if AI rule */}
                {r.isMineRule && r.conditions && r.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {r.conditions.map((c, ci) => (
                      <span key={ci} className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] text-purple-300">
                        {conditionLabelsMap[c] ?? c}
                      </span>
                    ))}
                  </div>
                )}

                {/* Action */}
                <a
                  href={`/bot?${botParams.toString()}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-2 text-[11px] font-bold text-blue-400 hover:bg-blue-500/25 transition-all w-full"
                >
                  <Rocket size={12} /> Attiva questa strategia
                </a>
              </div>
              );
            })}
          </div>
          <p className="mt-3 text-[9px] text-n-dim italic">
            Le previsioni sono basate sullo storico ({report.backtestSummary.dateRange?.start?.slice(0,4)} - {report.backtestSummary.dateRange?.end?.slice(0,4)}). Performance passate non garantiscono risultati futuri.
          </p>
        </div>
      )}

      {/* Efficacia indicatori rimossa — obsoleta con V2 Distribution */}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-xl bg-n-bg-s p-3">
      <div className="text-[10px] uppercase tracking-wide text-n-dim">{label}</div>
      <div className="mt-1 text-sm font-semibold text-n-text">{value ?? '—'}</div>
    </div>
  );
}

// ─── V2.0 Distribution View ─────────────────────────────────
// Shows asymmetric trading opportunities discovered by analyzing
// the DISTRIBUTION of future returns per regime + conditions.

function V2DistributionView({ profile, symbol }: { profile: DistributionProfile; symbol: string }) {
  const setups = profile.conditionDistributions;
  if (setups.length === 0) return null;

  // Group by regime
  const byRegime: Record<string, ConditionDistribution[]> = {};
  for (const s of setups) {
    if (!byRegime[s.regime]) byRegime[s.regime] = [];
    byRegime[s.regime].push(s);
  }

  const regimeLabelsV2: Record<string, { name: string; color: string; bg: string }> = {
    TRENDING:     { name: 'Trend',        color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/30' },
    RANGING:      { name: 'Laterale',     color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/30' },
    VOLATILE:     { name: 'Volatile',     color: 'text-red-300',    bg: 'bg-red-500/10 border-red-500/30' },
    ACCUMULATING: { name: 'Accumulo',     color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/30' },
  };

  // Best overall
  const best = setups[0];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-blue-500/5 p-6">
        <h2 className="text-base font-bold text-emerald-300 mb-1">
          Opportunit&agrave; di Trading — Analisi V2.0
        </h2>
        <p className="text-xs text-n-dim mb-4">
          L&apos;AI ha analizzato <span className="font-mono text-n-text">{profile.totalCandles.toLocaleString()}</span> candele
          e scoperto <span className="font-mono text-emerald-300">{setups.length}</span> setup con distribuzione asimmetrica:
          il guadagno potenziale supera la perdita potenziale di almeno 1.3x.
          Ogni setup mostra i quantili della distribuzione reale dei rendimenti.
        </p>

        {/* Best setup hero */}
        <div className="rounded-xl bg-n-bg/60 border border-emerald-500/20 p-4 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] text-n-dim uppercase tracking-wider mb-1">Miglior setup scoperto</p>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {best.conditions.map((c, i) => (
                  <span key={i} className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {conditionLabelsMap[c] ?? c}
                  </span>
                ))}
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${best.direction === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {best.direction.toUpperCase()}
                </span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${regimeLabelsV2[best.regime]?.bg ?? ''}`}>
                  {regimeLabelsV2[best.regime]?.name ?? best.regime}
                </span>
              </div>
              <p className="text-[10px] text-n-dim">
                {best.setup.sampleSize} occorrenze storiche · Orizzonte {best.setup.horizon}
              </p>
            </div>
            <div className="text-right">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[9px] text-n-dim">R:R</p>
                  <p className="font-mono text-lg font-bold text-emerald-400">{best.setup.riskReward.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-n-dim">TP</p>
                  <p className="font-mono text-lg font-bold text-emerald-300">+{best.setup.tpPct.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[9px] text-n-dim">SL</p>
                  <p className="font-mono text-lg font-bold text-red-300">-{best.setup.slPct.toFixed(1)}%</p>
                </div>
              </div>
              <p className="text-[10px] text-emerald-300 mt-1">Rendimento atteso: {best.setup.expectedValuePct > 0 ? '+' : ''}{best.setup.expectedValuePct.toFixed(2)}% per operazione</p>
            </div>
          </div>
        </div>

        {/* Distribution bar visualization for best */}
        <DistributionBar dist={best.forecast.h4.p10 !== 0 ? best.forecast.h4 : best.forecast.h1} horizon={best.setup.horizon} />
      </div>

      {/* Setups grouped by regime */}
      {Object.entries(byRegime).map(([regime, regimeSetups]) => {
        const meta = regimeLabelsV2[regime] ?? { name: regime, color: 'text-n-text', bg: 'bg-n-card border-n-border' };
        return (
          <div key={regime} className={`rounded-2xl border ${meta.bg} p-5`}>
            <h3 className={`text-sm font-bold ${meta.color} mb-1`}>
              Regime: {meta.name} — {regimeSetups.length} setup
            </h3>
            <p className="text-[10px] text-n-dim mb-3">
              Setup che funzionano quando il mercato &egrave; in fase {meta.name.toLowerCase()}.
            </p>

            <div className="space-y-2">
              {regimeSetups.map((s, i) => (
                <SetupCard key={`${s.conditions.join('-')}-${s.direction}-${i}`} setup={s} rank={i + 1} />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-n-dim italic">
        ⓘ Ogni setup mostra la distribuzione reale dei rendimenti (quantili p10→p90).
        TP e SL sono derivati dalla distribuzione, non da multipli ATR fissi.
        R:R = Risk/Reward (quanto guadagni per ogni $ rischiato). EV = valore atteso per trade.
      </p>
    </div>
  );
}

function SetupCard({ setup: s, rank }: { setup: ConditionDistribution; rank: number }) {
  return (
    <div className="rounded-xl bg-n-bg/40 border border-n-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold text-n-dim">#{rank}</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${s.direction === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {s.direction.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {s.conditions.map((c, i) => (
              <span key={i} className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
                {conditionLabelsMap[c] ?? c}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-[9px] shrink-0">
          <div>
            <p className="text-n-dim">R:R</p>
            <p className={`font-mono font-bold ${s.setup.riskReward >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {s.setup.riskReward.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-n-dim">TP</p>
            <p className="font-mono font-bold text-emerald-300">+{s.setup.tpPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-n-dim">SL</p>
            <p className="font-mono font-bold text-red-300">-{s.setup.slPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-n-dim">N</p>
            <p className="font-mono font-bold text-n-text">{s.setup.sampleSize}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionBar({ dist, horizon }: { dist: { p10: number; p30: number; p50: number; p70: number; p90: number; sampleSize: number }; horizon: string }) {
  // Normalize values to a visual range
  const maxAbs = Math.max(Math.abs(dist.p10), Math.abs(dist.p90), 1);
  const scale = (v: number) => ((v / maxAbs) * 50) + 50; // 0-100 scale, 50 = center

  return (
    <div className="rounded-lg bg-n-bg/60 p-3">
      <p className="text-[9px] text-n-dim mb-2">Distribuzione rendimenti {horizon} ({dist.sampleSize} campioni)</p>
      <div className="relative h-8 rounded bg-n-bg-s overflow-hidden">
        {/* Center line (0%) */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-n-dim/30" />
        {/* p10-p90 range */}
        <div
          className="absolute top-1 bottom-1 bg-blue-500/20 rounded"
          style={{ left: `${scale(dist.p10)}%`, width: `${scale(dist.p90) - scale(dist.p10)}%` }}
        />
        {/* p30-p70 range (darker) */}
        <div
          className="absolute top-0.5 bottom-0.5 bg-blue-500/40 rounded"
          style={{ left: `${scale(dist.p30)}%`, width: `${scale(dist.p70) - scale(dist.p30)}%` }}
        />
        {/* Median line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
          style={{ left: `${scale(dist.p50)}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-n-dim mt-1 font-mono">
        <span className="text-red-300">{(dist.p10 * 100).toFixed(2)}%</span>
        <span>{(dist.p30 * 100).toFixed(2)}%</span>
        <span className="text-amber-300">{(dist.p50 * 100).toFixed(2)}%</span>
        <span>{(dist.p70 * 100).toFixed(2)}%</span>
        <span className="text-emerald-300">{(dist.p90 * 100).toFixed(2)}%</span>
      </div>
      <div className="flex justify-between text-[7px] text-n-dim mt-0.5">
        <span>p10</span>
        <span>p30</span>
        <span>mediana</span>
        <span>p70</span>
        <span>p90</span>
      </div>
    </div>
  );
}

// ─── Predictive Profile Section (Phase 6 legacy) ────────────
// Shows 3 risk-tiered strategy profiles discovered by analyzing
// 4 years of historical data.

/** Human-readable names for condition codes (shared). */
const conditionLabelsMap: Record<string, string> = {
  'RSI<30': 'RSI ipervenduto',
  'RSI<40': 'RSI basso',
  'RSI>60': 'RSI alto',
  'RSI>70': 'RSI ipercomprato',
  'BB=BELOW_LOWER': 'Sotto Bollinger inf.',
  'BB=AT_LOWER': 'Alla banda inf.',
  'BB=AT_UPPER': 'Alla banda sup.',
  'BB=ABOVE_UPPER': 'Sopra Bollinger sup.',
  'MACD=CROSS_UP': 'MACD cross rialzista',
  'MACD=CROSS_DOWN': 'MACD cross ribassista',
  'MACD=ABOVE': 'MACD positivo',
  'MACD=BELOW': 'MACD negativo',
  'TREND_S=UP': 'Trend breve UP',
  'TREND_S=DOWN': 'Trend breve DOWN',
  'TREND_M=UP': 'Trend medio UP',
  'TREND_M=DOWN': 'Trend medio DOWN',
  'TREND_L=UP': 'Trend lungo UP',
  'TREND_L=DOWN': 'Trend lungo DOWN',
  'ADX>25': 'Trend forte',
  'ADX<15': 'Mercato piatto',
  'VOL=CLIMAX': 'Volume estremo',
  'VOL=HIGH': 'Volume alto',
  'VOL=DRY': 'Volume basso',
  'STOCH<20': 'Stoch ipervenduto',
  'STOCH>80': 'Stoch ipercomprato',
  'REGIME=TREND_UP': 'Regime rialzista',
  'REGIME=TREND_DN': 'Regime ribassista',
  'REGIME=RANGING': 'Regime laterale',
};

const tierColors: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  prudent:    { border: 'border-blue-500/40',    bg: 'bg-blue-500/5',    text: 'text-blue-300',    badge: 'bg-blue-500/20 text-blue-300' },
  moderate:   { border: 'border-amber-500/40',   bg: 'bg-amber-500/5',   text: 'text-amber-300',   badge: 'bg-amber-500/20 text-amber-300' },
  aggressive: { border: 'border-red-500/40',     bg: 'bg-red-500/5',     text: 'text-red-300',     badge: 'bg-red-500/20 text-red-300' },
};

function PredictiveProfileSection({ profile, symbol }: { profile: PredictiveProfile; symbol: string }) {
  const tiers = ['prudent', 'moderate', 'aggressive'] as RiskTier[];
  const anyData = tiers.some(t => profile.tiers[t].combinations.length > 0);

  if (!anyData) return null;

  // Find the overall best
  const allCombos = tiers.flatMap(t => profile.tiers[t].combinations);
  const overallBest = allCombos.length > 0
    ? allCombos.reduce((a, b) => b.simFinalCapital > a.simFinalCapital ? b : a, allCombos[0])
    : null;

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-blue-500/5 p-6">
        <h2 className="text-base font-bold text-purple-300 mb-1">
          Combinazioni Predittive Scoperte dall&apos;AI
        </h2>
        <p className="text-xs text-n-dim mb-3">
          Analizzando <span className="font-mono text-n-text">{profile.candlesAnalyzed.toLocaleString()}</span> candele
          ({profile.periodStart?.slice(0, 10)} → {profile.periodEnd?.slice(0, 10)}), l&apos;AI ha testato{' '}
          <span className="font-mono text-n-text">{profile.totalCombinationsTested}</span> combinazioni di indicatori
          per individuare quali predicono con anticipo movimenti sostanziali di {symbol}.
          Trovate <span className="font-mono text-purple-300">{profile.totalPredictiveCombos}</span> combinazioni predittive,
          classificate in 3 livelli di rischio.
        </p>

        {/* Overall best result */}
        {overallBest && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] text-n-dim uppercase tracking-wider">Miglior combinazione assoluta</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {overallBest.conditions.map((c, i) => (
                    <span key={i} className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                      {conditionLabelsMap[c] ?? c}
                    </span>
                  ))}
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${overallBest.direction === 'long' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                    {overallBest.direction.toUpperCase()}
                  </span>
                </div>
                <p className="text-[10px] text-n-dim mt-1">
                  {overallBest.occurrences} segnali · WR {(overallBest.simWinRate * 100).toFixed(0)}% · PF {overallBest.simProfitFactor}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-n-dim">$1.000 sarebbero diventati</p>
                <p className="font-mono text-3xl font-bold text-emerald-400">
                  ${overallBest.simFinalCapital.toFixed(0)}
                </p>
                <p className="text-[11px] font-semibold text-emerald-300">
                  +{((overallBest.simFinalCapital - 1000) / 10).toFixed(1)}% rendimento
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Three tier columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map(tier => {
          const tp = profile.tiers[tier];
          const colors = tierColors[tier];
          if (tp.combinations.length === 0) {
            return (
              <div key={tier} className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 opacity-60`}>
                <h3 className={`text-sm font-bold ${colors.text} mb-1`}>{tp.label}</h3>
                <p className="text-xs text-n-dim">{tp.description}</p>
                <p className="text-xs text-n-dim mt-3 italic">Nessuna combinazione trovata per questo livello di rischio.</p>
              </div>
            );
          }

          return (
            <div key={tier} className={`rounded-2xl border ${colors.border} ${colors.bg} p-5`}>
              {/* Tier header */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`text-sm font-bold ${colors.text}`}>{tp.label}</h3>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${colors.badge}`}>
                    {tp.combinations.length} combinazioni
                  </span>
                </div>
                <p className="text-[10px] text-n-dim">{tp.description}</p>

                {/* Tier aggregated stats */}
                <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
                  <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                    <p className="text-n-dim">Miglior risultato</p>
                    <p className={`font-mono font-bold ${colors.text}`}>${tp.bestFinalCapital.toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                    <p className="text-n-dim">WR medio</p>
                    <p className="font-mono font-bold text-n-text">{(tp.avgWinRate * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-lg bg-n-bg/50 p-2 text-center">
                    <p className="text-n-dim">PF medio</p>
                    <p className="font-mono font-bold text-n-text">{tp.avgProfitFactor}</p>
                  </div>
                </div>
              </div>

              {/* Combination cards */}
              <div className="space-y-2">
                {tp.combinations.map((combo, i) => (
                  <CombinationCard key={combo.id} combo={combo} rank={i + 1} colors={colors} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-n-dim italic">
        ⓘ Ogni combinazione simula $1.000 di capitale investendo il 2% per operazione. Commissioni 0.2% incluse.
        Performance basate su storico reale — non garantiscono risultati futuri.
      </p>
    </div>
  );
}

function CombinationCard({ combo, rank, colors }: {
  combo: PredictiveCombination;
  rank: number;
  colors: { border: string; bg: string; text: string; badge: string };
}) {
  const isProfit = combo.simFinalCapital > 1000;

  return (
    <div className={`rounded-xl border ${isProfit ? 'border-emerald-500/20' : 'border-red-500/20'} bg-n-bg/40 p-3`}>
      {/* Conditions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold text-n-dim">#{rank}</span>
            <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${combo.direction === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {combo.direction.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {combo.conditions.map((c, i) => (
              <span key={i} className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
                {conditionLabelsMap[c] ?? c}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-mono text-lg font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            ${combo.simFinalCapital.toFixed(0)}
          </p>
          <p className={`text-[9px] font-semibold ${isProfit ? 'text-emerald-300' : 'text-red-300'}`}>
            {isProfit ? '+' : ''}{((combo.simFinalCapital - 1000) / 10).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-1 text-[9px]">
        <div>
          <p className="text-n-dim">Segnali</p>
          <p className="font-mono text-n-text">{combo.occurrences}</p>
        </div>
        <div>
          <p className="text-n-dim">Hit Rate</p>
          <p className="font-mono text-n-text">{(combo.hitRate * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-n-dim">WR</p>
          <p className="font-mono text-n-text">{(combo.simWinRate * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-n-dim">PF</p>
          <p className="font-mono text-n-text">{combo.simProfitFactor}</p>
        </div>
      </div>

      {/* TP/SL/DD */}
      {(combo.simAvgTpPct > 0 || combo.simAvgSlPct > 0) && (
        <div className="flex justify-between mt-1.5 pt-1.5 border-t border-n-border text-[9px]">
          <span className="text-n-dim">TP <span className="text-emerald-400 font-mono">+{combo.simAvgTpPct}%</span></span>
          <span className="text-n-dim">SL <span className="text-red-400 font-mono">-{combo.simAvgSlPct}%</span></span>
          <span className="text-n-dim">MaxDD <span className="text-amber-400 font-mono">{combo.simMaxDrawdownPct}%</span></span>
        </div>
      )}
    </div>
  );
}

// ─── Trading Simulator Component (legacy fallback) ──────────
// Phase 6: Shows the best indicator combinations discovered by AI,
// with a $1000 simulated strategy for each combination.
// Groups strategies by their indicator conditions and shows
// how each combination performed historically.

/** Human-readable names for condition codes. */
const conditionLabels: Record<string, string> = {
  'RSI<30': 'RSI ipervenduto (<30)',
  'RSI<40': 'RSI basso (<40)',
  'RSI>60': 'RSI alto (>60)',
  'RSI>70': 'RSI ipercomprato (>70)',
  'BB=BELOW_LOWER': 'Prezzo sotto Bollinger inf.',
  'BB=AT_LOWER': 'Prezzo alla banda inf.',
  'BB=LOWER_HALF': 'Prezzo metà inferiore',
  'BB=AT_UPPER': 'Prezzo alla banda sup.',
  'BB=ABOVE_UPPER': 'Prezzo sopra Bollinger sup.',
  'MACD=CROSS_UP': 'MACD cross rialzista',
  'MACD=CROSS_DOWN': 'MACD cross ribassista',
  'MACD=ABOVE': 'MACD positivo',
  'MACD=BELOW': 'MACD negativo',
  'TREND_S=UP': 'Trend breve rialzista',
  'TREND_S=DOWN': 'Trend breve ribassista',
  'TREND_M=UP': 'Trend medio rialzista',
  'TREND_M=DOWN': 'Trend medio ribassista',
  'TREND_L=UP': 'Trend lungo rialzista',
  'TREND_L=DOWN': 'Trend lungo ribassista',
  'ADX>25': 'Trend forte (ADX>25)',
  'ADX<15': 'Mercato piatto (ADX<15)',
  'VOL=CLIMAX': 'Volume estremo (>2.5x)',
  'VOL=HIGH': 'Volume alto (>1.5x)',
  'VOL=DRY': 'Volume basso (<0.5x)',
  'STOCH<20': 'Stocastico ipervenduto',
  'STOCH>80': 'Stocastico ipercomprato',
  'REGIME=TREND_UP': 'Regime rialzista',
  'REGIME=TREND_DN': 'Regime ribassista',
  'REGIME=RANGING': 'Regime laterale',
  'REGIME=VOLATILE': 'Regime volatile',
};

function TradingSimulator({ rankings, symbol }: { rankings: BacktestStrategySummary[]; symbol: string }) {
  const INITIAL_CAPITAL = 1000;

  // Separate strategies into: combinations (mined rules / GA with conditions) and coded strategies
  const withConditions = rankings.filter(r =>
    (r.isMineRule && r.conditions && r.conditions.length > 0) ||
    r.strategyId.startsWith('ga_')
  );
  const codedStrategies = rankings.filter(r =>
    !r.isMineRule && !r.strategyId.startsWith('ga_')
  );

  // Build the display list: first combinations, then best coded strategies
  const topCombinations = withConditions
    .filter(r => r.totalTrades >= 5)
    .slice(0, 8);
  const topCoded = codedStrategies
    .filter(r => r.totalTrades >= 10)
    .slice(0, 4);

  const allToShow = [...topCombinations, ...topCoded];
  if (allToShow.length === 0) return null;

  // Find the single best result for the hero
  const best = allToShow.reduce((a, b) => (b.netProfitPct > a.netProfitPct ? b : a), allToShow[0]);
  // netProfitPct is % return on initial capital (now $1000 directly)
  const bestProfit = best.netProfitPct / 100 * INITIAL_CAPITAL;
  const bestFinal = INITIAL_CAPITAL + bestProfit;

  // Coded strategy descriptions
  const strategyDescriptions: Record<string, string> = {
    trend: 'Segue il trend usando EMA, ADX e MACD allineati',
    reversion: 'Compra in ipervenduto sulle bande di Bollinger',
    breakout: 'Entra alla rottura dei massimi con volume elevato',
    momentum: 'Segue il momentum usando RSI, MACD e Stocastico',
    pattern: 'Opera su pattern candlestick (engulfing, hammer...)',
    combined_ai: 'Combina 4+ strategie concordi per operare',
  };

  // TF labels
  const tfLabel: Record<string, string> = {
    '5m': '5min', '15m': '15min', '1h': '1 ora', '4h': '4 ore', '1d': 'giorno',
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-purple-500/5 p-6">
      {/* Hero: best combination result */}
      <div className="mb-5">
        <h2 className="text-base font-bold text-blue-300 mb-1">
          Migliori Combinazioni Scoperte dall&apos;AI
        </h2>
        <p className="text-xs text-n-dim mb-3">
          L&apos;AI ha analizzato migliaia di combinazioni di indicatori sullo storico di {symbol}.
          Per ogni combinazione vincente, abbiamo simulato una strategia con capitale di partenza{' '}
          <span className="font-mono text-n-text">${INITIAL_CAPITAL}</span>.
        </p>

        {/* Best result hero */}
        <div className={`rounded-xl p-4 ${bestProfit >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-[10px] text-n-dim uppercase tracking-wider">Miglior combinazione trovata</p>
              <p className="text-sm font-bold text-n-text mt-0.5">
                {best.isMineRule && best.conditions
                  ? best.conditions.map(c => conditionLabels[c] ?? c).join(' + ')
                  : best.strategyId.startsWith('ga_')
                    ? `GA Evolved: ${best.strategyName}`
                    : best.strategyName}
              </p>
              <p className="text-[10px] text-n-dim mt-0.5">
                {best.totalTrades} operazioni su TF {tfLabel[best.timeframe] ?? best.timeframe} · WR {best.winRate}% · PF {best.profitFactor}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-n-dim">$1.000 sarebbero diventati</p>
              <p className={`font-mono text-3xl font-bold ${bestProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${bestFinal.toFixed(0)}
              </p>
              <p className={`text-[11px] font-semibold ${bestProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {bestProfit >= 0 ? '+' : ''}{((bestProfit / INITIAL_CAPITAL) * 100).toFixed(1)}% rendimento
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* All combinations grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {allToShow.map((r, i) => {
          const simulatedProfit = r.netProfitPct / 100 * INITIAL_CAPITAL;
          const finalCapital = INITIAL_CAPITAL + simulatedProfit;
          const isProfit = simulatedProfit >= 0;
          const avgPerTrade = r.totalTrades > 0 ? simulatedProfit / r.totalTrades : 0;
          const isCombination = r.isMineRule || r.strategyId.startsWith('ga_');
          const isBest = r === best;

          // Build human-readable conditions
          const conditionsDisplay = r.conditions && r.conditions.length > 0
            ? r.conditions.map(c => conditionLabels[c] ?? c)
            : null;

          return (
            <div
              key={`${r.strategyId}-${r.timeframe}-${i}`}
              className={`rounded-xl border p-4 transition-all ${
                isBest ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30' :
                isProfit ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
              }`}
            >
              {/* Header with badges */}
              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold text-n-dim">#{i + 1}</span>
                  {isBest && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">MIGLIORE</span>
                  )}
                  {r.isMineRule && (
                    <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-400">COMBINAZIONE AI</span>
                  )}
                  {r.strategyId.startsWith('ga_') && (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">GA EVOLVED</span>
                  )}
                  {!isCombination && (
                    <span className="rounded bg-n-card px-1.5 py-0.5 text-[9px] font-bold text-n-dim">STRATEGIA</span>
                  )}
                </div>

                {/* Conditions display */}
                {conditionsDisplay ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conditionsDisplay.map((c, ci) => (
                      <span key={ci} className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-n-text">
                    {r.strategyName.length > 30 ? r.strategyName.slice(0, 30) + '...' : r.strategyName}
                  </p>
                )}

                <p className="text-[10px] text-n-dim mt-1">
                  TF {tfLabel[r.timeframe] ?? r.timeframe} · {r.totalTrades} trade · Sharpe {r.sharpe}
                </p>
              </div>

              {/* Capital result */}
              <div className="mb-2 rounded-lg bg-n-bg/60 p-2.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-[9px] text-n-dim">$1.000 →</p>
                  <p className={`font-mono text-xl font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${finalCapital.toFixed(0)}
                  </p>
                </div>
                <p className={`text-[10px] font-semibold text-right ${isProfit ? 'text-emerald-300' : 'text-red-300'}`}>
                  {isProfit ? '+' : ''}{((simulatedProfit / INITIAL_CAPITAL) * 100).toFixed(1)}%
                </p>
              </div>

              {/* Strategy description for coded strategies */}
              {!isCombination && strategyDescriptions[r.strategyId] && (
                <p className="text-[10px] text-n-dim italic mb-2 line-clamp-2">
                  {strategyDescriptions[r.strategyId]}
                </p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <p className="text-n-dim">Operazioni</p>
                  <p className="font-mono font-bold text-n-text">{r.totalTrades}</p>
                </div>
                <div>
                  <p className="text-n-dim">Vincite</p>
                  <p className="font-mono font-bold text-n-text">{r.winRate}%</p>
                </div>
                <div>
                  <p className="text-n-dim">Profit Factor</p>
                  <p className={`font-mono font-bold ${r.profitFactor >= 1.5 ? 'text-emerald-400' : r.profitFactor >= 1 ? 'text-n-text' : 'text-red-400'}`}>
                    {r.profitFactor}
                  </p>
                </div>
                <div>
                  <p className="text-n-dim">Media/trade</p>
                  <p className={`font-mono font-bold ${avgPerTrade >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {avgPerTrade >= 0 ? '+' : ''}${avgPerTrade.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* TP/SL + drawdown */}
              <div className="mt-2 pt-2 border-t border-n-border grid grid-cols-3 gap-1 text-[9px]">
                <div>
                  <p className="text-n-dim">TP</p>
                  <p className="text-emerald-400 font-mono">+{r.avgTpDistancePct.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-n-dim">SL</p>
                  <p className="text-red-400 font-mono">-{r.avgSlDistancePct.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-n-dim">Max DD</p>
                  <p className="text-amber-400 font-mono">{r.maxDrawdownPct}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-[10px] text-n-dim italic">
        ⓘ Combinazioni scoperte analizzando lo storico di {symbol}. Ogni card simula $1.000 di capitale
        operando con quella combinazione specifica. Performance passate non garantiscono risultati futuri.
        Le combinazioni &quot;AI&quot; sono regole scoperte automaticamente dal pattern mining.
      </p>
    </div>
  );
}

function RuleTable({
  title,
  rules,
  dir,
  symbol,
  explainMode,
}: {
  title: string;
  rules: AnalyticReport['topRules'];
  dir: 'long' | 'short';
  symbol: string;
  explainMode: boolean;
}) {
  const safeRules = Array.isArray(rules) ? rules : [];
  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5">
      <h2 className="mb-1 text-sm font-semibold text-n-text">{title}</h2>
      {explainMode && (
        <p className="mb-3 text-[10px] italic text-n-dim">
          Le combinazioni di condizioni che storicamente hanno preceduto un movimento{' '}
          {dir === 'long' ? 'rialzista' : 'ribassista'} di {symbol} nelle 24h successive. Più alta
          è la <MetricTooltip term="Confidence">confidence</MetricTooltip>, più la regola è
          robusta statisticamente.
        </p>
      )}
      {safeRules.length === 0 ? (
        <p className="text-xs text-n-dim">Nessuna regola {dir} significativa.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-n-dim">
              <tr>
                <th className="px-2 py-1.5">Conditions</th>
                <th className="px-2 py-1.5">
                  <MetricTooltip term="WR">WR</MetricTooltip>
                </th>
                <th className="px-2 py-1.5">N</th>
                <th className="px-2 py-1.5">Avg ret</th>
                <th className="px-2 py-1.5">
                  <MetricTooltip term="Confidence">Conf</MetricTooltip>
                </th>
              </tr>
            </thead>
            <tbody className="text-n-text">
              {safeRules.map((r, i) => (
                <tr key={r?.id ?? `rule-${i}`} className="border-t border-n-border align-top">
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {(Array.isArray(r?.conditions) ? r.conditions : []).join(' + ')}
                    {r && Array.isArray(r.conditions) && r.conditions.length > 0 && (
                      <div className="mt-1 max-w-xs whitespace-normal text-[10px] font-sans not-italic text-n-dim">
                        {ruleToItalian(
                          {
                            conditions: r.conditions,
                            direction: r.direction,
                            avgReturn: r.avgReturn ?? 0,
                            occurrences: r.occurrences ?? 0,
                            winRate: r.winRate ?? 0,
                          },
                          symbol,
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{fmtPct(r?.winRate, 0)}</td>
                  <td className="px-2 py-1.5">{r?.occurrences ?? '—'}</td>
                  <td className="px-2 py-1.5">{fmtPct(r?.avgReturn)}</td>
                  <td className="px-2 py-1.5">{r?.confidenceScore ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
