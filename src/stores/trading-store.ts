import { create } from 'zustand';
import type { TradingConfig, StrategyKey, BacktestResult } from '@/types';

interface TradingState {
  symbol: string;
  strategy: StrategyKey;
  config: TradingConfig;
  results: BacktestResult | null;
  isRunning: boolean;
  // Actions
  setSymbol: (s: string) => void;
  setStrategy: (s: StrategyKey) => void;
  setConfig: (c: Partial<TradingConfig>) => void;
  setResults: (r: BacktestResult | null) => void;
  setRunning: (b: boolean) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  symbol: 'BTC/USD',
  strategy: 'combined_ai',
  config: {
    capital: 10000, riskPerTrade: 5, maxPositions: 3,
    stopLossPct: 3, takeProfitPct: 6.5, trailingStop: true,
    trailingPct: 2.5, commissionPct: 0.1, slippagePct: 0.05,
    cooldownBars: 3, kellyFraction: 0.5, maxDrawdownLimit: 25, dailyLossLimit: 5,
  },
  results: null,
  isRunning: false,
  setSymbol: (symbol) => set({ symbol }),
  setStrategy: (strategy) => set({ strategy }),
  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  setResults: (results) => set({ results }),
  setRunning: (isRunning) => set({ isRunning }),
}));
