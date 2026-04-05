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
}

export type MultiBotCreateInput = Omit<MultiBotConfig, 'id' | 'status' | 'createdAt' | 'lastTickAt' | 'stats'>;
