// Dry-run: accoda BTC/USD, lancia processNext in background, e per ~60s
// stampa l'avanzamento del JobStatus. Verifica che la fase superi 'queued'.
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const { enqueue, processNext, getJobStatus } = await import('../../src/lib/analytics/analytic-queue');
  const { spawnAnalytic } = await import('../../src/lib/analytics/analytic-registry');

  console.log('[dryrun] spawnAnalytic BTC/USD…');
  await spawnAnalytic('BTC/USD', 'crypto');

  console.log('[dryrun] enqueue BTC/USD…');
  const r = await enqueue('BTC/USD', 'crypto');
  console.log('[dryrun] enqueue result:', r);

  console.log('[dryrun] processNext (background)…');
  // Non await: lascia girare. Se il pipeline è veloce/sincrono fino a `download`,
  // vedremo le prime fasi avanzare nel polling sotto.
  const pipelinePromise = processNext().catch((e) => {
    console.error('[dryrun] processNext FAILED:', e?.message ?? e);
  });

  const startedAt = Date.now();
  const DEADLINE_MS = 60_000;
  let lastPhase: string | undefined;

  while (Date.now() - startedAt < DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = await getJobStatus('BTC/USD').catch(() => null);
    if (!job) {
      console.log(`[dryrun +${secs(startedAt)}s] job=null`);
      continue;
    }
    if (job.phase !== lastPhase) {
      console.log(
        `[dryrun +${secs(startedAt)}s] phase=${job.phase} progress=${job.progress}% — ${job.message}`,
      );
      lastPhase = job.phase;
    } else {
      console.log(`[dryrun +${secs(startedAt)}s] phase=${job.phase} progress=${job.progress}%`);
    }
    if (job.phase === 'done' || job.phase === 'error') break;
  }

  // Snapshot finale
  const finalJob = await getJobStatus('BTC/USD');
  console.log('[dryrun] FINAL job snapshot:', finalJob);

  // Lascia un grace period per non killare scritture in volo
  await Promise.race([pipelinePromise, new Promise((r) => setTimeout(r, 1000))]);
  process.exit(0);
}

function secs(t: number) {
  return Math.round((Date.now() - t) / 1000);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
