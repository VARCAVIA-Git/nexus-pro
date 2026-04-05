// ═══════════════════════════════════════════════════════════════
// Asset & Strategy Configuration — used by Strategy page and signals
// These are CONFIGURATION, not mock data. Prices update from live feeds.
// ═══════════════════════════════════════════════════════════════

export interface AssetConfig {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock';
  enabled: boolean;
}

export const ASSETS: AssetConfig[] = [
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'crypto', enabled: true },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'crypto', enabled: true },
  { symbol: 'SOL/USD', name: 'Solana', type: 'crypto', enabled: true },
  { symbol: 'AVAX/USD', name: 'Avalanche', type: 'crypto', enabled: false },
  { symbol: 'LINK/USD', name: 'Chainlink', type: 'crypto', enabled: false },
  { symbol: 'DOT/USD', name: 'Polkadot', type: 'crypto', enabled: false },
  { symbol: 'AAPL', name: 'Apple', type: 'stock', enabled: true },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', enabled: true },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock', enabled: true },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', enabled: false },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock', enabled: false },
  { symbol: 'META', name: 'Meta', type: 'stock', enabled: false },
];

export interface StrategyConfig {
  key: string;
  name: string;
  icon: string;
  winRate: number;
  riskRatio: string;
  maxDD: number;
  tags: string[];
  enabled: boolean;
}

export const STRATEGIES: StrategyConfig[] = [
  { key: 'combined_ai', name: 'Combined AI', icon: '🧠', winRate: 67, riskRatio: '1:2.8', maxDD: 8.4, tags: ['Ensemble', 'Multi-factor'], enabled: true },
  { key: 'momentum', name: 'Momentum', icon: '🚀', winRate: 62, riskRatio: '1:2.1', maxDD: 11.2, tags: ['RSI', 'MACD'], enabled: true },
  { key: 'trend', name: 'Trend Following', icon: '📈', winRate: 58, riskRatio: '1:2.4', maxDD: 9.8, tags: ['EMA', 'ADX'], enabled: true },
  { key: 'reversion', name: 'Mean Reversion', icon: '🔄', winRate: 71, riskRatio: '1:1.8', maxDD: 6.5, tags: ['Bollinger', 'RSI'], enabled: false },
  { key: 'breakout', name: 'Breakout', icon: '💥', winRate: 55, riskRatio: '1:3.2', maxDD: 13.1, tags: ['Volume', 'ATR'], enabled: false },
  { key: 'pattern', name: 'Pattern Recognition', icon: '🔍', winRate: 60, riskRatio: '1:1.6', maxDD: 10.4, tags: ['Candlestick'], enabled: false },
];

export function calculateRiskParams(level: number) {
  return {
    riskPerTrade: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 7, 8, 10][level],
    maxPositions: [0, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10][level],
    stopLossATR: [0, 3.0, 2.5, 2.2, 2.0, 1.8, 1.5, 1.3, 1.0, 0.8, 0.5][level],
    kellyFraction: [0, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60][level],
  };
}
