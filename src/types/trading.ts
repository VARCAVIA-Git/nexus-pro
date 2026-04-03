// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Core Trading Types
// ═══════════════════════════════════════════════════════════════

export type Side = 'LONG' | 'SHORT';
export type TradeStatus = 'open' | 'closed' | 'cancelled' | 'pending';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type Signal = 'BUY' | 'SELL' | 'NEUTRAL';
export type Regime = 'BULL_TREND' | 'BEAR_TREND' | 'HIGH_VOL' | 'LOW_VOL' | 'NORMAL';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type BrokerType = 'paper' | 'binance' | 'alpaca' | 'ibkr';
export type StrategyKey = 'combined_ai' | 'momentum' | 'trend' | 'reversion' | 'breakout' | 'pattern';

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingConfig {
  capital: number;
  riskPerTrade: number;
  maxPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStop: boolean;
  trailingPct: number;
  commissionPct: number;
  slippagePct: number;
  cooldownBars: number;
  kellyFraction: number;
  maxDrawdownLimit: number;
  dailyLossLimit: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: Side;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  sizeUsd: number;
  grossPnl?: number;
  commission?: number;
  netPnl?: number;
  pnlPct?: number;
  entryAt: Date;
  exitAt?: Date;
  durationBars?: number;
  strategy: StrategyKey;
  confidence: number;
  regime: Regime;
  exitReason?: string;
  isLive: boolean;
}

export interface SignalResult {
  signal: Signal;
  confidence: number;
  strategy: StrategyKey;
  indicators: Record<string, number>;
  patterns: PatternMatch[];
  regime: Regime;
  timestamp: Date;
}

export interface PatternMatch {
  index: number;
  type: string;
  signal: Signal;
  strength: number;
  date: string;
}

export interface BacktestResult {
  trades: TradeRecord[];
  equity: number[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  returnPct: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  initialCapital: number;
  finalCapital: number;
  totalCommissions: number;
}

export interface MonteCarloResult {
  simulations: number;
  probabilityOfProfit: number;
  percentiles: {
    p5: { final: number; maxDD: number };
    p25: { final: number; maxDD: number };
    p50: { final: number; maxDD: number };
    p75: { final: number; maxDD: number };
    p95: { final: number; maxDD: number };
  };
}

export interface WalkForwardResult {
  windows: Array<{
    window: number;
    trainWinRate: number;
    testWinRate: number;
    trainReturn: number;
    testReturn: number;
    robust: boolean;
  }>;
  robustnessPct: number;
}

export interface Indicators {
  rsi: number[];
  macd: { line: number[]; signal: number[]; histogram: number[] };
  bollinger: { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] };
  atr: number[];
  adx: number[];
  stochastic: { k: number[]; d: number[] };
  ema9: number[];
  ema21: number[];
  sma20: (number | null)[];
  sma50: (number | null)[];
  supertrend: number[];
  obv: number[];
  vwap: number[];
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: 'new' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQty: number;
  filledPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrokerBalance {
  total: number;
  available: number;
  locked: number;
  currency: string;
  positions: BrokerPosition[];
}

export interface BrokerPosition {
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}
