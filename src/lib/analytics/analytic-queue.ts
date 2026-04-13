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

// Lock TTL ridotto da 3600s (1h) a 600s (10 min). Phase 2 metteva 1h come
// hard cap del peggior caso reale di training, ma in caso di crash quel
// valore impedisce per un'ora a live-observer e auto-retrain di girare.
// 10 minuti coprono un retrain reale e mantengono auto-recovery rapido.
export const LOCK_TTL_SECONDS = 600;
const ETA_PER_SLOT_SECONDS = 720; // ≈12 min stima per asset
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

// ── Lock primitive (Phase 4 hardening) ───────────────────

export interface LockValue {
  owner: 'cron' | 'manual';
  lockedAt: number;
}

/**
 * Tenta di acquisire il lock di training.
 * - Se il lock esiste con `lockedAt` più vecchio di LOCK_TTL_SECONDS → lo
 *   considera stale, lo forza-rilascia e logga, poi riprova ad acquisire.
 * - Se il lock esiste e NON è stale → ritorna null (locked).
 * - Se il lock non esiste → SET NX EX con il valore JSON `{owner, lockedAt}`,
 *   e ritorna la stringa del valore (usata come token in releaseLock).
 *
 * Esportata per testabilità.
 */
export async function acquireLock(owner: 'cron' | 'manual' = 'cron'): Promise<string | null> {
  // 1. Check stale
  const existingRaw = await redisGetRaw(KEY_LOCK);
  if (existingRaw) {
    let existing: LockValue | null = null;
    try {
      existing = JSON.parse(existingRaw);
    } catch {
      existing = null;
    }
    if (existing && typeof existing.lockedAt === 'number') {
      const ageMs = Date.now() - existing.lockedAt;
      if (ageMs > LOCK_TTL_SECONDS * 1000) {
        console.warn(
          `[lock] auto-released stale lock (age: ${Math.round(ageMs / 1000)}s, owner: ${existing.owner ?? 'unknown'})`,
        );
        await redisDel(KEY_LOCK);
      } else {
        return null; // lock attivo, non stale
      }
    } else {
      // Lock in formato legacy (uuid string puro): se non è JSON valido,
      // assumiamo che sia stale (non sappiamo l'età) e lo rilasciamo.
      console.warn('[lock] auto-released legacy-format lock');
      await redisDel(KEY_LOCK);
    }
  }

  // 2. Try acquire
  const value: LockValue = { owner, lockedAt: Date.now() };
  const valueStr = JSON.stringify(value);
  const ok = await redisSetNX(KEY_LOCK, valueStr, LOCK_TTL_SECONDS);
  if (!ok) return null;
  return valueStr;
}

/**
 * Rilascia il lock SOLO se appartiene ancora al token passato.
 * Best effort: in caso di errore Redis, log e non rilancia.
 */
export async function releaseLock(token: string): Promise<void> {
  try {
    const current = await redisGetRaw(KEY_LOCK);
    if (current === token) {
      await redisDel(KEY_LOCK);
      console.log('[lock] released');
    } else if (current) {
      console.warn('[lock] release skipped: lock owned by another process');
    }
  } catch (e) {
    console.warn(`[lock] release error: ${(e as Error).message}`);
  }
}

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
 *
 * Phase 4 hardening:
 * - acquireLock() gestisce stale lock auto-release (>10 min).
 * - finally garantisce releaseLock anche su throw del pipeline.
 */
export async function processNext(): Promise<boolean> {
  const token = await acquireLock('cron');
  if (!token) return false;

  let symbol: string | null = null;
  try {
    symbol = await redisRPop(KEY_QUEUE);
    if (!symbol) {
      await releaseLock(token);
      return false;
    }

    // Phase 5: Fire-and-forget — launch training in background.
    // The training saves progress to Redis as it goes.
    // Lock is released INSIDE the background task when done.
    // This prevents the HTTP request timeout from killing the training.
    const capturedSymbol = symbol;
    const capturedToken = token;

    // Don't await — let it run in background
    (async () => {
      try {
        const { runPipeline } = await import('./asset-analytic');
        await runPipeline(capturedSymbol);
      } catch (err) {
        try {
          await markFailed(capturedSymbol, err as Error);
        } catch {}
        console.error(`[processNext] training failed for ${capturedSymbol}:`, (err as Error).message);
      } finally {
        await releaseLock(capturedToken);
      }
    })();

    // Return immediately — training continues in background
    return true;
  } catch (err) {
    await releaseLock(token);
    return false;
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
