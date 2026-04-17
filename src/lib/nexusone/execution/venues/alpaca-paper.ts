// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Alpaca Paper venue adapter
//
// Implements TradingVenue. Real submits for longs, crypto buys
// and stock orders; SIMULATED fills for crypto shorts (Alpaca
// paper does not support crypto shorting without holdings).
// ═══════════════════════════════════════════════════════════════

import { nanoid } from 'nanoid';
import type {
  TradingVenue,
  VenueOrderRequest,
  VenueOrderResponse,
  VenueBalance,
  VenuePosition,
} from './venue.interface';
import { isCryptoAsset } from './venue.interface';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';

const NO_CACHE = {
  cache: 'no-store' as RequestCache,
  next: { revalidate: 0 },
};

export class AlpacaPaperVenue implements TradingVenue {
  readonly name = 'alpaca-paper';
  readonly supportsCryptoShort = false;
  readonly supportsStockShort = true;

  constructor(private readonly apiKey: string, private readonly apiSecret: string) {}

  private headers(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${ALPACA_BASE}${path}`, {
      ...NO_CACHE,
      ...init,
      headers: { ...this.headers(), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getBalance(): Promise<VenueBalance> {
    const acc = await this.request<{
      cash: string;
      buying_power: string;
      non_marginable_buying_power: string;
    }>('/v2/account');
    return {
      cash: parseFloat(acc.cash),
      buyingPower: parseFloat(acc.buying_power),
    };
  }

  async getPositions(): Promise<VenuePosition[]> {
    const raw = await this.request<Array<{
      symbol: string;
      qty: string;
      avg_entry_price: string;
      market_value: string;
      side: 'long' | 'short';
    }>>('/v2/positions');
    return raw.map(p => ({
      asset: p.symbol,
      quantity: parseFloat(p.qty) * (p.side === 'short' ? -1 : 1),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      marketValue: parseFloat(p.market_value),
    }));
  }

  async submitOrder(req: VenueOrderRequest): Promise<VenueOrderResponse> {
    const t0 = Date.now();

    // Simulated short path for crypto — never hits Alpaca.
    if (req.side === 'sell' && isCryptoAsset(req.asset) && !this.supportsCryptoShort) {
      const positions = await this.getPositions().catch(() => [] as VenuePosition[]);
      const held = positions.find(p => p.asset === req.asset && p.quantity >= req.quantity);
      if (!held) {
        return {
          orderId: `sim_${nanoid(12)}`,
          status: 'simulated_filled',
          filledPrice: req.limitPrice ?? null,
          filledQty: req.quantity,
          venue: `${this.name}-simulated`,
          rejectionReason: null,
          isSimulated: true,
          latencyMs: Date.now() - t0,
        };
      }
    }

    const body: Record<string, unknown> = {
      symbol: req.asset,
      qty: req.quantity.toString(),
      side: req.side,
      type: req.type,
      time_in_force: req.timeInForce,
      client_order_id: req.clientOrderId,
    };
    if (req.type === 'limit' && req.limitPrice !== undefined) {
      body.limit_price = req.limitPrice.toString();
    }

    try {
      const resp = await this.request<{
        id: string;
        status: string;
        filled_qty: string;
        filled_avg_price: string | null;
      }>('/v2/orders', { method: 'POST', body: JSON.stringify(body) });

      const filledQty = parseFloat(resp.filled_qty || '0');
      const filledPrice = resp.filled_avg_price ? parseFloat(resp.filled_avg_price) : null;
      return {
        orderId: resp.id,
        status: mapAlpacaStatus(resp.status),
        filledPrice,
        filledQty: filledQty || null,
        venue: this.name,
        rejectionReason: null,
        isSimulated: false,
        latencyMs: Date.now() - t0,
      };
    } catch (e: any) {
      return {
        orderId: `rej_${nanoid(12)}`,
        status: 'rejected',
        filledPrice: null,
        filledQty: null,
        venue: this.name,
        rejectionReason: e?.message ?? String(e),
        isSimulated: false,
        latencyMs: Date.now() - t0,
      };
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, { method: 'DELETE' });
  }

  async getOrderStatus(orderId: string): Promise<VenueOrderResponse> {
    const t0 = Date.now();
    const resp = await this.request<{
      id: string;
      status: string;
      filled_qty: string;
      filled_avg_price: string | null;
    }>(`/v2/orders/${orderId}`);
    const filledQty = parseFloat(resp.filled_qty || '0');
    const filledPrice = resp.filled_avg_price ? parseFloat(resp.filled_avg_price) : null;
    return {
      orderId: resp.id,
      status: mapAlpacaStatus(resp.status),
      filledPrice,
      filledQty: filledQty || null,
      venue: this.name,
      rejectionReason: null,
      isSimulated: false,
      latencyMs: Date.now() - t0,
    };
  }
}

function mapAlpacaStatus(s: string): VenueOrderResponse['status'] {
  switch (s) {
    case 'filled': return 'filled';
    case 'partially_filled': return 'partial';
    case 'rejected': return 'rejected';
    case 'canceled':
    case 'cancelled':
    case 'expired': return 'cancelled';
    default: return 'submitted';
  }
}
