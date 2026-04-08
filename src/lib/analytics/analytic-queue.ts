// ═══════════════════════════════════════════════════════════════
// Analytic Queue — coda Redis sequenziale (Phase 2)
//
// Schema chiavi:
//   nexus:analytic:queue          LIST   FIFO di symbol in attesa
//   nexus:analytic:lock           STR    lock single-job, TTL 3600s
//   nexus:analytic:job:{symbol}   JSON   JobStatus corrente
//   nexus:analytic:list           SET    symbol con AI Analytic assegnata
//   nexus:analytic:{symbol}       JSON   AssetAnalytic state
// ═══════════════════════════════════════════════════════════════

import {
  redisGet,
  redisSet,
  redisDel,
  redisLPush,
  redisRPop,
  redisLRange,
  redisLLen,
  redisLRem,
  redisSAdd,
  redisSRem,
  redisSMembers,
  redisGetRaw,
  redisSetNX,
} from '@/lib/db/redis';
import type {
  AssetAnalytic as AssetAnalyticState,
  AssetClass,
  JobPhase,
  JobStatus,
} from './types';

// ── Key builders ──────────────────────────────────────────

const KEY_QUEUE = 'nexus:analytic:queue';
const KEY_LOCK = 'nexus:analytic:lock';
const KEY_LIST = 'nexus:analytic:list';
const KEY_STATE = (s: string) => `nexus:analytic:${s}`;
const KEY_JOB = (s: string) => `nexus:analytic:job:${s}`;
const KEY_DATASET = (s: string) => `nexus:analytic:dataset:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_LIVE = (s: string) => `nexus:analytic:live:${s}`;
const KEY_ZONES = (s: string) => `nexus:analytic:zones:${s}`;

const LOCK_TTL_SECONDS = 3600; // 60 min hard cap per training
const ETA_PER_SLOT_SECONDS = 720; // ≈12 min stima per asset
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function uuid(): string {
  // Use Node crypto if available, fallback to random hex
  try {
    // @ts-ignore - available on node>=14.17
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Internal helpers ──────────────────────────────────────

async function readState(symbol: string): Promise<AssetAnalyticState | null> {
  return redisGet<AssetAnalyticState>(KEY_STATE(symbol));
}

async function writeState(state: AssetAnalyticState): Promise<void> {
  await redisSet(KEY_STATE(state.symbol), state);
}

async function writeJob(job: JobStatus): Promise<void> {
  await redisSet(KEY_JOB(job.symbol), job);
}

async function isInQueue(symbol: string): Promise<boolean> {
  // Coda corta — ok scaricare l'intera lista
  const items = await redisLRange(KEY_QUEUE, 0, -1);
  return items.includes(symbol);
}

async function isCurrentlyTraining(symbol: string): Promise<boolean> {
  const state = await readState(symbol);
  return state?.status === 'training' || state?.status === 'refreshing';
}

// ── Public API ────────────────────────────────────────────

export async function enqueue(
  symbol: string,
  assetClass: AssetClass,
): Promise<{ position: number; etaSeconds: number }> {
  // Idempotenza: se è già in queue o in training, non duplicare
  if (await isCurrentlyTraining(symbol)) {
    return { position: 0, etaSeconds: 0 };
  }
  if (await isInQueue(symbol)) {
    const items = await redisLRange(KEY_QUEUE, 0, -1);
    // Coda è FIFO da destra: il primo a essere consumato è in fondo (RPOP).
    // L'item appena pushato sta in cima (indice 0). La posizione "logica"
    // è (length - indexFromHead). Position 1 = next out.
    const idxFromHead = items.indexOf(symbol);
    const position = items.length - idxFromHead;
    return { position, etaSeconds: position * ETA_PER_SLOT_SECONDS };
  }

  // Crea/aggiorna lo stato
  const existing = await readState(symbol);
  const now = Date.now();
  const state: AssetAnalyticState = existing
    ? {
        ...existing,
        status: existing.status === 'ready' ? 'refreshing' : 'queued',
        trainingJobId: uuid(),
      }
    : {
        symbol,
        assetClass,
        status: 'queued',
        createdAt: now,
        lastTrainedAt: null,
        lastObservedAt: null,
        nextScheduledRefresh: null,
        trainingJobId: uuid(),
        failureCount: 0,
        reportVersion: 0,
      };
  await writeState(state);
  await redisSAdd(KEY_LIST, symbol);

  // Push e calcola posizione
  await redisLPush(KEY_QUEUE, symbol);
  const length = await redisLLen(KEY_QUEUE);
  const position = length; // appena pushato in testa, sarà l'ultimo a uscire
  const etaSeconds = position * ETA_PER_SLOT_SECONDS;

  const job: JobStatus = {
    jobId: state.trainingJobId ?? uuid(),
    symbol,
    phase: 'queued',
    progress: 0,
    message: `In coda, posizione ${position}`,
    startedAt: now,
    etaSeconds,
  };
  await writeJob(job);

  return { position, etaSeconds };
}

/**
 * Tenta di processare il prossimo job dalla coda.
 * Ritorna true se ha avviato un job (anche se poi è fallito), false se non c'era nulla da fare.
 */
export async function processNext(): Promise<boolean> {
  const jobId = uuid();
  // Tenta di acquisire il lock atomicamente (SET NX EX)
  const acquired = await redisSetNX(KEY_LOCK, jobId, LOCK_TTL_SECONDS);
  if (!acquired) return false;

  let symbol: string | null = null;
  try {
    symbol = await redisRPop(KEY_QUEUE);
    if (!symbol) {
      await redisDel(KEY_LOCK);
      return false;
    }

    // Lazy import per evitare cicli (asset-analytic importa cose pesanti)
    const { runPipeline } = await import('./asset-analytic');
    await runPipeline(symbol);
    return true;
  } catch (err) {
    if (symbol) {
      await markFailed(symbol, err as Error);
    }
    return true;
  } finally {
    // Libera il lock SOLO se appartiene ancora a questo job (best effort)
    try {
      const current = await redisGetRaw(KEY_LOCK);
      if (current === jobId) await redisDel(KEY_LOCK);
    } catch {
      await redisDel(KEY_LOCK).catch(() => {});
    }
  }
}

export async function getJobStatus(symbol: string): Promise<JobStatus | null> {
  return redisGet<JobStatus>(KEY_JOB(symbol));
}

export async function updateJobProgress(
  symbol: string,
  phase: JobPhase,
  progress: number,
  message: string,
): Promise<void> {
  const existing = (await getJobStatus(symbol)) ?? {
    jobId: uuid(),
    symbol,
    phase: 'queued' as JobPhase,
    progress: 0,
    message: '',
    startedAt: Date.now(),
    etaSeconds: 0,
  };
  const elapsed = (Date.now() - existing.startedAt) / 1000;
  const etaSeconds = progress > 0 ? Math.max(0, Math.round((elapsed / progress) * (100 - progress))) : existing.etaSeconds;
  await writeJob({
    ...existing,
    phase,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    message,
    etaSeconds,
  });
}

export async function markFailed(symbol: string, error: Error): Promise<void> {
  const state = await readState(symbol);
  if (state) {
    await writeState({
      ...state,
      status: 'failed',
      failureCount: (state.failureCount ?? 0) + 1,
    });
  }
  const job = await getJobStatus(symbol);
  if (job) {
    await writeJob({
      ...job,
      phase: 'error',
      progress: job.progress ?? 0,
      message: `Errore: ${error.message ?? String(error)}`,
    });
  }
}

/**
 * Pulisce le AI Analytic stuck (queued/training senza lastTrainedAt da > 2h).
 * Ritorna il numero di chiavi simboliche ripulite.
 */
export async function resetStuck(): Promise<number> {
  const symbols = await redisSMembers(KEY_LIST);
  let cleaned = 0;
  const now = Date.now();

  for (const symbol of symbols) {
    const state = await readState(symbol);
    const stuck =
      !state ||
      ((state.status === 'queued' || state.status === 'training') &&
        state.lastTrainedAt === null &&
        now - state.createdAt > STALE_AFTER_MS);

    if (!stuck) continue;

    await Promise.all([
      redisDel(KEY_STATE(symbol)),
      redisDel(KEY_JOB(symbol)),
      redisDel(KEY_DATASET(symbol)),
      redisDel(KEY_REPORT(symbol)),
      redisDel(KEY_LIVE(symbol)),
      redisDel(KEY_ZONES(symbol)),
    ]);
    await redisSRem(KEY_LIST, symbol).catch(() => {});
    await redisLRem(KEY_QUEUE, 0, symbol).catch(() => {});
    cleaned++;
  }

  // Pulisci lock orfano
  try {
    if (await (await import('@/lib/db/redis')).redisExists(KEY_LOCK)) {
      // potrebbe essere un lock zombie da un crash precedente
      await redisDel(KEY_LOCK);
    }
  } catch {
    /* ignore */
  }

  return cleaned;
}

/** Stato corrente della queue (utility per /api/cron/analytic-tick). */
export async function getQueueLength(): Promise<number> {
  return redisLLen(KEY_QUEUE);
}
