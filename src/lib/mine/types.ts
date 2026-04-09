// ═══════════════════════════════════════════════════════════════
// Phase 4 — Mine Engine Types
//
// A Mine is a single trading operation with full lifecycle:
// pending → open → monitoring → closing → closed | cancelled
// ═══════════════════════════════════════════════════════════════

// ─── Enums ────────────────────────────────────────────────────

export type MineStatus =
  | 'pending'     // order placed, awaiting fill
  | 'open'        // filled, actively monitored
  | 'closing'     // exit order placed, awaiting fill
  | 'closed'      // fully exited
  | 'cancelled';  // never filled or error

export type MineOutcome =
  | 'tp_hit'
  | 'sl_hit'
  | 'timeout'
  | 'manual'
  | 'trailing_exit';

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
