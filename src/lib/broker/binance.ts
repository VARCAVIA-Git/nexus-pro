// ═══════════════════════════════════════════════════════════════
// LEGACY — Binance broker adapter (DEPRECATED)
// Binance is not available in the US/Florida.
// All trading is now routed through Alpaca Markets.
// This file is kept for reference only and is NOT used.
// ═══════════════════════════════════════════════════════════════

import type { Side, OrderType, BrokerOrder, BrokerBalance, OHLCV, Timeframe } from '@/types';
import type { BrokerAdapter } from './base';

/** @deprecated Use AlpacaBroker instead — Binance is not available in US */
export class BinanceBroker implements BrokerAdapter {
  readonly name = 'binance-legacy';
  readonly isPaper = true;

  constructor(
    _apiKey?: string,
    _apiSecret?: string,
    _testnet?: boolean,
  ) {}

  async connect() { throw new Error('Binance is deprecated — use Alpaca'); }
  async disconnect() {}
  async getBalance(): Promise<BrokerBalance> { throw new Error('Binance is deprecated — use Alpaca'); }
  async getCandles(_s: string, _t: Timeframe, _l?: number): Promise<OHLCV[]> { throw new Error('Binance is deprecated — use Alpaca'); }
  async placeOrder(_p: { symbol: string; side: Side; type: OrderType; quantity: number; price?: number; stopPrice?: number }): Promise<BrokerOrder> { throw new Error('Binance is deprecated — use Alpaca'); }
  async cancelOrder(_id: string) { throw new Error('Binance is deprecated — use Alpaca'); }
  async getOrder(_id: string): Promise<BrokerOrder> { throw new Error('Binance is deprecated — use Alpaca'); }
  async getOpenOrders(_s?: string): Promise<BrokerOrder[]> { throw new Error('Binance is deprecated — use Alpaca'); }
}
