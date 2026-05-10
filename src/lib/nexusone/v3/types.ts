// NexusOne v3 — shared types

export const ASSETS_V3 = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD'] as const;
export const TFS_V3 = ['1H', '4H'] as const;
export type AssetV3 = typeof ASSETS_V3[number];
export type TfV3 = typeof TFS_V3[number];

export type Regime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface BarV3 {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorsV3 {
  rsi14: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  atr14: number[];
  sma20: number[];
  std20: number[];
  sma50: number[];
  std50: number[];
  regime: Regime[];
}

export interface SignalV3 {
  dir: 'long' | 'short';
  entryPrice: number;
  stopAtr: number;
  tpAtr: number;
  timeStopBars: number;
}

export type PrimitiveFn = (bars: BarV3[], ind: IndicatorsV3, i: number) => SignalV3 | null;

export interface PrimitiveDef {
  id: string;
  fn: PrimitiveFn;
  activeRegimes: Regime[];
}

export interface TupleStateV3 {
  key: string;
  primitive: string;
  asset: string;
  tf: TfV3;
  netBpsHistory: number[];
  active: boolean;
  cooldownUntilTrade: number;
  totalTrades: number;
  posteriorExpectancyBps: number;
}

export interface OpenTradeV3 {
  tupleKey: string;
  asset: AssetV3;
  tf: TfV3;
  primitive: string;
  entryBar: number;
  entryTs: number;
  entryPrice: number;
  dir: 'long' | 'short';
  stopPrice: number;
  tpPrice: number;
  timeStopBars: number;
  notional: number;
  riskBps: number;
}

export interface ClosedTradeV3 extends OpenTradeV3 {
  exitBar: number;
  exitTs: number;
  exitPrice: number;
  netBps: number;
  netDollars: number;
  reason: 'stop' | 'tp' | 'time';
}

export const COST_BPS_RT_V3 = 6; // maker round-trip target
