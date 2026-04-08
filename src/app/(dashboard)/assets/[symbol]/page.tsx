'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AssetAnalytic, JobStatus } from '@/lib/analytics/types';
import { ArrowLeft, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function AssetDetailPage() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol);

  const [analytic, setAnalytic] = useState<AssetAnalytic | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/analytics/${encodeURIComponent(symbol)}`);
    if (r.ok) {
      const d = await r.json();
      setAnalytic(d.analytic);
    } else {
      setAnalytic(null);
    }
    setLoading(false);
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
  }, [load]);

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
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={16} /> AI Analytic pronta
          </div>
          <p className="mt-2 text-xs text-n-dim">
            Report disponibile (verrà popolato in Phase 2). Pattern, reaction zones e strategy fit
            saranno mostrati qui non appena la pipeline sarà attiva.
          </p>
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
