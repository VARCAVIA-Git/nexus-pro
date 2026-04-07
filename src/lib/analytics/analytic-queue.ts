// ═══════════════════════════════════════════════════════════════
// Analytic Queue — coda sequenziale di training (Phase 1: stub)
// In Phase 2 sarà una coda Redis vera (LPUSH/RPOP) con lock.
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet, redisDel } from '@/lib/db/redis';
import type { JobStatus } from './types';
import { getAnalytic, saveAnalyticState } from './analytic-registry';

const KEY_QUEUE = 'nexus:analytic:queue';
const KEY_JOB = (symbol: string) => `nexus:analytic:job:${symbol}`;

const ETA_PER_POSITION_SECONDS = 12 * 60; // 12 min per slot (placeholder)

async function readQueue(): Promise<string[]> {
  const q = await redisGet<string[]>(KEY_QUEUE);
  return Array.isArray(q) ? q : [];
}

async function writeQueue(q: string[]): Promise<void> {
  await redisSet(KEY_QUEUE, q);
}

/** Accoda un symbol per il training. Idempotente. Ritorna posizione e ETA. */
export async function enqueue(symbol: string): Promise<{ position: number; etaSeconds: number }> {
  const q = await readQueue();
  if (!q.includes(symbol)) q.push(symbol);
  await writeQueue(q);

  const position = q.indexOf(symbol) + 1;
  const etaSeconds = position * ETA_PER_POSITION_SECONDS;

  // Mark analytic as queued
  const state = await getAnalytic(symbol);
  if (state) {
    state.status = state.status === 'ready' ? 'refreshing' : 'queued';
    state.trainingJobId = `job-${Date.now()}-${symbol}`;
    await saveAnalyticState(state);
  }

  // Initial job status snapshot
  const job: JobStatus = {
    jobId: state?.trainingJobId ?? `job-${Date.now()}-${symbol}`,
    symbol,
    phase: 'queued',
    progress: 0,
    message: `In coda, posizione ${position}`,
    startedAt: Date.now(),
    etaSeconds,
  };
  await redisSet(KEY_JOB(symbol), job);

  return { position, etaSeconds };
}

/** Estrae il prossimo job dalla coda e lo processa. Phase 1: stub. */
export async function processNext(): Promise<void> {
  // Placeholder: in Phase 2 questa funzione fa il vero training
  // (download → analysis → mining → profiling → finalize) e aggiorna il job a ogni fase.
  return;
}

/** Stato corrente del job di training per un symbol. */
export async function getJobStatus(symbol: string): Promise<JobStatus | null> {
  return redisGet<JobStatus>(KEY_JOB(symbol));
}

/** Rimuove il job (cleanup). */
export async function clearJob(symbol: string): Promise<void> {
  await redisDel(KEY_JOB(symbol));
}
