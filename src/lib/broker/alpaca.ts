import { nanoid } from 'nanoid';
import type { Side, OrderType, BrokerOrder, BrokerBalance, BrokerPosition, OHLCV, Timeframe } from '@/types';
import type { BrokerAdapter } from './base';

// ═══════════════════════════════════════════════════════════════
// ALPACA BROKER — Primary broker for ALL trading (crypto + stocks)
// Uses Alpaca Markets API v2 for both paper and live trading.
// Crypto via Alpaca Crypto Trading, stocks via Alpaca Securities.
// ═══════════════════════════════════════════════════════════════

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_URL = 'https://api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

/** Map our timeframe to Alpaca bar timeframe strings */
function mapTimeframe(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    '1m': '1Min', '5m': '5Min', '15m': '15Min',
    '1h': '1Hour', '4h': '4Hour', '1d': '1Day', '1w': '1Week',
  };
  return map[tf] ?? '1Day';
}

/** Detect if a symbol is crypto (contains '/' like BTC/USD) */
function isCrypto(symbol: string): boolean {
  return symbol.includes('/');
}

/** Convert our symbol format to Alpaca format */
function toAlpacaSymbol(symbol: string): string {
  if (isCrypto(symbol)) {
    // BTC/USD → BTC/USD (Alpaca crypto uses this format)
    return symbol;
  }
  // AAPL → AAPL (stocks are already in the right format)
  return symbol;
}

/** Convert Alpaca order side to our Side type */
function toAlpacaSide(side: Side): string {
  return side === 'LONG' ? 'buy' : 'sell';
}

/** Convert Alpaca order type to their format */
function toAlpacaOrderType(type: OrderType): string {
  const map: Record<OrderType, string> = {
    market: 'market', limit: 'limit', stop: 'stop', stop_limit: 'stop_limit',
  };
  return map[type];
}

/** Parse Alpaca order status to our status */
function parseStatus(status: string): BrokerOrder['status'] {
  const map: Record<string, BrokerOrder['status']> = {
    new: 'new', accepted: 'new', pending_new: 'new',
    partially_filled: 'partial', filled: 'filled',
    canceled: 'cancelled', expired: 'cancelled', rejected: 'rejected',
    done_for_day: 'filled', replaced: 'new',
  };
  return map[status] ?? 'new';
}

export class AlpacaBroker implements BrokerAdapter {
  readonly name = 'alpaca';
  readonly isPaper: boolean;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    paper = true,
  ) {
    this.isPaper = paper;
    this.baseUrl = paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    this.headers = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca API error ${res.status}: ${body}`);
    }

    return res.json();
  }

  private async dataRequest<T>(path: string): Promise<T> {
    const url = `${ALPACA_DATA_URL}${path}`;
    const res = await fetch(url, { headers: this.headers, cache: 'no-store', next: { revalidate: 0 } });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca Data API error ${res.status}: ${body}`);
    }

    return res.json();
  }

  async connect(): Promise<void> {
    // Verify credentials by fetching account info
    await this.request('/v2/account');
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }

  async getBalance(): Promise<BrokerBalance> {
    const account = await this.request<{
      equity: string;
      buying_power: string;
      cash: string;
      currency: string;
    }>('/v2/account');

    const positions = await this.getPositions();

    const total = parseFloat(account.equity);
    const available = parseFloat(account.buying_power);
    const locked = total - available;

    return {
      total,
      available,
      locked: Math.max(locked, 0),
      currency: account.currency || 'USD',
      positions,
    };
  }

  private async getPositions(): Promise<BrokerPosition[]> {
    const raw = await this.request<Array<{
      symbol: string;
      side: string;
      qty: string;
      avg_entry_price: string;
      current_price: string;
      unrealized_pl: string;
      unrealized_plpc: string;
    }>>('/v2/positions');

    return raw.map((p) => ({
      symbol: p.symbol,
      side: (p.side === 'long' ? 'LONG' : 'SHORT') as Side,
      quantity: parseFloat(p.qty),
      entryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      unrealizedPnl: parseFloat(p.unrealized_pl),
      unrealizedPnlPct: parseFloat(p.unrealized_plpc) * 100,
    }));
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<OHLCV[]> {
    const alpacaSymbol = toAlpacaSymbol(symbol);
    const tf = mapTimeframe(timeframe);

    let path: string;
    if (isCrypto(symbol)) {
      // Alpaca crypto bars endpoint
      const encoded = encodeURIComponent(alpacaSymbol);
      path = `/v1beta3/crypto/us/bars?symbols=${encoded}&timeframe=${tf}&limit=${limit}`;
    } else {
      // Alpaca stock bars endpoint
      path = `/v2/stocks/${alpacaSymbol}/bars?timeframe=${tf}&limit=${limit}&adjustment=split`;
    }

    const data = await this.dataRequest<{
      bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>>;
    } | { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }>(path);

    let bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;

    if (isCrypto(symbol)) {
      // Crypto response: { bars: { "BTC/USD": [...] } }
      const barsMap = (data as { bars: Record<string, typeof bars> }).bars;
      bars = barsMap?.[alpacaSymbol] ?? [];
    } else {
      // Stock response: { bars: [...] }
      bars = (data as { bars: typeof bars }).bars ?? [];
    }

    return bars.map((b) => ({
      date: b.t.slice(0, 10),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  }

  async placeOrder(params: {
    symbol: string; side: Side; type: OrderType;
    quantity: number; price?: number; stopPrice?: number;
  }): Promise<BrokerOrder> {
    const alpacaSymbol = toAlpacaSymbol(params.symbol);

    const body: Record<string, unknown> = {
      symbol: alpacaSymbol,
      qty: params.quantity.toString(),
      side: toAlpacaSide(params.side),
      type: toAlpacaOrderType(params.type),
      time_in_force: isCrypto(params.symbol) ? 'gtc' : 'day',
    };

    if (params.price && (params.type === 'limit' || params.type === 'stop_limit')) {
      body.limit_price = params.price.toString();
    }
    if (params.stopPrice && (params.type === 'stop' || params.type === 'stop_limit')) {
      body.stop_price = params.stopPrice.toString();
    }

    const order = await this.request<{
      id: string;
      symbol: string;
      side: string;
      type: string;
      qty: string;
      limit_price: string | null;
      stop_price: string | null;
      status: string;
      filled_qty: string;
      filled_avg_price: string | null;
      created_at: string;
      updated_at: string;
    }>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      id: order.id,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: parseFloat(order.qty),
      price: order.limit_price ? parseFloat(order.limit_price) : undefined,
      stopPrice: order.stop_price ? parseFloat(order.stop_price) : undefined,
      status: parseStatus(order.status),
      filledQty: parseFloat(order.filled_qty || '0'),
      filledPrice: parseFloat(order.filled_avg_price || '0'),
      createdAt: new Date(order.created_at),
      updatedAt: new Date(order.updated_at),
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, { method: 'DELETE' });
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    const order = await this.request<{
      id: string;
      symbol: string;
      side: string;
      type: string;
      qty: string;
      limit_price: string | null;
      stop_price: string | null;
      status: string;
      filled_qty: string;
      filled_avg_price: string | null;
      created_at: string;
      updated_at: string;
    }>(`/v2/orders/${orderId}`);

    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side === 'buy' ? 'LONG' : 'SHORT',
      type: order.type as OrderType,
      quantity: parseFloat(order.qty),
      price: order.limit_price ? parseFloat(order.limit_price) : undefined,
      stopPrice: order.stop_price ? parseFloat(order.stop_price) : undefined,
      status: parseStatus(order.status),
      filledQty: parseFloat(order.filled_qty || '0'),
      filledPrice: parseFloat(order.filled_avg_price || '0'),
      createdAt: new Date(order.created_at),
      updatedAt: new Date(order.updated_at),
    };
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    let path = '/v2/orders?status=open';
    if (symbol) path += `&symbols=${encodeURIComponent(toAlpacaSymbol(symbol))}`;

    const orders = await this.request<Array<{
      id: string;
      symbol: string;
      side: string;
      type: string;
      qty: string;
      limit_price: string | null;
      stop_price: string | null;
      status: string;
      filled_qty: string;
      filled_avg_price: string | null;
      created_at: string;
      updated_at: string;
    }>>(path);

    return orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      side: (o.side === 'buy' ? 'LONG' : 'SHORT') as Side,
      type: o.type as OrderType,
      quantity: parseFloat(o.qty),
      price: o.limit_price ? parseFloat(o.limit_price) : undefined,
      stopPrice: o.stop_price ? parseFloat(o.stop_price) : undefined,
      status: parseStatus(o.status),
      filledQty: parseFloat(o.filled_qty || '0'),
      filledPrice: parseFloat(o.filled_avg_price || '0'),
      createdAt: new Date(o.created_at),
      updatedAt: new Date(o.updated_at),
    }));
  }
}
