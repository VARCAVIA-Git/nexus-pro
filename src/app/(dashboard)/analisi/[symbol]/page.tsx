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
} from '@/lib/analytics/types';
import { ArrowLeft, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle, Clock, Lightbulb } from 'lucide-react';
import { LiveContextCard } from '@/components/analytics/LiveContextCard';
import { NewsPulseCard } from '@/components/analytics/NewsPulseCard';
import { MacroEventsCard } from '@/components/analytics/MacroEventsCard';
import { RelevantEventsCard } from '@/components/analytics/RelevantEventsCard';
import { PlainLanguageSummary } from '@/components/analytics/PlainLanguageSummary';
import { AICInsightsCard } from '@/components/analytics/AICInsightsCard';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import { filterZonesByDistance } from '@/lib/analytics/zone-filter';
import { useExplainMode } from '@/hooks/useExplainMode';
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
      const status = sRes.status === 'fulfilled' && sRes.value.ok ? await sRes.value.json() : null;
      const research = rRes.status === 'fulfilled' && rRes.value.ok ? await rRes.value.json() : null;
      const confluence = cRes.status === 'fulfilled' && cRes.value.ok ? await cRes.value.json() : null;
      setAicData({ status, research, confluence: confluence?.confluence ?? status?.confluence });
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
          <div className="flex gap-2">
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
          {/* Phase 3.7: riassunto in italiano naturale generato dall'AI Analytic */}
          <PlainLanguageSummary
            symbol={symbol}
            report={report}
            liveContext={live}
            newsDigest={news}
            macroEvents={events}
            eventImpacts={report?.eventImpacts}
          />
          <AICInsightsCard data={aicData} symbol={symbol} />
          <LiveContextCard context={live} />
          <div className="grid gap-5 lg:grid-cols-2">
            <NewsPulseCard digest={news} symbol={symbol} onRefresh={loadLive} />
            <MacroEventsCard
              events={events}
              eventImpacts={report?.eventImpacts}
              symbol={symbol}
            />
          </div>
          <RelevantEventsCard
            events={events}
            eventImpacts={report?.eventImpacts}
            symbol={symbol}
          />
        </>
      )}

      {isReady && report && (
        <ReportView
          report={report}
          currentPrice={live?.price ?? null}
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
  const datasetSummary = ['15m', '1h', '4h', '1d']
    .map((tf) => `${tfCounts[tf] ?? 0} ${tf}`)
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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <CheckCircle2 size={16} /> AI Analytic pronta
        </div>
        <p className="mt-2 text-xs text-n-dim">
          Report generato il <span className="font-mono">{generated}</span> · dataset: {datasetSummary}
        </p>
      </div>

      {/* Raccomandazione */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-n-text">Raccomandazione</h2>
        {explainMode && (
          <p className="mb-3 text-[10px] italic text-n-dim">
            Lo stile operativo e timeframe migliore secondo i backtest, e i regimi di mercato in
            cui questo asset è stato storicamente più forte al rialzo o ribasso.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Operation mode" value={report.recommendedOperationMode} />
          <Stat label="Best timeframe" value={report.recommendedTimeframe} />
          <Stat
            label="Best regime LONG"
            value={regimeLabel(report.globalStats?.bestRegimeForLong)}
          />
          <Stat
            label="Best regime SHORT"
            value={regimeLabel(report.globalStats?.bestRegimeForShort)}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Max gain 24h" value={fmtPct(report.globalStats?.maxGainObserved)} />
          <Stat label="Max loss 24h" value={fmtPct(report.globalStats?.maxLossObserved)} />
          <Stat label="Vol 1h" value={fmtPct(report.globalStats?.volatility?.['1h'], 3)} />
          <Stat label="Vol 1d" value={fmtPct(report.globalStats?.volatility?.['1d'], 3)} />
        </div>
      </div>

      {/* Top rules */}
      <div className="grid gap-5 lg:grid-cols-2">
        <RuleTable
          title="Top 10 regole BUY"
          rules={buyRules}
          dir="long"
          symbol={symbol}
          explainMode={explainMode}
        />
        <RuleTable
          title="Top 10 regole SELL"
          rules={sellRules}
          dir="short"
          symbol={symbol}
          explainMode={explainMode}
        />
      </div>

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

      {/* Strategy fit */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-1 text-sm font-semibold text-n-text">Strategy fit</h2>
        {explainMode && (
          <p className="mb-3 text-[10px] italic text-n-dim">
            Le strategie classiche backtestate su {symbol}, ordinate per qualità complessiva
            (PF pesato per numero di trade). Le righe &quot;low sample&quot; hanno meno di 10
            trade e non sono affidabili statisticamente.
          </p>
        )}
        {fits.length === 0 ? (
          <p className="text-xs text-n-dim">Nessun fit calcolato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Strategia</th>
                  <th className="px-2 py-1.5">TF</th>
                  <th className="px-2 py-1.5">
                    <MetricTooltip term="Trades">Trades</MetricTooltip>
                  </th>
                  <th className="px-2 py-1.5">
                    <MetricTooltip term="WR">WR</MetricTooltip>
                  </th>
                  <th className="px-2 py-1.5">
                    <MetricTooltip term="PF">PF</MetricTooltip>
                  </th>
                  <th className="px-2 py-1.5">
                    <MetricTooltip term="Sharpe">Sharpe</MetricTooltip>
                  </th>
                  <th className="px-2 py-1.5">
                    <MetricTooltip term="MaxDD">MaxDD</MetricTooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {fits.map((f, i) => {
                  const lowSample = (f as any)._lowSample;
                  return (
                    <tr
                      key={`${f?.strategyName ?? 'x'}-${f?.timeframe ?? i}`}
                      className={`border-t border-n-border ${lowSample ? 'text-n-dim opacity-60' : ''}`}
                    >
                      <td className="px-2 py-1.5 font-mono">{lowSample ? '—' : f?.rank ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {f?.strategyName ?? '—'}
                        {lowSample && (
                          <span className="ml-1.5 rounded bg-n-card px-1.5 py-0.5 text-[9px] font-semibold text-n-dim">
                            low sample
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{f?.timeframe ?? '—'}</td>
                      <td className="px-2 py-1.5">{f?.totalTrades ?? '—'}</td>
                      <td className="px-2 py-1.5">{fmtPct(f?.winRate, 1)}</td>
                      <td className="px-2 py-1.5">{fmtNum(f?.profitFactor)}</td>
                      <td className="px-2 py-1.5">{fmtNum(f?.sharpe)}</td>
                      <td className="px-2 py-1.5">{fmtPct(f?.maxDrawdown)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Indicator reactivity */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">Indicator reactivity</h2>
        {indicators.length === 0 ? (
          <p className="text-xs text-n-dim">Nessun indicatore con segnali sufficienti.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Indicatore</th>
                  <th className="px-2 py-1.5">Segnali</th>
                  <th className="px-2 py-1.5">WR</th>
                  <th className="px-2 py-1.5">Avg return</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {indicators.map((ind, i) => (
                  <tr key={ind?.indicatorName ?? `ind-${i}`} className="border-t border-n-border">
                    <td className="px-2 py-1.5 font-mono">{ind?.indicatorName ?? '—'}</td>
                    <td className="px-2 py-1.5">{ind?.signalCount ?? '—'}</td>
                    <td className="px-2 py-1.5">{fmtPct(ind?.winRate, 1)}</td>
                    <td className="px-2 py-1.5">{fmtPct(ind?.avgReturn, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
