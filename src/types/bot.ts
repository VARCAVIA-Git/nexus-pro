// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Multi-Bot Types
// ═══════════════════════════════════════════════════════════════

export interface MultiBotConfig {
  id: string;
  name: string;
  environment: 'demo' | 'real';
  capitalPercent: number;
  assets: string[];
  strategies: string[];
  riskLevel: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  useTrailingStop: boolean;
  maxOpenPositions: number;
  maxDDDaily: number;
  maxDDWeekly: number;
  maxDDTotal: number;
  operationMode: 'scalp' | 'intraday' | 'daily';
  status: 'running' | 'stopped' | 'paused' | 'error';
  createdAt: string;
  lastTickAt?: string;
  stats: {
    totalTrades: number;
    winRate: number;
    pnl: number;
    pnlPercent: number;
    sharpe: number;
    maxDrawdown: number;
  };

  // Phase 4.6 — AI-calibrated bot settings (optional, from backtest)
  /** Specific strategy+TF selected from backtest rankings */
  backtestStrategyId?: string;
  /** Timeframe from backtest */
  backtestTimeframe?: string;
  /** TP distance % calibrated from historical backtest */
  calibratedTpPct?: number;
  /** SL distance % calibrated from historical backtest */
  calibratedSlPct?: number;
  /** Auto-cancel timeout in bars (from backtest optimal) */
  entryTimeoutBars?: number;
  /** Whether this bot uses mined rules instead of coded strategies */
  usesMineRules?: boolean;
  /** Mined rule conditions (if usesMineRules) */
  mineRuleConditions?: string[];
}

export type MultiBotCreateInput = Omit<MultiBotConfig, 'id' | 'status' | 'createdAt' | 'lastTickAt' | 'stats'>;
