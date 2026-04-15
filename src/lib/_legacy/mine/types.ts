// ═══════════════════════════════════════════════════════════════
// Phase 4 + 6 — Mine Engine Types
//
// A Mine is a single trading operation with full lifecycle:
// waiting → pending → open → monitoring → closing → closed | cancelled | expired
// Phase 6 adds: waiting (limit order placed, not yet filled)
// ═══════════════════════════════════════════════════════════════

// ─── Enums ────────────────────────────────────────────────────

export type MineStatus =
  | 'waiting'     // Phase 6: limit order placed, awaiting fill within timeout
  | 'pending'     // order placed, awaiting fill (market order or limit being processed)
  | 'open'        // filled, actively monitored
  | 'closing'     // exit order placed, awaiting fill
  | 'closed'      // fully exited
  | 'cancelled'   // never filled or error
  | 'expired';    // Phase 6: limit order timed out without fill

export type MineOutcome =
  | 'tp_hit'
  | 'sl_hit'
  | 'timeout'
  | 'manual'
  | 'trailing_exit'
  | 'limit_expired';  // Phase 6: limit order expired without fill

export type StrategyType = 'reversion' | 'trend' | 'breakout';

export type AggressivenessProfile = 'conservative' | 'moderate' | 'aggressive';

export type SignalType =
  | 'zone_bounce'
  | 'trend_continuation'
  | 'breakout_confirm'
  | 'pattern_match';

// ─── Entry Signal ─────────────────────────────────────────────

export interface EntrySignal {
  type: SignalType;
  confidence: number;           // 0-1
  sourcePattern?: string;       // mined rule id
  sourceZone?: number;          // reaction zone price level
  newsSentiment?: number;       // avg sentiment from news digest
  macroClear: boolean;          // no high-impact event within 2h
}

// ─── Mine ─────────────────────────────────────────────────────

export interface Mine {
  id: string;
  symbol: string;
  status: MineStatus;

  // Strategy
  strategy: StrategyType;
  timeframe: string;
  direction: 'long' | 'short';

  // Entry
  entrySignal: EntrySignal;
  entryPrice: number | null;
  entryTime: number | null;         // epoch ms
  entryOrderId: string | null;

  // Exit targets (derived from analytics)
  takeProfit: number;
  stopLoss: number;
  trailingStopPct: number | null;   // activated after +X%
  timeoutHours: number;

  // Position sizing
  profile: AggressivenessProfile;
  allocatedCapital: number;         // $ allocated
  quantity: number;                 // asset qty

  // Monitoring (updated each tick)
  unrealizedPnl: number;
  maxUnrealizedPnl: number;        // high-water mark for trailing
  ticksMonitored: number;
  lastCheck: number;                // epoch ms

  // Exit
  exitPrice: number | null;
  exitTime: number | null;          // epoch ms
  exitOrderId: string | null;
  outcome: MineOutcome | null;
  realizedPnl: number | null;

  // Meta
  createdAt: number;                // epoch ms
  updatedAt: number;                // epoch ms
  notes: string[];                  // decision log

  // Phase 4.5 — AIC fields (optional for backward compat)
  aicSignal?: AICSignal;            // original signal from AIC
  aicSetupName?: string;            // for scorecard tracking
  aicConfidence?: number;           // original confidence before gates
  regimeAtEntry?: MarketRegime;     // regime when mine opened
  confluenceAtEntry?: number;       // confluence score when opened

  // Phase 6 — Limit order fields (optional for backward compat)
  entryOrderType?: 'market' | 'limit';   // order type used for entry
  limitPrice?: number | null;            // target limit price
  limitTimeoutMs?: number | null;        // timeout for limit order in ms
  limitCreatedAt?: number | null;        // when limit order was placed (epoch ms)
  evaluatorSource?: string;              // which evaluator strategy generated this
}

// ─── Capital Profile ──────────────────────────────────────────

export interface CapitalProfile {
  name: AggressivenessProfile;
  maxPortfolioRiskPct: number;        // % max equity at risk
  maxSingleMineRiskPct: number;       // % max equity per mine
  maxConcurrentMines: number;         // global
  maxMinesPerAsset: number;
  slMultiplier: number;               // applied to avg_loss
  tpMultiplier: number;               // applied to avg_win
  minConfidence: number;              // minimum signal confidence
  trailingStopActivationPct: number;  // activate trailing after +X%
  trailingStopDistancePct: number;    // trailing distance from max
  timeoutHours: number;               // max mine duration
}

// ─── Actions ──────────────────────────────────────────────────

export type MineAction =
  | { type: 'open_mine'; mine: Omit<Mine, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'close_mine'; mineId: string; reason: MineOutcome }
  | { type: 'adjust_sl'; mineId: string; newSl: number }
  | { type: 'no_action'; reason: string };

// ─── Detected Signal ──────────────────────────────────────────

export interface DetectedSignal {
  symbol: string;
  signal: EntrySignal;
  suggestedStrategy: StrategyType;
  suggestedTimeframe: string;
  suggestedDirection: 'long' | 'short';
  suggestedTp: number;
  suggestedSl: number;
  // Phase 6 — Limit order hints (optional)
  suggestedOrderType?: 'market' | 'limit';
  suggestedLimitPrice?: number;
  suggestedLimitTimeoutMs?: number;
  evaluatorSource?: string;
}

// ─── Portfolio Snapshot ───────────────────────────────────────

export interface PortfolioSnapshot {
  equity: number;
  buyingPower: number;
  totalAllocated: number;
  totalUnrealizedPnl: number;
  minesCount: number;
  updatedAt: number;
}

// ─── Trade Outcome (feedback loop) ───────────────────────────

export interface TradeOutcome {
  mineId: string;
  symbol: string;
  strategy: StrategyType;
  timeframe: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  outcome: MineOutcome;
  durationHours: number;
  entrySignal: EntrySignal;
  closedAt: number;
}

// ─── Engine State ─────────────────────────────────────────────

export interface MineEngineState {
  enabled: boolean;
  lastTick: number | null;
  lastError: string | null;
  activeMinesCount: number;
}

// ═══════════════════════════════════════════════════════════════
// Phase 6 — Continuous Evaluator types
// ═══════════════════════════════════════════════════════════════

export interface ContinuousEvaluation {
  symbol: string;
  updatedAt: number;
  shouldTrade: boolean;
  direction: 'long' | 'short' | null;
  confidence: number;             // 0-1
  suggestedEntry: number | null;  // limit price
  tp: number | null;
  sl: number | null;
  timeoutMs: number | null;       // limit order timeout
  orderType: 'market' | 'limit';
  strategy: StrategyType;
  timeframe: string;
  reasoning: string[];            // decision log
}

// ═══════════════════════════════════════════════════════════════
// Phase 6 — Asset Memory types
// ═══════════════════════════════════════════════════════════════

export interface AssetMemory {
  symbol: string;
  updatedAt: number;
  // Rolling window strategy performance
  strategyPerformance: Record<string, StrategyPerformanceEntry>;
  // Regime history (time spent in each regime)
  regimeHistory: RegimeHistoryEntry[];
  // Recent decisions (last 200)
  recentDecisions: DecisionEntry[];
  // Best performing conditions
  bestConditions: BestCondition[];
}

export interface StrategyPerformanceEntry {
  strategy: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  avgPnlPct: number;
  avgDurationHours: number;
  lastUpdated: number;
}

export interface RegimeHistoryEntry {
  regime: string;
  startedAt: number;
  endedAt: number | null;    // null = current
  durationMs: number;
}

export interface DecisionEntry {
  timestamp: number;
  direction: 'long' | 'short' | null;
  confidence: number;
  acted: boolean;            // did we open a mine?
  outcome?: MineOutcome;     // filled after mine closes
  pnlPct?: number;
  strategy: string;
}

export interface BestCondition {
  conditions: string[];      // indicator conditions that led to profit
  direction: 'long' | 'short';
  avgPnlPct: number;
  sampleSize: number;
}

// ═══════════════════════════════════════════════════════════════
// Phase 4.5 — AIC (Asset Intelligence Core) types
// ═══════════════════════════════════════════════════════════════

// ─── AIC Signal ───────────────────────────────────────────────

export interface AICSignal {
  action: 'LONG' | 'SHORT';
  entry: number;
  TP: number[];                 // [tp1, tp2, tp3]
  SL: number;
  timeout_minutes: number;
  confidence: number;           // 0-1
  'expected_profit_%': number;
  setup_name: string;           // e.g. "RSI_MACD_Volume_4h"
  expires_at?: string;
  // Enriched fields
  win_rate?: number;
  profit_factor?: number;
  sharpe?: number;
  avg_rr?: number;
  confluence_score?: number;
  confidence_original?: number;
  confidence_source?: string;
}

// ─── AIC Status ───────────────────────────────────────────────

export interface AICStatus {
  status: 'online' | 'offline';
  symbol: string;
  price: number;
  confluence: AICConfluence;
  regime?: string;
  regime_confidence?: number;
  active_tfs: string[];
  ts: string;
}

// ─── AIC Confluence ───────────────────────────────────────────

export interface AICConfluence {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;               // 0-1
  bull_score: number;
  bear_score: number;
  bullish_tfs: string[];
  bearish_tfs: string[];
  neutral_tfs: string[];
  aligned_count: number;
  tf_biases: Record<string, string>;
}

// ─── Market Regime ────────────────────────────────────────────

export type MarketRegime = 'BULL' | 'BEAR' | 'CHOP' | 'ACCUMULATION' | 'DISTRIBUTION';

// ─── AIC Research ─────────────────────────────────────────────

export interface AICResearch {
  funding_rate_current: number;
  funding_sentiment: 'LONG_CROWDED' | 'SHORT_CROWDED' | 'NEUTRAL';
  open_interest: number;
  fear_greed_index: number;
  fear_greed_label: string;
  news_sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  total_liquidations_24h_usd: number;
  ai_summary?: string;
}

// ─── Signal Scorecard ─────────────────────────────────────────

export interface SetupScorecard {
  setup_name: string;
  symbol: string;
  total_signals: number;
  total_executed: number;
  wins: number;
  losses: number;
  timeouts: number;
  real_win_rate: number;
  real_profit_factor: number;
  avg_pnl_pct: number;
  avg_confidence: number;
  confidence_accuracy: number;
  last_updated: string;
  last_10_outcomes: MineOutcome[];
}
