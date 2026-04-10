// ═══════════════════════════════════════════════════════════════
// Nexus Pro — analytics shared TypeScript types
// Source of truth: docs/architecture/ai-analytic.md + strategy-v2.md
// ═══════════════════════════════════════════════════════════════

// ─── AI Analytic ──────────────────────────────────────────────

export type AnalyticStatus =
  | 'unassigned'
  | 'queued'
  | 'training'
  | 'ready'
  | 'refreshing'
  | 'failed';

export type AssetClass = 'crypto' | 'us_stock' | 'us_etf' | 'forex';

export interface AssetAnalytic {
  symbol: string;
  assetClass: AssetClass;
  status: AnalyticStatus;
  createdAt: number;
  lastTrainedAt: number | null;
  lastObservedAt: number | null;
  nextScheduledRefresh: number | null;
  trainingJobId: string | null;
  failureCount: number;
  reportVersion: number;

  // Phase 3 — Living Brain (tutti opzionali per retrocompat)
  lastIncrementalTrainAt?: number | null;
  lastLiveContextAt?: number | null;
  lastNewsFetchAt?: number | null;
  currentRegime?: string | null;
  regimeChangedAt?: number | null;
}

export interface AnalyticReport {
  symbol: string;
  generatedAt: number;
  datasetCoverage: {
    timeframes: Array<'15m' | '1h' | '4h' | '1d'>;
    candleCounts: Record<string, number>;
    rangeStart: number;
    rangeEnd: number;
    /** Phase 3: ultimo timestamp candela 1h del dataset (per incremental trainer). */
    lastCandleTimestamp?: number;
  };
  globalStats: {
    avgReturnPerCandle: Record<string, number>;
    volatility: Record<string, number>;
    maxGainObserved: number;
    maxLossObserved: number;
    bestRegimeForLong: string;
    bestRegimeForShort: string;
  };
  topRules: MinedRule[];
  reactionZones: ReactionZone[];
  indicatorReactivity: Record<string, IndicatorReactivity>;
  strategyFit: StrategyFit[];
  recommendedOperationMode: 'scalp' | 'intraday' | 'daily' | 'swing';
  recommendedTimeframe: '15m' | '1h' | '4h' | '1d';
  eventReactivity: EventReactivity[];

  // Phase 4.6 — Full Backtest summary (top 5 ranked strategies)
  backtestSummary?: BacktestSummary;

  // Phase 3 — Living Brain (tutti opzionali per retrocompat)
  liveContext?: LiveContext;
  newsDigest?: NewsDigest;
  eventImpacts?: EventImpactStat[];
  feedback?: FeedbackStats;
  trainingHistory?: TrainingHistoryEntry[];
}

export interface BacktestStrategySummary {
  rank: number;
  strategyId: string;
  strategyName: string;
  timeframe: string;
  isMineRule: boolean;
  conditions?: string[];
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  netProfitPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  avgTpDistancePct: number;
  avgSlDistancePct: number;
  tpHitRate: number;
  slHitRate: number;
  avgHoldingHours: number;
  optimalEntryTimeout: number;
}

export interface BacktestSummary {
  generatedAt: number;
  initialCapital: number;
  tradeSize: number;
  totalStrategiesTested: number;
  totalTradesSimulated: number;
  dateRange: { start: string; end: string };
  /** Top strategies sorted by composite score */
  rankings: BacktestStrategySummary[];
}

// ─── Phase 3: Living Brain types ──────────────────────────────

export interface LiveContext {
  updatedAt: number;
  price: number;
  regime: string;
  activeRules: Array<{
    ruleId: string;
    matched: boolean;
    directionBias: 'long' | 'short' | 'neutral';
    confidence: number;
  }>;
  nearestZones: Array<{
    level: number;
    type: 'support' | 'resistance';
    distancePct: number;
    pBounce: number;
  }>;
  momentumScore: number; // -1..+1
  volatilityPercentile: number; // 0..100
  // Snapshot indicatori utili per UI / debug (opzionale)
  indicators?: {
    rsi: number;
    macdHistogram: number;
    bbPosition: string;
    adx: number;
    stochK: number;
    atr: number;
  };
}

export interface NewsItem {
  id: string;
  source: string;
  publishedAt: number;
  title: string;
  url: string;
  sentiment: number; // -1..+1
  relevance: number; // 0..1
  keywords: string[];
}

export interface NewsDigest {
  symbol: string;
  window: '24h';
  updatedAt: number;
  count: number;
  avgSentiment: number;
  topItems: NewsItem[]; // max 10
  sentimentDelta24h: number; // delta vs previous window
}

export interface MacroEvent {
  id: string;
  name: string;
  country: string;
  scheduledAt: number;
  importance: 'low' | 'medium' | 'high';
  actual: number | null;
  forecast: number | null;
  previous: number | null;
}

export interface EventImpactStat {
  eventName: string;
  direction: 'up' | 'down' | 'mixed';
  avgReturn24h: number;
  winRate: number;
  sampleSize: number;
}

export interface FeedbackStats {
  totalTrades: number;
  wins: number;
  losses: number;
  ruleScores: Record<string, { weight: number; trades: number; wr: number }>; // peso 0.5..2.0
  lastUpdated: number;
}

export interface TrainingHistoryEntry {
  timestamp: number;
  version: number;
  mode: 'full' | 'incremental';
  candlesAdded: number;
  rulesChanged: number;
}

export interface MinedRule {
  id: string;
  conditions: string[];
  direction: 'long' | 'short';
  occurrences: number;
  winRate: number;
  avgReturn: number;
  avgWin: number;
  avgLoss: number;
  expectedHoldingMinutes: number;
  confidenceScore: number;
}

export interface ReactionZone {
  priceLevel: number;
  type: 'support' | 'resistance';
  strength: number;
  touchCount: number;
  bounceProbability: number;
  breakoutProbability: number;
  avgBounceMagnitude: number;
  avgBreakoutMagnitude: number;
  validUntil: number;
}

export interface IndicatorReactivity {
  indicatorName: string;
  signalCount: number;
  winRate: number;
  avgReturn: number;
  bestParams: Record<string, number>;
}

export interface StrategyFit {
  strategyName: string;
  timeframe: string;
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  rank: number;
}

export interface EventReactivity {
  eventType: 'FOMC' | 'CPI' | 'NFP' | 'EARNINGS' | 'OTHER';
  observations: number;
  avgMoveBefore: number;
  avgMoveAfter: number;
  bestPlaybook: 'long_before' | 'short_before' | 'long_after' | 'short_after' | 'avoid';
}

// ─── Training job ─────────────────────────────────────────────

export type JobPhase = 'queued' | 'download' | 'analysis' | 'mining' | 'profiling' | 'finalize' | 'done' | 'error';

export interface JobStatus {
  jobId: string;
  symbol: string;
  phase: JobPhase;
  progress: number;
  message: string;
  startedAt: number;
  etaSeconds: number;
}

// ─── Strategy V2 ──────────────────────────────────────────────

export type AggressivenessLevel = 'conservative' | 'balanced' | 'aggressive';

export type StrategyStatus = 'draft' | 'running' | 'paused' | 'stopped' | 'error';

export interface StrategyV2 {
  id: string;
  name: string;
  ownerId: string;
  mode: 'demo' | 'real';
  status: StrategyStatus;
  capitalAllocation: {
    type: 'percent' | 'fixed';
    value: number;
  };
  symbols: string[];
  aggressiveness: AggressivenessLevel;
  createdAt: number;
  startedAt: number | null;
  lastTickAt: number | null;
  activeMines: string[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  currentEquity: number;
}

// ─── Mine (Phase 4 — re-exported from src/lib/mine/types.ts) ─
export type {
  Mine,
  MineStatus,
  MineOutcome,
  EntrySignal,
  StrategyType,
  AggressivenessProfile,
  DetectedSignal,
  PortfolioSnapshot,
  TradeOutcome,
  MineEngineState,
  AICSignal,
  AICStatus,
  AICConfluence,
  AICResearch,
  MarketRegime,
  SetupScorecard,
} from '@/lib/mine/types';
