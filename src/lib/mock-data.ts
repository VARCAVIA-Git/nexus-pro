// ═══════════════════════════════════════════════════════════════
// NEXUS PRO v5 — Mock Data
// ═══════════════════════════════════════════════════════════════

// ── Equity Curve (90 days) ─────────────────────────────────
function generateEquity(startCapital: number, days: number, volatility: number, drift: number) {
  const data: { date: string; equity: number; drawdown: number }[] = [];
  let eq = startCapital;
  let peak = eq;
  const baseDate = new Date('2025-12-01');
  for (let i = 0; i < days; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const change = (Math.random() - 0.45) * volatility + drift;
    eq = Math.max(eq * (1 + change / 100), startCapital * 0.7);
    peak = Math.max(peak, eq);
    const dd = ((peak - eq) / peak) * 100;
    data.push({
      date: d.toISOString().slice(0, 10),
      equity: Math.round(eq * 100) / 100,
      drawdown: Math.round(dd * 100) / 100,
    });
  }
  return data;
}

export const equityCurve = generateEquity(10000, 90, 2.5, 0.15);
export const equityCurveReal = generateEquity(50000, 90, 1.8, 0.08);

// ── Stats ──────────────────────────────────────────────────
export const demoStats = {
  balance: 12847.32,
  totalPnl: 2847.32,
  totalPnlPct: 28.47,
  winRate: 67.3,
  totalTrades: 156,
  openPositions: 3,
  sharpe: 1.82,
  maxDrawdown: 8.4,
  profitFactor: 2.14,
  avgWin: 234.50,
  avgLoss: -109.20,
  bestTrade: 1205.40,
  worstTrade: -487.30,
  expectancy: 18.25,
  todayPnl: 127.40,
  weekPnl: 534.20,
  monthPnl: 1823.60,
};

export const realStats = {
  balance: 52340.18,
  totalPnl: 2340.18,
  totalPnlPct: 4.68,
  winRate: 61.2,
  totalTrades: 42,
  openPositions: 2,
  sharpe: 1.45,
  maxDrawdown: 5.2,
  profitFactor: 1.87,
  avgWin: 412.30,
  avgLoss: -220.50,
  bestTrade: 2105.80,
  worstTrade: -890.40,
  expectancy: 55.72,
  todayPnl: -84.20,
  weekPnl: 312.40,
  monthPnl: 1240.60,
};

// ── Recent Trades ──────────────────────────────────────────
export interface MockTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number | null;
  qty: number;
  pnl: number | null;
  pnlPct: number | null;
  strategy: string;
  status: 'open' | 'closed';
  date: string;
  exitDate: string | null;
  confidence: number;
}

export const demoTrades: MockTrade[] = [
  { id: 'dt1', symbol: 'BTC/USD', side: 'LONG', entry: 67240, exit: 69150, qty: 0.05, pnl: 95.50, pnlPct: 2.84, strategy: 'Trend', status: 'closed', date: '2026-03-28', exitDate: '2026-03-30', confidence: 0.82 },
  { id: 'dt2', symbol: 'ETH/USD', side: 'LONG', entry: 3420, exit: 3510, qty: 1.2, pnl: 108.00, pnlPct: 2.63, strategy: 'Momentum', status: 'closed', date: '2026-03-27', exitDate: '2026-03-29', confidence: 0.75 },
  { id: 'dt3', symbol: 'NVDA', side: 'LONG', entry: 875.20, exit: 891.40, qty: 5, pnl: 81.00, pnlPct: 1.85, strategy: 'Breakout', status: 'closed', date: '2026-03-26', exitDate: '2026-03-28', confidence: 0.71 },
  { id: 'dt4', symbol: 'SOL/USD', side: 'SHORT', entry: 182.50, exit: 178.20, qty: 12, pnl: 51.60, pnlPct: 2.36, strategy: 'Reversion', status: 'closed', date: '2026-03-25', exitDate: '2026-03-27', confidence: 0.68 },
  { id: 'dt5', symbol: 'AAPL', side: 'LONG', entry: 198.30, exit: 195.10, qty: 10, pnl: -32.00, pnlPct: -1.61, strategy: 'Combined AI', status: 'closed', date: '2026-03-24', exitDate: '2026-03-26', confidence: 0.54 },
  { id: 'dt6', symbol: 'BTC/USD', side: 'LONG', entry: 69500, exit: null, qty: 0.04, pnl: null, pnlPct: null, strategy: 'Trend', status: 'open', date: '2026-03-31', exitDate: null, confidence: 0.79 },
  { id: 'dt7', symbol: 'TSLA', side: 'SHORT', entry: 245.80, exit: null, qty: 8, pnl: null, pnlPct: null, strategy: 'Pattern', status: 'open', date: '2026-03-31', exitDate: null, confidence: 0.65 },
  { id: 'dt8', symbol: 'ETH/USD', side: 'LONG', entry: 3550, exit: null, qty: 1.5, pnl: null, pnlPct: null, strategy: 'Momentum', status: 'open', date: '2026-04-01', exitDate: null, confidence: 0.72 },
  { id: 'dt9', symbol: 'AVAX/USD', side: 'LONG', entry: 38.40, exit: 41.20, qty: 50, pnl: 140.00, pnlPct: 7.29, strategy: 'Breakout', status: 'closed', date: '2026-03-20', exitDate: '2026-03-23', confidence: 0.88 },
  { id: 'dt10', symbol: 'MSFT', side: 'LONG', entry: 420.50, exit: 414.30, qty: 4, pnl: -24.80, pnlPct: -1.47, strategy: 'Trend', status: 'closed', date: '2026-03-19', exitDate: '2026-03-21', confidence: 0.51 },
  { id: 'dt11', symbol: 'LINK/USD', side: 'LONG', entry: 18.70, exit: 20.45, qty: 100, pnl: 175.00, pnlPct: 9.36, strategy: 'Combined AI', status: 'closed', date: '2026-03-17', exitDate: '2026-03-20', confidence: 0.91 },
  { id: 'dt12', symbol: 'AMZN', side: 'SHORT', entry: 192.40, exit: 189.10, qty: 6, pnl: 19.80, pnlPct: 1.71, strategy: 'Reversion', status: 'closed', date: '2026-03-15', exitDate: '2026-03-17', confidence: 0.63 },
  { id: 'dt13', symbol: 'DOT/USD', side: 'LONG', entry: 7.80, exit: 7.45, qty: 200, pnl: -70.00, pnlPct: -4.49, strategy: 'Momentum', status: 'closed', date: '2026-03-13', exitDate: '2026-03-15', confidence: 0.47 },
  { id: 'dt14', symbol: 'BTC/USD', side: 'SHORT', entry: 66800, exit: 65100, qty: 0.06, pnl: 102.00, pnlPct: 2.54, strategy: 'Pattern', status: 'closed', date: '2026-03-11', exitDate: '2026-03-14', confidence: 0.77 },
  { id: 'dt15', symbol: 'META', side: 'LONG', entry: 510.20, exit: 528.70, qty: 3, pnl: 55.50, pnlPct: 3.63, strategy: 'Trend', status: 'closed', date: '2026-03-09', exitDate: '2026-03-12', confidence: 0.84 },
];

export const realTrades: MockTrade[] = [
  { id: 'rt1', symbol: 'BTC/USD', side: 'LONG', entry: 68100, exit: 69800, qty: 0.15, pnl: 255.00, pnlPct: 2.49, strategy: 'Combined AI', status: 'closed', date: '2026-03-29', exitDate: '2026-03-31', confidence: 0.89 },
  { id: 'rt2', symbol: 'ETH/USD', side: 'LONG', entry: 3480, exit: 3565, qty: 3.0, pnl: 255.00, pnlPct: 2.44, strategy: 'Trend', status: 'closed', date: '2026-03-27', exitDate: '2026-03-29', confidence: 0.81 },
  { id: 'rt3', symbol: 'NVDA', side: 'LONG', entry: 882.40, exit: 901.20, qty: 10, pnl: 188.00, pnlPct: 2.13, strategy: 'Momentum', status: 'closed', date: '2026-03-25', exitDate: '2026-03-28', confidence: 0.76 },
  { id: 'rt4', symbol: 'BTC/USD', side: 'LONG', entry: 70200, exit: null, qty: 0.10, pnl: null, pnlPct: null, strategy: 'Trend', status: 'open', date: '2026-04-01', exitDate: null, confidence: 0.82 },
  { id: 'rt5', symbol: 'SOL/USD', side: 'LONG', entry: 184.80, exit: null, qty: 20, pnl: null, pnlPct: null, strategy: 'Breakout', status: 'open', date: '2026-04-01', exitDate: null, confidence: 0.74 },
  { id: 'rt6', symbol: 'AAPL', side: 'LONG', entry: 197.10, exit: 193.40, qty: 20, pnl: -74.00, pnlPct: -1.88, strategy: 'Reversion', status: 'closed', date: '2026-03-22', exitDate: '2026-03-24', confidence: 0.58 },
  { id: 'rt7', symbol: 'ETH/USD', side: 'SHORT', entry: 3620, exit: 3540, qty: 2.5, pnl: 200.00, pnlPct: 2.21, strategy: 'Pattern', status: 'closed', date: '2026-03-20', exitDate: '2026-03-22', confidence: 0.72 },
  { id: 'rt8', symbol: 'TSLA', side: 'LONG', entry: 241.50, exit: 248.90, qty: 15, pnl: 111.00, pnlPct: 3.06, strategy: 'Momentum', status: 'closed', date: '2026-03-18', exitDate: '2026-03-21', confidence: 0.67 },
];

// Keep backward compat
export const mockTrades = demoTrades;

// ── Signals ────────────────────────────────────────────────
export interface MockSignal {
  id: string;
  symbol: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  strategy: string;
  confidence: number;
  price: number;
  time: string;
}

export const demoSignals: MockSignal[] = [
  { id: 'ds1', symbol: 'BTC/USD', signal: 'BUY', strategy: 'Combined AI', confidence: 0.84, price: 69820, time: '14:32' },
  { id: 'ds2', symbol: 'ETH/USD', signal: 'BUY', strategy: 'Momentum', confidence: 0.72, price: 3580, time: '14:28' },
  { id: 'ds3', symbol: 'NVDA', signal: 'SELL', strategy: 'Reversion', confidence: 0.65, price: 894.50, time: '14:15' },
  { id: 'ds4', symbol: 'SOL/USD', signal: 'BUY', strategy: 'Breakout', confidence: 0.78, price: 185.20, time: '13:55' },
  { id: 'ds5', symbol: 'TSLA', signal: 'SELL', strategy: 'Pattern', confidence: 0.61, price: 243.80, time: '13:42' },
  { id: 'ds6', symbol: 'AAPL', signal: 'NEUTRAL', strategy: 'Trend', confidence: 0.44, price: 196.40, time: '13:30' },
  { id: 'ds7', symbol: 'AVAX/USD', signal: 'BUY', strategy: 'Combined AI', confidence: 0.88, price: 41.50, time: '13:15' },
  { id: 'ds8', symbol: 'LINK/USD', signal: 'BUY', strategy: 'Momentum', confidence: 0.76, price: 20.80, time: '12:58' },
];

export const realSignals: MockSignal[] = [
  { id: 'rs1', symbol: 'BTC/USD', signal: 'BUY', strategy: 'Combined AI', confidence: 0.91, price: 70120, time: '14:35' },
  { id: 'rs2', symbol: 'ETH/USD', signal: 'BUY', strategy: 'Trend', confidence: 0.78, price: 3595, time: '14:30' },
  { id: 'rs3', symbol: 'SOL/USD', signal: 'NEUTRAL', strategy: 'Momentum', confidence: 0.52, price: 186.40, time: '14:18' },
  { id: 'rs4', symbol: 'NVDA', signal: 'BUY', strategy: 'Breakout', confidence: 0.74, price: 898.20, time: '14:05' },
  { id: 'rs5', symbol: 'AAPL', signal: 'SELL', strategy: 'Reversion', confidence: 0.63, price: 195.80, time: '13:48' },
  { id: 'rs6', symbol: 'TSLA', signal: 'SELL', strategy: 'Pattern', confidence: 0.69, price: 244.10, time: '13:35' },
];

// Keep backward compat
export const mockSignals = demoSignals;

// ── Strategies ─────────────────────────────────────────────
export interface MockStrategy {
  key: string;
  name: string;
  description: string;
  icon: string;
  winRate: number;
  returnPct: number;
  sharpe: number;
  trades: number;
  maxDD: number;
  profitFactor: number;
  enabled: boolean;
  tags: string[];
  riskRatio: string;
}

export const mockStrategies: MockStrategy[] = [
  {
    key: 'combined_ai', name: 'Combined AI', icon: '🧠',
    description: 'Ensemble di tutti gli indicatori con pesi adattivi. Combina momentum, trend, reversion, breakout e pattern recognition.',
    winRate: 67.3, returnPct: 28.4, sharpe: 1.82, trades: 156, maxDD: 8.4, profitFactor: 2.14,
    enabled: true, tags: ['Ensemble', 'Multi-factor'], riskRatio: '1:2.8',
  },
  {
    key: 'momentum', name: 'Momentum', icon: '🚀',
    description: 'RSI + MACD + Stochastic. Entra su oversold/overbought con conferma momentum multi-timeframe.',
    winRate: 62.1, returnPct: 18.7, sharpe: 1.45, trades: 89, maxDD: 11.2, profitFactor: 1.78,
    enabled: true, tags: ['RSI', 'MACD', 'Stochastic'], riskRatio: '1:2.1',
  },
  {
    key: 'trend', name: 'Trend Following', icon: '📈',
    description: 'EMA crossover + ADX filter + SMA50 direction. Cavalca i trend con trailing stop adattivo.',
    winRate: 58.4, returnPct: 22.1, sharpe: 1.62, trades: 67, maxDD: 9.8, profitFactor: 1.95,
    enabled: true, tags: ['EMA', 'ADX', 'Trend'], riskRatio: '1:2.4',
  },
  {
    key: 'reversion', name: 'Mean Reversion', icon: '🔄',
    description: 'Bollinger Bands + RSI. Compra ai minimi delle bande con RSI oversold, vende ai massimi.',
    winRate: 71.2, returnPct: 14.3, sharpe: 1.38, trades: 104, maxDD: 6.5, profitFactor: 1.92,
    enabled: true, tags: ['Bollinger', 'RSI', 'Contrarian'], riskRatio: '1:1.8',
  },
  {
    key: 'breakout', name: 'Breakout', icon: '💥',
    description: 'Rottura 20-bar high/low con volume spike. Conferma con ATR per volatilità sufficiente.',
    winRate: 54.8, returnPct: 31.2, sharpe: 1.71, trades: 45, maxDD: 13.1, profitFactor: 2.08,
    enabled: false, tags: ['Volume', 'ATR', 'Breakout'], riskRatio: '1:3.2',
  },
  {
    key: 'pattern', name: 'Pattern Recognition', icon: '🔍',
    description: 'Candlestick patterns (engulfing, hammer, morning star, etc.) con scoring multi-pattern.',
    winRate: 59.6, returnPct: 12.8, sharpe: 1.21, trades: 78, maxDD: 10.4, profitFactor: 1.65,
    enabled: false, tags: ['Candlestick', 'Patterns'], riskRatio: '1:1.6',
  },
];

// ── Assets ─────────────────────────────────────────────────
export interface MockAsset {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
  price: number;
  change24h: number;
  volume: string;
  enabled: boolean;
  sparkline: number[];
}

function spark(base: number, volatility: number): number[] {
  const pts: number[] = [];
  let v = base;
  for (let i = 0; i < 24; i++) {
    v += (Math.random() - 0.48) * volatility;
    pts.push(Math.round(v * 100) / 100);
  }
  return pts;
}

export const mockAssets: MockAsset[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', price: 69820, change24h: 2.34, volume: '42.1B', enabled: true, sparkline: spark(69000, 400) },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'crypto', price: 3580, change24h: 1.87, volume: '18.4B', enabled: true, sparkline: spark(3520, 30) },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', price: 185.20, change24h: -0.92, volume: '4.2B', enabled: true, sparkline: spark(186, 3) },
  { symbol: 'AVAX/USD', name: 'Avalanche', type: 'crypto', price: 41.50, change24h: 4.21, volume: '1.1B', enabled: true, sparkline: spark(40, 1.2) },
  { symbol: 'LINK/USD', name: 'Chainlink', type: 'crypto', price: 20.80, change24h: 3.15, volume: '890M', enabled: false, sparkline: spark(20, 0.8) },
  { symbol: 'DOT/USD', name: 'Polkadot', type: 'crypto', price: 7.85, change24h: -1.43, volume: '420M', enabled: false, sparkline: spark(7.9, 0.3) },
  { symbol: 'AAPL', name: 'Apple', type: 'stock', price: 196.40, change24h: 0.52, volume: '62.3M', enabled: true, sparkline: spark(195, 1.5) },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', price: 894.50, change24h: -1.28, volume: '45.8M', enabled: true, sparkline: spark(900, 8) },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock', price: 243.80, change24h: -2.14, volume: '98.2M', enabled: true, sparkline: spark(248, 4) },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', price: 425.30, change24h: 0.84, volume: '22.1M', enabled: false, sparkline: spark(423, 2) },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock', price: 191.20, change24h: 1.12, volume: '34.5M', enabled: false, sparkline: spark(190, 1.8) },
  { symbol: 'META', name: 'Meta', type: 'stock', price: 528.70, change24h: 0.38, volume: '18.7M', enabled: true, sparkline: spark(527, 3) },
];

// ── Risk level calculator ─────────────────────────────────
export function calculateRiskParams(level: number) {
  return {
    riskPerTrade: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 7, 8, 10][level],
    maxPositions: [0, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10][level],
    stopLossATR: [0, 3.0, 2.5, 2.2, 2.0, 1.8, 1.5, 1.3, 1.0, 0.8, 0.5][level],
    kellyFraction: [0, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60][level],
  };
}

// ── Backtest presets ──────────────────────────────────────
export const backtestPresets = {
  conservative: { capital: 10000, riskPerTrade: 2, stopLoss: 2, takeProfit: 4, trailing: true, trailingPct: 1.5 },
  moderate: { capital: 10000, riskPerTrade: 5, stopLoss: 3, takeProfit: 6.5, trailing: true, trailingPct: 2.5 },
  aggressive: { capital: 10000, riskPerTrade: 10, stopLoss: 5, takeProfit: 10, trailing: false, trailingPct: 0 },
};

// ── Backtest mock results ─────────────────────────────────
export const mockBacktestResult = {
  returnPct: 28.47,
  winRate: 67.3,
  sharpe: 1.82,
  sortino: 2.41,
  calmar: 3.39,
  maxDrawdown: 8.4,
  profitFactor: 2.14,
  totalTrades: 156,
  wins: 105,
  losses: 51,
  avgWin: 234.50,
  avgLoss: 109.20,
  expectancy: 18.25,
  maxConsecWins: 8,
  maxConsecLosses: 3,
  initialCapital: 10000,
  finalCapital: 12847.32,
  totalCommissions: 124.80,
  equity: equityCurve,
};
