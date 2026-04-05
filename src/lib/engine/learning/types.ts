// ═══════════════════════════════════════════════════════════════
// NEXUS ADAPTIVE LEARNING ENGINE — Types
// ═══════════════════════════════════════════════════════════════

export interface TradeOutcome {
  id: string;
  asset: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  won: boolean;
  holdingTimeMinutes: number;
  entryContext: {
    masterScore: number;
    mtfAlignment: string;
    rsi: number;
    macd: number;
    adx: number;
    bollingerPosition: 'above' | 'middle' | 'below';
    volumeSpike: boolean;
    regime: string;
    newsSentiment: number;
    nearbyEconomicEvent: boolean;
    eventName?: string;
    dayOfWeek: number;
    hourOfDay: number;
    strategy: string;
    patterns: string[];
  };
  timestamp: number;
}

export interface ConditionStats {
  winRate: number;
  trades: number;
  avgPnl: number;
  avgPnlPct: number;
}

export interface AssetInsights {
  asset: string;
  bestStrategy: Record<string, ConditionStats>;
  bestRegime: Record<string, ConditionStats>;
  bestTiming: { bestHours: number[]; worstHours: number[]; bestDays: number[]; worstDays: number[] };
  newsImpact: { positive: ConditionStats; negative: ConditionStats; neutral: ConditionStats };
  eventImpact: { nearEvent: ConditionStats; noEvent: ConditionStats };
  optimalRSI: { bestBuyRange: [number, number]; worstBuyRange: [number, number] };
  optimalMinScore: number;
  sampleSize: number;
  lastUpdated: number;
}

export interface AdaptiveWeights {
  mtfWeight: number;
  newsWeight: number;
  calendarWeight: number;
  minScoreToEnter: number;
  preferredHours: number[];
  avoidDays: number[];
  lastUpdated: number;
}

export interface OptimizedParams {
  strategy: string;
  asset: string;
  optimalStopLoss: number;
  optimalTakeProfit: number;
  optimalConfidence: number;
  improvement: { winRateDelta: number; pnlDelta: number };
  sampleSize: number;
}
