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
}

export interface AnalyticReport {
  symbol: string;
  generatedAt: number;
  datasetCoverage: {
    timeframes: Array<'15m' | '1h' | '4h' | '1d'>;
    candleCounts: Record<string, number>;
    rangeStart: number;
    rangeEnd: number;
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

// ─── Mine ─────────────────────────────────────────────────────

export interface Mine {
  id: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  triggerPrice: number;
  triggerType: 'limit' | 'stop';
  quantity: number;
  notional: number;
  takeProfit: number;
  stopLoss: number;
  expectedRR: number;
  sourceRule: string;
  sourceZone: number | null;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'triggered' | 'expired' | 'cancelled' | 'closed_win' | 'closed_loss';
  brokerOrderId: string | null;
  brokerTpOrderId: string | null;
  brokerSlOrderId: string | null;
  closedAt: number | null;
  fillPrice: number | null;
  exitPrice: number | null;
  realizedPnl: number | null;
}

export interface MineCandidate {
  symbol: string;
  side: 'buy' | 'sell';
  triggerPrice: number;
  takeProfit: number;
  stopLoss: number;
  confidence: number;
  sourceRule: string;
  sourceZone: number | null;
  expectedRR: number;
}
