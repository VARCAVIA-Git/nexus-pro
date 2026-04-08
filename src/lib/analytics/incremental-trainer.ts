// ═══════════════════════════════════════════════════════════════
// Incremental Trainer (Phase 3)
//
// Riallena un AnalyticReport esistente *senza* rifare l'intera pipeline:
//   1. Carica il report e il dataset persistito
//   2. Scarica solo le candele 1h nuove dall'ultimo timestamp
//   3. Se < 50 nuove candele → skip
//   4. Concatena ultime 1000 vecchie + nuove (window mobile)
//   5. Ri-esegue mining + reaction zones su quella finestra
//   6. Merge incrementale con decay 0.9 sulle regole non-più matchate
//   7. Aggiunge entry a trainingHistory mode='incremental'
//   8. Budget hard 90s, abort & schedule full retrain
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { redisGet, redisSet, redisSMembers } from '@/lib/db/redis';
import type {
  AnalyticReport,
  AssetAnalytic as AssetAnalyticState,
  MinedRule,
  TrainingHistoryEntry,
} from './types';
import { downloadCompleteHistory } from '@/lib/research/deep-mapping/data-collector';
import { analyzeAllCandles } from '@/lib/research/deep-mapping/candle-analyzer';
import { minePatterns } from '@/lib/research/deep-mapping/pattern-miner';

const KEY_STATE = (s: string) => `nexus:analytic:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_DATASET = (s: string) => `nexus:analytic:dataset:${s}`;
const KEY_LIST = 'nexus:analytic:list';

const MIN_NEW_CANDLES = 50;
const WINDOW_OLD_CANDLES = 1000;
const BUDGET_MS = 90_000;
const FULL_RETRAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const INCREMENTAL_AFTER_MS = 24 * 60 * 60 * 1000;
const REGIME_CHANGE_TRIGGER_MS = 2 * 60 * 60 * 1000;

export interface IncrementalResult {
  symbol: string;
  skipped: boolean;
  reason?: string;
  candlesAdded: number;
  rulesAdded: number;
  rulesDecayed: number;
  rulesRemoved: number;
  durationMs: number;
}

export async function runIncrementalTrain(symbol: string): Promise<IncrementalResult> {
  const start = Date.now();
  const report = await redisGet<AnalyticReport>(KEY_REPORT(symbol));
  if (!report) {
    return { symbol, skipped: true, reason: 'no-report', candlesAdded: 0, rulesAdded: 0, rulesDecayed: 0, rulesRemoved: 0, durationMs: 0 };
  }

  const lastTs = report.datasetCoverage?.lastCandleTimestamp;
  if (!lastTs) {
    return { symbol, skipped: true, reason: 'no-lastCandleTimestamp', candlesAdded: 0, rulesAdded: 0, rulesDecayed: 0, rulesRemoved: 0, durationMs: 0 };
  }

  // Scarica le candele 1h nuove (da Alpaca crypto/stocks)
  let history;
  try {
    history = await downloadCompleteHistory(symbol);
  } catch (e) {
    return { symbol, skipped: true, reason: `download-failed:${(e as Error).message}`, candlesAdded: 0, rulesAdded: 0, rulesDecayed: 0, rulesRemoved: 0, durationMs: Date.now() - start };
  }

  const all1h: OHLCV[] = history['1h'] ?? [];
  const newCandles = all1h.filter((c) => new Date(c.date).getTime() > lastTs);
  if (newCandles.length < MIN_NEW_CANDLES) {
    return {
      symbol,
      skipped: true,
      reason: `not-enough-new-candles (${newCandles.length}<${MIN_NEW_CANDLES})`,
      candlesAdded: newCandles.length,
      rulesAdded: 0,
      rulesDecayed: 0,
      rulesRemoved: 0,
      durationMs: Date.now() - start,
    };
  }

  if (Date.now() - start > BUDGET_MS) {
    return abortBudget(symbol, 'download-too-slow', start);
  }

  // Carica dataset persistito (vecchie candele)
  const persisted = (await redisGet<Record<string, OHLCV[]>>(KEY_DATASET(symbol))) ?? {};
  const oldCandles: OHLCV[] = Array.isArray(persisted['1h']) ? persisted['1h'] : [];
  const oldWindow = oldCandles.slice(-WINDOW_OLD_CANDLES);

  // Window di lavoro: vecchie + nuove (deduplicato per timestamp)
  const seen = new Set<string>();
  const windowCandles: OHLCV[] = [];
  for (const c of [...oldWindow, ...newCandles]) {
    if (seen.has(c.date)) continue;
    seen.add(c.date);
    windowCandles.push(c);
  }
  windowCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (Date.now() - start > BUDGET_MS) return abortBudget(symbol, 'window-build-too-slow', start);

  // Re-mining sulla finestra
  const contexts = analyzeAllCandles(windowCandles);
  if (contexts.length < 100) {
    return {
      symbol,
      skipped: true,
      reason: `window-too-small (${contexts.length})`,
      candlesAdded: newCandles.length,
      rulesAdded: 0,
      rulesDecayed: 0,
      rulesRemoved: 0,
      durationMs: Date.now() - start,
    };
  }

  if (Date.now() - start > BUDGET_MS) return abortBudget(symbol, 'analysis-too-slow', start);

  const rawRules = minePatterns(contexts);
  if (Date.now() - start > BUDGET_MS) return abortBudget(symbol, 'mining-too-slow', start);

  // Merge con decay
  const merged = mergeRulesIncremental(report.topRules ?? [], rawRules);

  // Update reaction zones — semplice: ricalcolo su window
  const newZones = computeReactionZonesSimple(windowCandles, contexts);

  // Aggiorna dataset persistito (cap 500)
  const newPersisted = { ...persisted, '1h': all1h.slice(-500) };
  await redisSet(KEY_DATASET(symbol), newPersisted);

  // Update report
  const updatedHistory: TrainingHistoryEntry[] = [
    ...(report.trainingHistory ?? []).slice(-19),
    {
      timestamp: Date.now(),
      version: (report.trainingHistory?.length ?? 0) + 1,
      mode: 'incremental' as const,
      candlesAdded: newCandles.length,
      rulesChanged: merged.added + merged.decayed + merged.removed,
    },
  ];

  const updatedReport: AnalyticReport = {
    ...report,
    generatedAt: Date.now(),
    datasetCoverage: {
      ...report.datasetCoverage,
      lastCandleTimestamp: new Date(all1h[all1h.length - 1].date).getTime(),
      candleCounts: { ...report.datasetCoverage.candleCounts, '1h': all1h.length },
      rangeEnd: new Date(all1h[all1h.length - 1].date).getTime(),
    },
    topRules: merged.rules,
    reactionZones: newZones.length > 0 ? newZones : report.reactionZones,
    trainingHistory: updatedHistory,
  };

  await redisSet(KEY_REPORT(symbol), updatedReport);

  // Update analytic state
  const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
  if (state) {
    state.lastIncrementalTrainAt = Date.now();
    await redisSet(KEY_STATE(symbol), state);
  }

  return {
    symbol,
    skipped: false,
    candlesAdded: newCandles.length,
    rulesAdded: merged.added,
    rulesDecayed: merged.decayed,
    rulesRemoved: merged.removed,
    durationMs: Date.now() - start,
  };
}

function abortBudget(symbol: string, reason: string, start: number): IncrementalResult {
  console.warn(`[incremental] ${symbol} abort: ${reason}`);
  // Schedule full retrain (best effort: lazy import to avoid cycle)
  void scheduleFullRetrain(symbol);
  return {
    symbol,
    skipped: true,
    reason: `budget-abort:${reason}`,
    candlesAdded: 0,
    rulesAdded: 0,
    rulesDecayed: 0,
    rulesRemoved: 0,
    durationMs: Date.now() - start,
  };
}

async function scheduleFullRetrain(symbol: string): Promise<void> {
  try {
    const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
    const { enqueue } = await import('./analytic-queue');
    await enqueue(symbol, state?.assetClass ?? 'crypto');
  } catch {
    /* best effort */
  }
}

/**
 * Merge incrementale: regole esistenti che restano valide mantengono il loro
 * peso, le nuove (id non visto prima) entrano col peso del miner, quelle non
 * più presenti nel mining attuale subiscono decay 0.9 sul confidence.
 * Se confidence < 30 → rimosso.
 */
export function mergeRulesIncremental(
  existing: MinedRule[],
  freshRaw: { id: string; conditions: string[]; direction: 'BUY' | 'SELL'; winRate: number; avgReturn: number; occurrences: number; wilson: number }[],
): { rules: MinedRule[]; added: number; decayed: number; removed: number } {
  const freshMap = new Map<string, (typeof freshRaw)[number]>();
  for (const r of freshRaw) freshMap.set(r.id, r);

  let added = 0;
  let decayed = 0;
  let removed = 0;
  const out: MinedRule[] = [];

  // Pass 1: regole esistenti
  for (const er of existing) {
    const fresh = freshMap.get(er.id);
    if (fresh) {
      // Aggiorna stats con nuovo mining ma mantieni dir/holding
      out.push({
        ...er,
        winRate: fresh.winRate,
        occurrences: fresh.occurrences,
        avgReturn: fresh.avgReturn,
        confidenceScore: Math.round(fresh.wilson),
      });
      freshMap.delete(er.id);
    } else {
      // Decay
      const newConf = Math.round(er.confidenceScore * 0.9);
      if (newConf >= 30) {
        out.push({ ...er, confidenceScore: newConf });
        decayed++;
      } else {
        removed++;
      }
    }
  }

  // Pass 2: regole nuove
  for (const fresh of freshMap.values()) {
    out.push({
      id: fresh.id,
      conditions: fresh.conditions,
      direction: fresh.direction === 'BUY' ? 'long' : 'short',
      occurrences: fresh.occurrences,
      winRate: fresh.winRate,
      avgReturn: fresh.avgReturn,
      avgWin: 0,
      avgLoss: 0,
      expectedHoldingMinutes: 24 * 60,
      confidenceScore: Math.round(fresh.wilson),
    });
    added++;
  }

  out.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return { rules: out.slice(0, 50), added, decayed, removed };
}

/** Reaction zones semplificate: mini-clustering degli swing point. */
function computeReactionZonesSimple(candles: OHLCV[], contexts: any[]): any[] {
  if (candles.length < 100) return [];
  // Quick swings detection
  const swings: { price: number; type: 'support' | 'resistance' }[] = [];
  for (let i = 5; i < candles.length - 5; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let k = -5; k <= 5; k++) {
      if (k === 0) continue;
      if (candles[i + k].high > c.high) isHigh = false;
      if (candles[i + k].low < c.low) isLow = false;
    }
    if (isHigh) swings.push({ price: c.high, type: 'resistance' });
    if (isLow) swings.push({ price: c.low, type: 'support' });
  }
  if (swings.length === 0) return [];

  swings.sort((a, b) => a.price - b.price);
  const clusters: { type: 'support' | 'resistance'; prices: number[] }[] = [];
  let cur: { type: 'support' | 'resistance'; prices: number[] } | null = null;
  for (const s of swings) {
    if (cur && cur.type === s.type && Math.abs(s.price - cur.prices[cur.prices.length - 1]) / s.price <= 0.003) {
      cur.prices.push(s.price);
    } else {
      if (cur && cur.prices.length >= 5) clusters.push(cur);
      cur = { type: s.type, prices: [s.price] };
    }
  }
  if (cur && cur.prices.length >= 5) clusters.push(cur);

  return clusters.slice(0, 30).map((cl) => ({
    priceLevel: Math.round((cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length) * 100) / 100,
    type: cl.type,
    strength: Math.min(100, cl.prices.length * 8),
    touchCount: cl.prices.length,
    bounceProbability: 0.5,
    breakoutProbability: 0.5,
    avgBounceMagnitude: 0,
    avgBreakoutMagnitude: 0,
    validUntil: Date.now() + 14 * 24 * 60 * 60 * 1000,
  }));
}

// ── scheduleAutoRetrain ──────────────────────────────────────

export interface AutoRetrainResult {
  scheduled: string | null;
  reason: string;
  inspected: number;
}

/**
 * Decide se accodare un retrain (full o incremental) per un symbol ready.
 * Max 1 enqueue per chiamata per non saturare la coda.
 */
export async function scheduleAutoRetrain(): Promise<AutoRetrainResult> {
  const symbols = await redisSMembers(KEY_LIST);
  let inspected = 0;
  for (const symbol of symbols) {
    inspected++;
    const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
    if (!state || state.status !== 'ready') continue;
    if (!state.lastTrainedAt) continue;

    const now = Date.now();
    // Full retrain dopo 7 giorni
    if (now - state.lastTrainedAt > FULL_RETRAIN_AFTER_MS) {
      const { enqueue } = await import('./analytic-queue');
      await enqueue(symbol, state.assetClass);
      return { scheduled: symbol, reason: 'full-7d', inspected };
    }
    // Regime cambiato ≥2h fa: incremental anticipato
    if (
      state.regimeChangedAt &&
      now - state.regimeChangedAt >= REGIME_CHANGE_TRIGGER_MS &&
      (!state.lastIncrementalTrainAt || state.lastIncrementalTrainAt < state.regimeChangedAt)
    ) {
      // Trigger incremental tramite chiave dedicata (non passa per la queue full)
      await markIncrementalRequested(symbol);
      return { scheduled: symbol, reason: 'regime-change', inspected };
    }
    // Incremental ogni 24h
    const lastIncr = state.lastIncrementalTrainAt ?? state.lastTrainedAt;
    if (now - lastIncr > INCREMENTAL_AFTER_MS) {
      await markIncrementalRequested(symbol);
      return { scheduled: symbol, reason: 'incr-24h', inspected };
    }
  }
  return { scheduled: null, reason: 'no-candidate', inspected };
}

const KEY_INCR_QUEUE = 'nexus:analytic:incr-queue';

async function markIncrementalRequested(symbol: string): Promise<void> {
  const { redisLPush, redisLRange } = await import('@/lib/db/redis');
  const items = await redisLRange(KEY_INCR_QUEUE, 0, -1);
  if (items.includes(symbol)) return;
  await redisLPush(KEY_INCR_QUEUE, symbol);
}

/** Pop & process del prossimo job incrementale (chiamato dal cron). */
export async function processNextIncremental(): Promise<IncrementalResult | null> {
  const { redisRPop } = await import('@/lib/db/redis');
  const symbol = await redisRPop(KEY_INCR_QUEUE);
  if (!symbol) return null;
  return runIncrementalTrain(symbol);
}
