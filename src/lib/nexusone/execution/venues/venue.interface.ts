// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Venue Interface
//
// Strategy- and asset-agnostic trading venue. The orchestrator
// routes orders through `TradingVenue` without knowing anything
// about Alpaca / Binance / etc.
// ═══════════════════════════════════════════════════════════════

export type VenueSide = 'buy' | 'sell';
export type VenueOrderType = 'market' | 'limit';

export interface VenueOrderRequest {
  asset: string;           // canonical symbol e.g. 'BTC/USD', 'AAPL'
  side: VenueSide;
  quantity: number;
  type: VenueOrderType;
  limitPrice?: number;
  timeInForce: 'gtc' | 'ioc' | 'day';
  clientOrderId: string;   // idempotency key
  metadata: {
    strategyId: string;
    signalId: string;
    expectedSlippageBps?: number;
  };
}

export interface VenueOrderResponse {
  orderId: string;
  status: 'submitted' | 'filled' | 'partial' | 'rejected' | 'cancelled' | 'simulated_filled';
  filledPrice: number | null;
  filledQty: number | null;
  venue: string;
  rejectionReason: string | null;
  isSimulated: boolean;
  latencyMs: number;
}

export interface VenueBalance {
  cash: number;        // unrestricted USD (non-marginable on Alpaca)
  buyingPower: number; // effective USD deployable for buys
}

export interface VenuePosition {
  asset: string;
  quantity: number;       // positive = long, negative = short
  avgEntryPrice: number;
  marketValue: number;
}

export interface TradingVenue {
  readonly name: string;
  readonly supportsCryptoShort: boolean;
  readonly supportsStockShort: boolean;

  getBalance(): Promise<VenueBalance>;
  getPositions(): Promise<VenuePosition[]>;

  submitOrder(req: VenueOrderRequest): Promise<VenueOrderResponse>;
  cancelOrder(orderId: string): Promise<void>;
  getOrderStatus(orderId: string): Promise<VenueOrderResponse>;
}

// ─── Asset classification helpers ─────────────────────────────

export function isCryptoAsset(asset: string): boolean {
  return asset.includes('/');
}
