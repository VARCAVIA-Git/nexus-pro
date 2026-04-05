// ═══════════════════════════════════════════════════════════════
// NEXUS INTELLIGENCE ENGINE — Types
// ═══════════════════════════════════════════════════════════════

export type TFKey = '15m' | '1h' | '4h' | '1d' | '1w';
export type TrendDir = 'bullish' | 'bearish' | 'neutral';
export type Alignment = 'strong' | 'moderate' | 'weak' | 'conflicting';
export type OpMode = 'scalp' | 'intraday' | 'swing' | 'position';
export type Recommendation = 'STRONG_ENTER' | 'ENTER' | 'HOLD' | 'EXIT' | 'STRONG_EXIT';

export interface TimeframeAnalysis {
  timeframe: TFKey;
  trend: TrendDir;
  strength: number;
  indicators: { rsi: number; macdH: number; bbWidth: number; adx: number; stochK: number; emaCross: boolean };
  support: number;
  resistance: number;
}

export interface MTFSignal {
  asset: string;
  timeframes: Record<TFKey, TimeframeAnalysis>;
  alignment: Alignment;
  compositeScore: number;
  direction: 'long' | 'short' | 'neutral';
  suggestedTimeframe: OpMode;
  confidence: number;
}

export interface NewsSentiment {
  asset: string;
  score: number;
  articles: number;
  latestHeadlines: { title: string; sentiment: 'positive' | 'negative' | 'neutral'; source: string; time: string }[];
  impactLevel: 'low' | 'medium' | 'high';
}

export interface EconomicEvent {
  name: string;
  datetime: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  currency: string;
  affectsAssets: string[];
}

export interface MasterSignal {
  asset: string;
  score: number;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  recommendation: Recommendation;
  components: {
    mtf: MTFSignal;
    news: NewsSentiment;
    calendar: { nearbyEvents: EconomicEvent[]; blocked: boolean };
  };
  suggestedSL: number;
  suggestedTP: number;
  suggestedSize: number;
  reasoning: string[];
  timestamp: number;
}
