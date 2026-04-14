// ═══════════════════════════════════════════════════════════════
// AssetAnalytic — orchestratore reale per asset (Phase 2)
//
// Pipeline 5 fasi:
//   1. download   (0→25)   — scarica storico via deep-mapping/data-collector
//   2. analysis   (25→55)  — analyzeAllCandles → CandleContext[] su 1h
//   3. mining     (55→75)  — minePatterns
//   4. profiling  (75→90)  — reaction zones, indicator reactivity, strategy fit
//   5. finalize   (90→100) — salva report, scheduling, notifica
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import {
  redisGet,
  redisSet,
  redisDel,
  redisSAdd,
  redisSRem,
  redisLRem,
} from '@/lib/db/redis';
import type {
  AssetAnalytic as AssetAnalyticState,
  AssetClass,
  AnalyticReport,
  MinedRule as TypedMinedRule,
  ReactionZone,
  IndicatorReactivity,
  StrategyFit,
  EventReactivity,
} from './types';
import {
  downloadCompleteHistory,
  type DeepHistory,
} from '@/lib/research/deep-mapping/data-collector';
import {
  analyzeAllCandles,
  type CandleContext,
} from '@/lib/research/deep-mapping/candle-analyzer';
import {
  minePatterns,
  type MinedRule as RawMinedRule,
} from '@/lib/research/deep-mapping/pattern-miner';
import { computeIndicators } from '@/lib/core/indicators';
import { strategyMap } from '@/lib/analytics/cognition/strategies';
import { runMTFAnalysis } from '@/lib/analytics/perception/mtf-analysis';
import { runFullBacktest } from '@/lib/analytics/backtester';
import { runGeneticOptimizer } from '@/lib/analytics/optimizer';
import type { GAResult } from '@/lib/analytics/optimizer';
import type { BacktestSummary, BacktestStrategySummary } from './types';
import { notify } from '@/lib/analytics/action/notifications';
import { updateJobProgress } from './analytic-queue';

// ── Key builders ──────────────────────────────────────────

const KEY_STATE = (s: string) => `nexus:analytic:${s}`;
const KEY_DATASET = (s: string) => `nexus:analytic:dataset:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_LIVE = (s: string) => `nexus:analytic:live:${s}`;
// Phase 2 legacy ring buffer of MTF snapshots — NON è il LiveContext Phase 3.
// Vive su una chiave dedicata per non collidere con `nexus:analytic:live:{symbol}`
// (che ora ospita il LiveContext object scritto da live-observer.ts).
const KEY_LIVE_BUFFER = (s: string) => `nexus:analytic:live-buffer:${s}`;
const KEY_ZONES = (s: string) => `nexus:analytic:zones:${s}`;
const KEY_BACKTEST = (s: string) => `nexus:analytic:backtest:${s}`;
const KEY_LIST = 'nexus:analytic:list';
const KEY_QUEUE = 'nexus:analytic:queue';

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const PERSIST_CANDLES_PER_TF = 500; // tetto storage Redis
const LIVE_BUFFER_MAX = 100;
const OBSERVE_TIMEOUT_MS = 1500; // 200ms è troppo stretto per fetch reali — cap a 1.5s

type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';
const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

// ── AssetAnalytic class ───────────────────────────────────

export class AssetAnalytic {
  readonly symbol: string;
  readonly assetClass: AssetClass;

  constructor(symbol: string, assetClass: AssetClass) {
    this.symbol = symbol;
    this.assetClass = assetClass;
  }

  /** Pipeline completa: alias di runPipeline. */
  async train(): Promise<void> {
    await runTraining(this.symbol, this.assetClass, /* refresh */ false);
  }

  /** Refresh on-demand del report. Mantiene reportVersion ma incrementa. */
  async refresh(): Promise<void> {
    await runTraining(this.symbol, this.assetClass, /* refresh */ true);
  }

  /** Tick di osservazione live (chiamato dal cron, cap 1.5s). */
  async observeLive(): Promise<void> {
    await observeLiveImpl(this.symbol);
  }

  async getReport(): Promise<AnalyticReport | null> {
    return redisGet<AnalyticReport>(KEY_REPORT(this.symbol));
  }

  async getReactionZones(): Promise<ReactionZone[]> {
    const zones = await redisGet<ReactionZone[]>(KEY_ZONES(this.symbol));
    return Array.isArray(zones) ? zones : [];
  }

  async getStatus(): Promise<AssetAnalyticState | null> {
    return redisGet<AssetAnalyticState>(KEY_STATE(this.symbol));
  }

  async remove(): Promise<void> {
    // Phase 2: Strategy V2 non esiste ancora, quindi nessun check di
    // dipendenza. Phase 3 vieterà la rimozione se Strategy attive usano
    // questo symbol.
    await Promise.all([
      redisDel(KEY_STATE(this.symbol)),
      redisDel(`nexus:analytic:job:${this.symbol}`),
      redisDel(KEY_DATASET(this.symbol)),
      redisDel(KEY_REPORT(this.symbol)),
      redisDel(KEY_LIVE(this.symbol)),
      redisDel(KEY_LIVE_BUFFER(this.symbol)),
      redisDel(KEY_ZONES(this.symbol)),
      redisDel(KEY_BACKTEST(this.symbol)),
    ]);
    await redisSRem(KEY_LIST, this.symbol).catch(() => {});
    await redisLRem(KEY_QUEUE, 0, this.symbol).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────
// Pipeline implementation
// ─────────────────────────────────────────────────────────

async function runTraining(symbol: string, assetClass: AssetClass, refresh: boolean): Promise<void> {
  const state = (await redisGet<AssetAnalyticState>(KEY_STATE(symbol))) ?? {
    symbol,
    assetClass,
    status: 'queued',
    createdAt: Date.now(),
    lastTrainedAt: null,
    lastObservedAt: null,
    nextScheduledRefresh: null,
    trainingJobId: null,
    failureCount: 0,
    reportVersion: 0,
  };

  // Marca in training/refreshing
  state.status = refresh ? 'refreshing' : 'training';
  await redisSet(KEY_STATE(symbol), state);
  await redisSAdd(KEY_LIST, symbol);

  // ── Fase 1: download ────────────────────────────────────
  await updateJobProgress(symbol, 'download', 2, 'Avvio download storico…');
  let history: DeepHistory;
  try {
    history = await downloadCompleteHistory(symbol, (msg, pct) => {
      // pct va da 0 a 100 sull'intero step di download → mappa su 0..25%
      const overall = Math.round(pct * 0.25);
      void updateJobProgress(symbol, 'download', overall, `Download: ${msg}`);
    });
  } catch (e) {
    throw new Error(`Download fallito: ${(e as Error).message}`);
  }

  // Cap RAM: limits per timeframe based on data density
  // 5m:  1 year = ~105k candles → cap 50000 (~6 months)
  // 15m: 4 years = ~140k candles → cap 35000 (~1 year)
  // 1h:  4 years = ~35k candles → cap 17500 (~2 years)
  // 4h:  4 years = ~8700 candles → keep all
  // 1d:  4 years = ~1460 candles → keep all
  const TF_CAP: Record<string, number> = { '5m': 50000, '15m': 35000, '1h': 17500, '4h': 9000, '1d': 1500 };
  for (const tf of TIMEFRAMES) {
    const arr = history[tf];
    const cap = TF_CAP[tf] ?? 10000;
    if (Array.isArray(arr) && arr.length > cap) {
      history[tf] = arr.slice(-cap);
    }
  }
  const candleCounts: Record<string, number> = {};
  for (const tf of TIMEFRAMES) candleCounts[tf] = history[tf]?.length ?? 0;

  if ((history['1h']?.length ?? 0) < 100) {
    throw new Error(`Dati 1h insufficienti (${history['1h']?.length ?? 0}). Asset non supportato dal provider o limite raggiunto.`);
  }

  // Persisti dataset (cap a 500 per tf per stare leggeri su Redis)
  const persisted: Record<string, OHLCV[]> = {};
  for (const tf of TIMEFRAMES) {
    const arr = history[tf] ?? [];
    persisted[tf] = arr.slice(-PERSIST_CANDLES_PER_TF);
  }
  await redisSet(KEY_DATASET(symbol), persisted);
  await updateJobProgress(symbol, 'download', 25, `Download completato: ${candleCounts['1h']} candele 1h`);

  // ── Fase 2: analysis ────────────────────────────────────
  await updateJobProgress(symbol, 'analysis', 28, 'Analisi candele 1h in corso…');
  const contexts: CandleContext[] = analyzeAllCandles(history['1h'] ?? []);
  if (contexts.length < 100) {
    throw new Error(`Contesti analizzati insufficienti (${contexts.length}). Servono almeno 100 candele 1h con storico.`);
  }
  await updateJobProgress(symbol, 'analysis', 55, `${contexts.length} contesti analizzati`);

  // ── Fase 3: mining ──────────────────────────────────────
  await updateJobProgress(symbol, 'mining', 58, 'Pattern mining…');
  const rawRules: RawMinedRule[] = minePatterns(contexts);
  const topRules = mapRulesToReport(rawRules, contexts);
  await updateJobProgress(symbol, 'mining', 75, `${topRules.length} regole estratte`);

  // ── Fase 4: profiling ───────────────────────────────────
  await updateJobProgress(symbol, 'profiling', 78, 'Calcolo reaction zones…');
  const reactionZones = computeReactionZones(history['1h'] ?? [], contexts);

  await updateJobProgress(symbol, 'profiling', 82, 'Indicator reactivity…');
  const indicatorReactivity = computeIndicatorReactivity(contexts);

  await updateJobProgress(symbol, 'profiling', 85, 'Strategy fit + Full Backtest…');
  // Legacy strategy fit (kept for backward compat)
  const strategyFit = computeStrategyFit(history);

  // Phase 4.6: Full Backtester — realistic simulation on all strategies + mined rules
  let backtestSummary: BacktestSummary | undefined;
  try {
    await updateJobProgress(symbol, 'profiling', 86, 'Full backtest su tutte le strategie e TF…');
    const backtestHistory: Partial<Record<'5m' | '15m' | '1h' | '4h', typeof history['1h']>> = {
      '5m': history['5m'],
      '15m': history['15m'],
      '1h': history['1h'],
      '4h': history['4h'],
    };
    const fullReport = runFullBacktest(symbol, backtestHistory, rawRules);

    // Save report to Redis — strip equity curves to keep payload small (Upstash limit)
    const slimReport = {
      ...fullReport,
      results: fullReport.results.map(r => ({ ...r, equityCurve: [] })),
    };
    await redisSet(KEY_BACKTEST(symbol), slimReport);

    // Build lightweight summary for the AnalyticReport
    const rankings: BacktestStrategySummary[] = fullReport.results
      .filter(r => r.totalTrades >= 5)
      .slice(0, 20)
      .map((r, i) => ({
        rank: i + 1,
        strategyId: r.strategyId,
        strategyName: r.strategyName,
        timeframe: r.timeframe,
        isMineRule: r.isMineRule,
        conditions: r.conditions,
        totalTrades: r.totalTrades,
        winRate: r.winRate,
        profitFactor: r.profitFactor,
        netProfitPct: r.netProfitPct,
        maxDrawdownPct: r.maxDrawdownPct,
        sharpe: r.sharpe,
        avgTpDistancePct: r.avgTpDistancePct,
        avgSlDistancePct: r.avgSlDistancePct,
        tpHitRate: r.tpHitRate,
        slHitRate: r.slHitRate,
        avgHoldingHours: r.avgHoldingHours,
        optimalEntryTimeout: r.optimalEntryTimeout,
      }));

    backtestSummary = {
      generatedAt: fullReport.generatedAt,
      initialCapital: fullReport.config.initialCapital,
      tradeSize: fullReport.config.tradeSize,
      totalStrategiesTested: fullReport.globalStats.totalStrategiesTested,
      totalTradesSimulated: fullReport.globalStats.totalTradesSimulated,
      dateRange: fullReport.dateRange,
      rankings,
    };
    console.log(`[analytic] ${symbol}: Full backtest done — ${fullReport.globalStats.totalStrategiesTested} strategy-TF combos, ${fullReport.globalStats.totalTradesSimulated} trades simulated`);
  } catch (e) {
    console.warn(`[analytic] ${symbol}: Full backtest failed (non-fatal): ${(e as Error).message}`);
  }

  // Phase 5: Genetic Optimizer — discover optimal indicator combinations
  let gaResult: GAResult | undefined;
  try {
    await updateJobProgress(symbol, 'profiling', 88, 'Genetic Optimizer: scoperta strategie ottimali…');
    // Run GA on 1h data (most reliable timeframe for strategy discovery)
    const gaCandles = history['1h'] ?? [];
    if (gaCandles.length >= 200) {
      // Use only last 2000 candles for GA (RAM + speed constraint on 3.8GB droplet)
      const gaCandlesSliced = gaCandles.slice(-2000);
      gaResult = runGeneticOptimizer(gaCandlesSliced, {
        populationSize: 30,      // Reduced for droplet (was 60)
        generations: 50,         // Reduced (was 100)
        tournamentSize: 4,
        crossoverRate: 0.7,
        mutationRate: 0.15,
        eliteCount: 2,
        minTrades: 10,
        trainSplit: 0.7,
        fitnessWeights: { sharpe: 0.3, calmar: 0.2, profitFactor: 0.3, winRate: 0.2 },
      });

      // Add GA-discovered strategies to the backtest rankings
      if (backtestSummary && gaResult.topGenomes.length > 0) {
        const gaRankings: BacktestStrategySummary[] = gaResult.topGenomes
          .filter(g => g.totalTrades >= 10)
          .slice(0, 3)
          .map((g, i) => {
            const activeNames = Object.entries(g.indicators)
              .filter(([_, gene]) => (gene as any).active)
              .map(([name]) => name)
              .slice(0, 4);
            return {
              rank: 0, // will be re-ranked
              strategyId: `ga_${g.id}`,
              strategyName: `GA: ${activeNames.join(' + ')}`,
              timeframe: '1h',
              isMineRule: false,
              totalTrades: g.totalTrades,
              winRate: Math.round(g.winRate * 10) / 10,
              profitFactor: Math.round(g.profitFactor * 100) / 100,
              netProfitPct: Math.round(g.netProfitPct * 100) / 100,
              maxDrawdownPct: Math.round(g.maxDrawdownPct * 100) / 100,
              sharpe: Math.round(g.sharpe * 100) / 100,
              avgTpDistancePct: Math.round(g.tpAtrMultiplier * 100) / 100,
              avgSlDistancePct: Math.round(g.slAtrMultiplier * 100) / 100,
              tpHitRate: 0,
              slHitRate: 0,
              avgHoldingHours: 0,
              optimalEntryTimeout: 12,
            };
          });

        // Merge GA rankings into backtest rankings, re-sort by profitFactor
        const merged = [...backtestSummary.rankings, ...gaRankings]
          .sort((a, b) => b.profitFactor - a.profitFactor)
          .map((r, i) => ({ ...r, rank: i + 1 }));
        backtestSummary.rankings = merged.slice(0, 25);
        backtestSummary.totalStrategiesTested += gaRankings.length;
      }

      console.log(`[analytic] ${symbol}: GA done — best fitness ${gaResult.bestGenome.fitness.toFixed(3)}, WR ${gaResult.bestGenome.winRate.toFixed(1)}%, PF ${gaResult.bestGenome.profitFactor.toFixed(2)}, ${gaResult.generationsRun} gen, ${gaResult.elapsedMs}ms`);
    }
  } catch (e) {
    console.warn(`[analytic] ${symbol}: GA failed (non-fatal): ${(e as Error).message}`);
  }

  // Phase 6: Predictive Combination Discovery — 3 risk-tiered strategies
  let predictiveProfile: import('@/lib/analytics/predictive-discovery').PredictiveProfile | undefined;
  try {
    await updateJobProgress(symbol, 'profiling', 89, 'Scoperta combinazioni predittive (3 livelli di rischio)…');
    const { discoverPredictiveProfile } = await import('@/lib/analytics/predictive-discovery');
    predictiveProfile = discoverPredictiveProfile(contexts, symbol);
    console.log(`[analytic] ${symbol}: Predictive discovery done — prudent=${predictiveProfile.tiers.prudent.combinations.length} moderate=${predictiveProfile.tiers.moderate.combinations.length} aggressive=${predictiveProfile.tiers.aggressive.combinations.length} combos`);
  } catch (e) {
    console.warn(`[analytic] ${symbol}: Predictive discovery failed (non-fatal): ${(e as Error).message}`);
  }

  // Event reactivity: in Phase 2 placeholder
  const eventReactivity: EventReactivity[] = [];

  await updateJobProgress(symbol, 'profiling', 90, 'Profiling completato');

  // ── Fase 5: finalize ────────────────────────────────────
  const globalStats = computeGlobalStats(history, contexts);
  const recommendedTimeframe = pickRecommendedTimeframe(strategyFit);
  const recommendedOperationMode = mapTimeframeToMode(recommendedTimeframe);

  // Phase 3: preserva trainingHistory esistente (se refresh)
  const previousReport = refresh ? await redisGet<AnalyticReport>(KEY_REPORT(symbol)) : null;
  const trainingHistory = previousReport?.trainingHistory ?? [];
  const lastCandleTimestamp =
    history['1h'] && history['1h'].length > 0
      ? new Date(history['1h'][history['1h'].length - 1].date).getTime()
      : Date.now();

  const report: AnalyticReport = {
    symbol,
    generatedAt: Date.now(),
    datasetCoverage: {
      timeframes: TIMEFRAMES,
      candleCounts,
      rangeStart: firstDate(history),
      rangeEnd: lastDate(history),
      lastCandleTimestamp,
    },
    globalStats,
    topRules,
    reactionZones,
    indicatorReactivity,
    strategyFit,
    recommendedOperationMode,
    recommendedTimeframe,
    eventReactivity,
    backtestSummary,
    predictiveProfile,
    // Carry-over Phase 3 fields se presenti
    liveContext: previousReport?.liveContext,
    newsDigest: previousReport?.newsDigest,
    eventImpacts: previousReport?.eventImpacts,
    feedback: previousReport?.feedback,
    trainingHistory: [
      ...trainingHistory.slice(-19),
      {
        timestamp: Date.now(),
        version: (state.reportVersion ?? 0) + 1,
        mode: 'full' as const,
        candlesAdded: candleCounts['1h'] ?? 0,
        rulesChanged: topRules.length,
      },
    ],
  };

  await redisSet(KEY_REPORT(symbol), report);
  await redisSet(KEY_ZONES(symbol), reactionZones);

  const updatedState: AssetAnalyticState = {
    ...state,
    status: 'ready',
    lastTrainedAt: Date.now(),
    nextScheduledRefresh: Date.now() + REFRESH_INTERVAL_MS,
    reportVersion: (state.reportVersion ?? 0) + 1,
    failureCount: 0,
  };
  await redisSet(KEY_STATE(symbol), updatedState);
  await updateJobProgress(symbol, 'done', 100, 'Training completato');

  // Notifica (best effort)
  try {
    await notify(
      'bot',
      `AI Analytic ${symbol} pronta`,
      `${candleCounts['1h']} candele 1h, ${topRules.length} regole, ${reactionZones.length} reaction zones, miglior TF: ${recommendedTimeframe}.`,
    );
  } catch {
    /* fail-safe: non bloccare se Redis notif scrive male */
  }
}

// ─────────────────────────────────────────────────────────
// Live observation
// ─────────────────────────────────────────────────────────

async function observeLiveImpl(symbol: string): Promise<void> {
  const start = Date.now();
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('observeLive timeout')), OBSERVE_TIMEOUT_MS),
  );

  try {
    await Promise.race([doObserve(symbol, start), timeout]);
  } catch (e) {
    console.warn(`[analytic] observeLive ${symbol}: ${(e as Error).message}`);
  }
}

async function doObserve(symbol: string, start: number): Promise<void> {
  // Best-effort MTF snapshot. Se runMTFAnalysis fallisce o impiega troppo,
  // saltiamo il calcolo e aggiorniamo solo lastObservedAt.
  let mtfRegime = 'UNKNOWN';
  let mtfAlignment: string | null = null;
  try {
    const mtf = await runMTFAnalysis(symbol);
    mtfRegime = (mtf as any)?.regime ?? mtfRegime;
    mtfAlignment = (mtf as any)?.alignment ?? null;
  } catch {
    /* ignore — il provider potrebbe essere irraggiungibile */
  }

  // Aggiorna ring buffer legacy MTF snapshots su chiave dedicata (Phase 2).
  // Defensive: se per qualsiasi motivo il valore esistente non è un array
  // (es. shape Phase 3 LiveContext), riparte da array vuoto.
  const existing = await redisGet<unknown>(KEY_LIVE_BUFFER(symbol));
  const buf: Array<{ ts: number; regime: string; alignment: string | null }> =
    Array.isArray(existing) ? (existing as any[]) : [];
  buf.push({ ts: Date.now(), regime: mtfRegime, alignment: mtfAlignment });
  while (buf.length > LIVE_BUFFER_MAX) buf.shift();
  await redisSet(KEY_LIVE_BUFFER(symbol), buf);

  // Aggiorna lastObservedAt nello state
  const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
  if (state) {
    state.lastObservedAt = Date.now();
    await redisSet(KEY_STATE(symbol), state);
  }

  const elapsed = Date.now() - start;
  if (elapsed > 1000) console.log(`[analytic] observeLive ${symbol} elapsed ${elapsed}ms`);
}

// ─────────────────────────────────────────────────────────
// Bridge for analytic-queue.processNext
// ─────────────────────────────────────────────────────────

export async function runPipeline(symbol: string): Promise<void> {
  const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
  if (!state) throw new Error(`Stato AI Analytic mancante per ${symbol}`);
  const analytic = new AssetAnalytic(symbol, state.assetClass);
  const isRefresh = state.status === 'refreshing' || (state.lastTrainedAt !== null && state.reportVersion > 0);
  if (isRefresh) {
    await analytic.refresh();
  } else {
    await analytic.train();
  }
}

// ─────────────────────────────────────────────────────────
// Helpers — mapping & profiling
// ─────────────────────────────────────────────────────────

/** Calcola avgWin/avgLoss per ogni regola scansionando i contesti che la matchano. */
function mapRulesToReport(rawRules: RawMinedRule[], contexts: CandleContext[]): TypedMinedRule[] {
  const conditionMap = buildConditionMap();
  const out: TypedMinedRule[] = [];

  for (const r of rawRules) {
    const tests = r.conditions.map((c) => conditionMap.get(c)).filter(Boolean) as ((c: CandleContext) => boolean)[];
    if (tests.length === 0) continue;

    let wins = 0;
    let losses = 0;
    let sumWin = 0;
    let sumLoss = 0;
    let occ = 0;
    for (const ctx of contexts) {
      if (ctx.futureRet24h === null) continue;
      let match = true;
      for (const t of tests) {
        if (!t(ctx)) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      occ++;
      if (ctx.futureRet24h >= 0) {
        wins++;
        sumWin += ctx.futureRet24h;
      } else {
        losses++;
        sumLoss += Math.abs(ctx.futureRet24h);
      }
    }

    const avgWin = wins > 0 ? sumWin / wins : 0;
    const avgLoss = losses > 0 ? sumLoss / losses : 0;
    const direction: 'long' | 'short' = r.direction === 'BUY' ? 'long' : 'short';

    out.push({
      id: r.id,
      conditions: r.conditions,
      direction,
      occurrences: occ,
      winRate: r.winRate,
      avgReturn: r.avgReturn,
      avgWin: round4(avgWin * 100),
      avgLoss: round4(avgLoss * 100),
      expectedHoldingMinutes: 24 * 60, // ground truth è 24h-forward
      confidenceScore: Math.round(r.wilson),
    });
  }

  return out;
}

function buildConditionMap(): Map<string, (c: CandleContext) => boolean> {
  const m = new Map<string, (c: CandleContext) => boolean>();
  m.set('RSI<30', (c) => c.rsi14 < 30);
  m.set('RSI<40', (c) => c.rsi14 < 40);
  m.set('RSI>60', (c) => c.rsi14 > 60);
  m.set('RSI>70', (c) => c.rsi14 > 70);
  m.set('BB=BELOW_LOWER', (c) => c.bbPosition === 'BELOW_LOWER');
  m.set('BB=AT_LOWER', (c) => c.bbPosition === 'AT_LOWER');
  m.set('BB=LOWER_HALF', (c) => c.bbPosition === 'LOWER_HALF');
  m.set('BB=AT_UPPER', (c) => c.bbPosition === 'AT_UPPER');
  m.set('BB=ABOVE_UPPER', (c) => c.bbPosition === 'ABOVE_UPPER');
  m.set('MACD=CROSS_UP', (c) => c.macdSignal === 'CROSS_UP');
  m.set('MACD=CROSS_DOWN', (c) => c.macdSignal === 'CROSS_DOWN');
  m.set('MACD=ABOVE', (c) => c.macdSignal === 'ABOVE');
  m.set('MACD=BELOW', (c) => c.macdSignal === 'BELOW');
  m.set('TREND_S=UP', (c) => c.trendShort === 'UP' || c.trendShort === 'STRONG_UP');
  m.set('TREND_S=DOWN', (c) => c.trendShort === 'DOWN' || c.trendShort === 'STRONG_DOWN');
  m.set('TREND_M=UP', (c) => c.trendMedium === 'UP' || c.trendMedium === 'STRONG_UP');
  m.set('TREND_M=DOWN', (c) => c.trendMedium === 'DOWN' || c.trendMedium === 'STRONG_DOWN');
  m.set('TREND_L=UP', (c) => c.trendLong === 'UP' || c.trendLong === 'STRONG_UP');
  m.set('TREND_L=DOWN', (c) => c.trendLong === 'DOWN' || c.trendLong === 'STRONG_DOWN');
  m.set('ADX>25', (c) => c.adx14 > 25);
  m.set('ADX<15', (c) => c.adx14 < 15);
  m.set('VOL=CLIMAX', (c) => c.volumeProfile === 'CLIMAX');
  m.set('VOL=HIGH', (c) => c.volumeProfile === 'HIGH');
  m.set('VOL=DRY', (c) => c.volumeProfile === 'DRY');
  m.set('STOCH<20', (c) => c.stochK < 20);
  m.set('STOCH>80', (c) => c.stochK > 80);
  m.set('REGIME=TREND_UP', (c) => c.regime === 'TRENDING_UP');
  m.set('REGIME=TREND_DN', (c) => c.regime === 'TRENDING_DOWN');
  m.set('REGIME=RANGING', (c) => c.regime === 'RANGING');
  m.set('REGIME=VOLATILE', (c) => c.regime === 'VOLATILE');
  return m;
}

/**
 * Reaction zones: clustering semplice di livelli di prezzo dove gli swing
 * (high/low) si concentrano. Bucket di 0.3% l'uno dall'altro.
 */
function computeReactionZones(candles1h: OHLCV[], contexts: CandleContext[]): ReactionZone[] {
  if (candles1h.length < 100) return [];

  // Identifica swing high/low locali (window 5)
  const swings: { price: number; type: 'high' | 'low'; index: number }[] = [];
  for (let i = 5; i < candles1h.length - 5; i++) {
    const c = candles1h[i];
    let isHigh = true;
    let isLow = true;
    for (let k = -5; k <= 5; k++) {
      if (k === 0) continue;
      if (candles1h[i + k].high > c.high) isHigh = false;
      if (candles1h[i + k].low < c.low) isLow = false;
    }
    if (isHigh) swings.push({ price: c.high, type: 'high', index: i });
    if (isLow) swings.push({ price: c.low, type: 'low', index: i });
  }
  if (swings.length === 0) return [];

  // Bucketing: raggruppa per livelli vicini (≤0.3%)
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: { type: 'support' | 'resistance'; prices: number[]; indices: number[] }[] = [];
  let cur: { type: 'support' | 'resistance'; prices: number[]; indices: number[] } | null = null;
  for (const s of sorted) {
    const t: 'support' | 'resistance' = s.type === 'low' ? 'support' : 'resistance';
    if (cur && Math.abs(s.price - cur.prices[cur.prices.length - 1]) / s.price <= 0.003 && cur.type === t) {
      cur.prices.push(s.price);
      cur.indices.push(s.index);
    } else {
      if (cur && cur.prices.length >= 5) clusters.push(cur);
      cur = { type: t, prices: [s.price], indices: [s.index] };
    }
  }
  if (cur && cur.prices.length >= 5) clusters.push(cur);

  // Per ogni cluster calcola P(bounce)/P(breakout) dal ground truth dei contesti
  // entro ±0.5% dal livello medio del cluster.
  const ctxByIndex = new Map<number, CandleContext>();
  for (const ctx of contexts) ctxByIndex.set(ctx.index, ctx);

  const zones: ReactionZone[] = [];
  for (const cl of clusters) {
    const avg = cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length;
    let bounces = 0;
    let breakouts = 0;
    let bounceMag = 0;
    let breakoutMag = 0;
    let total = 0;
    for (const idx of cl.indices) {
      const ctx = ctxByIndex.get(idx);
      if (!ctx || ctx.futureRet24h === null) continue;
      total++;
      const ret = ctx.futureRet24h;
      const isBounce = cl.type === 'support' ? ret > 0 : ret < 0;
      if (isBounce) {
        bounces++;
        bounceMag += Math.abs(ret);
      } else {
        breakouts++;
        breakoutMag += Math.abs(ret);
      }
    }
    if (total === 0) continue;
    zones.push({
      priceLevel: round4(avg),
      type: cl.type,
      strength: Math.min(100, cl.prices.length * 8),
      touchCount: cl.prices.length,
      bounceProbability: round4(bounces / total),
      breakoutProbability: round4(breakouts / total),
      avgBounceMagnitude: round4((bounces > 0 ? bounceMag / bounces : 0) * 100),
      avgBreakoutMagnitude: round4((breakouts > 0 ? breakoutMag / breakouts : 0) * 100),
      validUntil: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14 giorni
    });
  }

  // Filtra zone troppo lontane dal prezzo corrente (>15%)
  const lastPrice = candles1h[candles1h.length - 1]?.close;
  const maxDist = 0.15;
  const relevant = lastPrice && lastPrice > 0
    ? zones.filter((z) => Math.abs(z.priceLevel - lastPrice) / lastPrice <= maxDist)
    : zones;

  // Top 30 per touchCount
  relevant.sort((a, b) => b.touchCount - a.touchCount);
  return relevant.slice(0, 30);
}

/** Indicator reactivity: per ogni indicatore principale, performance dei suoi segnali. */
function computeIndicatorReactivity(contexts: CandleContext[]): Record<string, IndicatorReactivity> {
  const out: Record<string, IndicatorReactivity> = {};

  function track(name: string, predicate: (c: CandleContext) => boolean) {
    let count = 0;
    let wins = 0;
    let sumRet = 0;
    for (const ctx of contexts) {
      if (ctx.futureRet24h === null) continue;
      if (!predicate(ctx)) continue;
      count++;
      sumRet += ctx.futureRet24h;
      if (ctx.futureRet24h > 0) wins++;
    }
    if (count < 10) return;
    out[name] = {
      indicatorName: name,
      signalCount: count,
      winRate: Math.round((wins / count) * 100),
      avgReturn: round4((sumRet / count) * 100),
      bestParams: {},
    };
  }

  track('RSI_oversold', (c) => c.rsi14 < 30);
  track('RSI_overbought', (c) => c.rsi14 > 70);
  track('BB_lower', (c) => c.bbPosition === 'BELOW_LOWER' || c.bbPosition === 'AT_LOWER');
  track('BB_upper', (c) => c.bbPosition === 'AT_UPPER' || c.bbPosition === 'ABOVE_UPPER');
  track('MACD_cross_up', (c) => c.macdSignal === 'CROSS_UP');
  track('MACD_cross_down', (c) => c.macdSignal === 'CROSS_DOWN');
  track('Stoch_oversold', (c) => c.stochK < 20);
  track('Stoch_overbought', (c) => c.stochK > 80);
  track('ADX_trend', (c) => c.adx14 > 25);

  return out;
}

/**
 * Strategy fit: mini-backtest 'reversion', 'trend', 'breakout' su ogni timeframe.
 * Cap: 500 candele per timeframe per restare nei limiti.
 */
function computeStrategyFit(history: DeepHistory): StrategyFit[] {
  const out: StrategyFit[] = [];
  const stratKeys = ['reversion', 'trend', 'breakout'] as const;

  for (const tf of TIMEFRAMES) {
    const candles = (history[tf] ?? []).slice(-500);
    if (candles.length < 100) continue;
    const ind = computeIndicators(candles);

    for (const key of stratKeys) {
      const strategy = strategyMap[key];
      if (!strategy) continue;
      const result = miniBacktest(strategy, candles, ind);
      if (!result) continue;
      out.push({
        strategyName: key,
        timeframe: tf,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        avgReturn: result.avgReturn,
        profitFactor: result.profitFactor,
        sharpe: result.sharpe,
        maxDrawdown: result.maxDrawdown,
        rank: 0, // riempito sotto
      });
    }
  }

  // Ranking per profit factor (desc)
  out.sort((a, b) => b.profitFactor - a.profitFactor);
  out.forEach((f, i) => (f.rank = i + 1));

  return out;
}

interface MiniBacktestResult {
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
}

function miniBacktest(strategy: any, candles: OHLCV[], ind: any): MiniBacktestResult | null {
  const trades: number[] = [];
  let openSide: 'LONG' | 'SHORT' | null = null;
  let openPrice = 0;
  let openIdx = 0;
  const equity: number[] = [1];

  for (let i = 50; i < candles.length; i++) {
    const close = candles[i].close;

    if (openSide) {
      // Exit dopo 24 candele o su opposite signal
      const decision = strategy.shouldEnter(candles, ind, i);
      const flipped = decision.enter && decision.side !== openSide;
      const expired = i - openIdx >= 24;
      if (flipped || expired) {
        const ret = openSide === 'LONG' ? (close - openPrice) / openPrice : (openPrice - close) / openPrice;
        trades.push(ret);
        equity.push(equity[equity.length - 1] * (1 + ret));
        openSide = null;
      }
    }

    if (!openSide) {
      const decision = strategy.shouldEnter(candles, ind, i);
      if (decision.enter) {
        openSide = decision.side;
        openPrice = close;
        openIdx = i;
      }
    }
  }

  if (trades.length === 0) {
    return { totalTrades: 0, winRate: 0, avgReturn: 0, profitFactor: 0, sharpe: 0, maxDrawdown: 0 };
  }

  const wins = trades.filter((t) => t > 0);
  const losses = trades.filter((t) => t <= 0);
  const sumWin = wins.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? 99 : 0;
  const winRate = (wins.length / trades.length) * 100;
  const avgReturn = (trades.reduce((a, b) => a + b, 0) / trades.length) * 100;
  const stdDev = Math.sqrt(trades.reduce((a, t) => a + Math.pow(t - avgReturn / 100, 2), 0) / trades.length);
  const sharpe = stdDev > 0 ? (avgReturn / 100 / stdDev) * Math.sqrt(trades.length) : 0;

  // Max drawdown sull'equity curve
  let peak = equity[0];
  let maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length,
    winRate: round2(winRate),
    avgReturn: round4(avgReturn),
    profitFactor: round2(profitFactor),
    sharpe: round2(sharpe),
    maxDrawdown: round4(maxDD * 100),
  };
}

function computeGlobalStats(history: DeepHistory, contexts: CandleContext[]) {
  const avgReturnPerCandle: Record<string, number> = {};
  const volatility: Record<string, number> = {};
  for (const tf of TIMEFRAMES) {
    const arr = history[tf] ?? [];
    if (arr.length < 2) continue;
    const rets: number[] = [];
    for (let i = 1; i < arr.length; i++) {
      rets.push((arr[i].close - arr[i - 1].close) / arr[i - 1].close);
    }
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, r) => a + Math.pow(r - avg, 2), 0) / rets.length;
    avgReturnPerCandle[tf] = round4(avg * 100);
    volatility[tf] = round4(Math.sqrt(variance) * 100);
  }

  // max gain/loss su 24h forward dei contesti
  let maxGain = 0;
  let maxLoss = 0;
  for (const ctx of contexts) {
    if (ctx.futureMaxUp24h !== null && ctx.futureMaxUp24h > maxGain) maxGain = ctx.futureMaxUp24h;
    if (ctx.futureMaxDown24h !== null && ctx.futureMaxDown24h < maxLoss) maxLoss = ctx.futureMaxDown24h;
  }

  // Best regime: dove l'avg return forward 24h è massimo (per long) e minimo (per short)
  const byRegime: Record<string, { sum: number; n: number }> = {};
  for (const ctx of contexts) {
    if (ctx.futureRet24h === null) continue;
    const r = byRegime[ctx.regime] ?? { sum: 0, n: 0 };
    r.sum += ctx.futureRet24h;
    r.n++;
    byRegime[ctx.regime] = r;
  }
  let bestLong = 'RANGING';
  let bestShort = 'RANGING';
  let bestLongAvg = -Infinity;
  let bestShortAvg = Infinity;
  for (const [reg, v] of Object.entries(byRegime)) {
    if (v.n < 5) continue;
    const a = v.sum / v.n;
    if (a > bestLongAvg) {
      bestLongAvg = a;
      bestLong = reg;
    }
    if (a < bestShortAvg) {
      bestShortAvg = a;
      bestShort = reg;
    }
  }

  return {
    avgReturnPerCandle,
    volatility,
    maxGainObserved: round4(maxGain * 100),
    maxLossObserved: round4(maxLoss * 100),
    bestRegimeForLong: bestLong,
    bestRegimeForShort: bestShort,
  };
}

function pickRecommendedTimeframe(fits: StrategyFit[]): '15m' | '1h' | '4h' | '1d' {
  if (fits.length === 0) return '1h';
  // best fit per profit factor sopra 1.0
  const positive = fits.filter((f) => f.profitFactor >= 1 && f.totalTrades >= 5);
  if (positive.length === 0) return '1h';
  positive.sort((a, b) => b.profitFactor - a.profitFactor);
  return (positive[0].timeframe as any) ?? '1h';
}

function mapTimeframeToMode(tf: '15m' | '1h' | '4h' | '1d'): 'scalp' | 'intraday' | 'daily' | 'swing' {
  switch (tf) {
    case '15m':
      return 'scalp';
    case '1h':
      return 'intraday';
    case '4h':
      return 'daily';
    case '1d':
      return 'swing';
  }
}

function firstDate(history: DeepHistory): number {
  let min = Infinity;
  for (const tf of TIMEFRAMES) {
    const a = history[tf]?.[0]?.date;
    if (a) {
      const t = new Date(a).getTime();
      if (t < min) min = t;
    }
  }
  return min === Infinity ? Date.now() : min;
}

function lastDate(history: DeepHistory): number {
  let max = 0;
  for (const tf of TIMEFRAMES) {
    const arr = history[tf];
    const a = arr?.[arr.length - 1]?.date;
    if (a) {
      const t = new Date(a).getTime();
      if (t > max) max = t;
    }
  }
  return max || Date.now();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
