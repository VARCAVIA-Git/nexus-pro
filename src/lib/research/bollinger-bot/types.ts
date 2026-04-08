// ═══════════════════════════════════════════════════════════════
// Bollinger Bot — types
// ═══════════════════════════════════════════════════════════════

export interface SignalSideStats {
  samples: number;            // total signals found in history
  avgFavorable: number;       // % avg max favorable move within window
  avgAdverse: number;         // % avg max adverse move within window
  p60Favorable: number;       // 60th percentile of favorable moves (the safe TP)
  p80Favorable: number;       // 80th percentile (aggressive TP)
  avgTimeToTP: number;        // avg bars to reach p60 favorable
  recommendedTP: number;      // % distance for TP entry (= p60 favorable)
  recommendedSL: number;      // % distance for SL (= 1.2 × |avg adverse|)
  estimatedWinRate: number;   // % times TP hit before SL
  expectedValue: number;      // EV per trade % = WR×TP - (1-WR)×SL
  edgeScore: number;          // EV × sqrt(samples) — composite ranking
}

export interface BollingerProfile {
  asset: string;
  trainedAt: string;
  dataset: {
    candles: number;
    firstDate: string;
    lastDate: string;
    spanYears: number;
  };
  optimalParams: {
    period: number;
    stdDev: number;
  };
  long: SignalSideStats;
  short: SignalSideStats;
  recommendation: 'STRONG' | 'GOOD' | 'CAUTION' | 'AVOID';
  recommendationReason: string;
  overallScore: number;       // 0-100
}

export interface TrainingJob {
  id: string;
  assets: string[];
  phase: 'idle' | 'fetching' | 'analyzing' | 'finalizing' | 'done' | 'error';
  progress: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
  profilesTrained?: number;
}
