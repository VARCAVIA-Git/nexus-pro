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
import { ArrowLeft, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { LiveContextCard } from '@/components/analytics/LiveContextCard';
import { NewsPulseCard } from '@/components/analytics/NewsPulseCard';
import { MacroEventsCard } from '@/components/analytics/MacroEventsCard';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    load();
    loadLive();
  }, [load, loadLive]);

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

  // Auto-refresh live context every 30s when ready
  useEffect(() => {
    if (!analytic || analytic.status !== 'ready') return;
    const id = setInterval(() => {
      loadLive();
      load();
    }, 30000);
    return () => clearInterval(id);
  }, [analytic, loadLive, load]);

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
      router.push('/assets');
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
        <Link href="/assets" className="inline-flex items-center gap-2 text-xs text-n-dim hover:text-n-text">
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
      <Link href="/assets" className="inline-flex items-center gap-2 text-xs text-n-dim hover:text-n-text">
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
          <LiveContextCard context={live} />
          <div className="grid gap-5 lg:grid-cols-2">
            <NewsPulseCard digest={news} />
            <MacroEventsCard events={events} />
          </div>
        </>
      )}

      {isReady && report && <ReportView report={report} />}
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

function ReportView({ report }: { report: AnalyticReport }) {
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
  const zones = (Array.isArray(report.reactionZones) ? report.reactionZones : []).slice(0, 15);
  const fits = (Array.isArray(report.strategyFit) ? report.strategyFit : []).slice(0, 12);
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
        <h2 className="mb-3 text-sm font-semibold text-n-text">Raccomandazione</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Operation mode" value={report.recommendedOperationMode} />
          <Stat label="Best timeframe" value={report.recommendedTimeframe} />
          <Stat label="Best regime LONG" value={report.globalStats?.bestRegimeForLong} />
          <Stat label="Best regime SHORT" value={report.globalStats?.bestRegimeForShort} />
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
        <RuleTable title="Top 10 regole BUY" rules={buyRules} dir="long" />
        <RuleTable title="Top 10 regole SELL" rules={sellRules} dir="short" />
      </div>

      {/* Reaction zones */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">Reaction zones</h2>
        {zones.length === 0 ? (
          <p className="text-xs text-n-dim">Nessuna zona identificata.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-n-dim">
                <tr>
                  <th className="px-2 py-1.5">Livello</th>
                  <th className="px-2 py-1.5">Tipo</th>
                  <th className="px-2 py-1.5">Strength</th>
                  <th className="px-2 py-1.5">Touches</th>
                  <th className="px-2 py-1.5">P(bounce)</th>
                  <th className="px-2 py-1.5">Avg bounce</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {zones.map((z, i) => (
                  <tr key={i} className="border-t border-n-border">
                    <td className="px-2 py-1.5 font-mono">{fmtNum(z?.priceLevel, 2)}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          z?.type === 'support' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {z?.type ?? '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{z?.strength ?? '—'}</td>
                    <td className="px-2 py-1.5">{z?.touchCount ?? '—'}</td>
                    <td className="px-2 py-1.5">{fmtPct((z?.bounceProbability ?? 0) * 100)}</td>
                    <td className="px-2 py-1.5">{fmtPct(z?.avgBounceMagnitude)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Strategy fit */}
      <div className="rounded-2xl border border-n-border bg-n-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-n-text">Strategy fit</h2>
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
                  <th className="px-2 py-1.5">Trades</th>
                  <th className="px-2 py-1.5">WR</th>
                  <th className="px-2 py-1.5">PF</th>
                  <th className="px-2 py-1.5">Sharpe</th>
                  <th className="px-2 py-1.5">MaxDD</th>
                </tr>
              </thead>
              <tbody className="text-n-text">
                {fits.map((f, i) => (
                  <tr key={`${f?.strategyName ?? 'x'}-${f?.timeframe ?? i}`} className="border-t border-n-border">
                    <td className="px-2 py-1.5 font-mono">{f?.rank ?? '—'}</td>
                    <td className="px-2 py-1.5">{f?.strategyName ?? '—'}</td>
                    <td className="px-2 py-1.5">{f?.timeframe ?? '—'}</td>
                    <td className="px-2 py-1.5">{f?.totalTrades ?? '—'}</td>
                    <td className="px-2 py-1.5">{fmtPct(f?.winRate, 1)}</td>
                    <td className="px-2 py-1.5">{fmtNum(f?.profitFactor)}</td>
                    <td className="px-2 py-1.5">{fmtNum(f?.sharpe)}</td>
                    <td className="px-2 py-1.5">{fmtPct(f?.maxDrawdown)}</td>
                  </tr>
                ))}
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
}: {
  title: string;
  rules: AnalyticReport['topRules'];
  dir: 'long' | 'short';
}) {
  const safeRules = Array.isArray(rules) ? rules : [];
  return (
    <div className="rounded-2xl border border-n-border bg-n-card p-5">
      <h2 className="mb-3 text-sm font-semibold text-n-text">{title}</h2>
      {safeRules.length === 0 ? (
        <p className="text-xs text-n-dim">Nessuna regola {dir} significativa.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-n-dim">
              <tr>
                <th className="px-2 py-1.5">Conditions</th>
                <th className="px-2 py-1.5">WR</th>
                <th className="px-2 py-1.5">N</th>
                <th className="px-2 py-1.5">Avg ret</th>
                <th className="px-2 py-1.5">Conf</th>
              </tr>
            </thead>
            <tbody className="text-n-text">
              {safeRules.map((r, i) => (
                <tr key={r?.id ?? `rule-${i}`} className="border-t border-n-border align-top">
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {(Array.isArray(r?.conditions) ? r.conditions : []).join(' + ')}
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
