import type { Side, OrderType, BrokerOrder, BrokerBalance, OHLCV, Timeframe } from '@/types';
import type { BrokerAdapter } from './base';

/**
 * Binance broker adapter (placeholder — requires ccxt integration)
 * Phase 3: Will use ccxt for full API integration
 */
export class BinanceBroker implements BrokerAdapter {
  readonly name = 'binance';
  readonly isPaper: boolean;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    testnet = true,
  ) {
    this.isPaper = testnet;
  }

  async connect() {
    // TODO: Initialize ccxt exchange instance
  }

  async disconnect() {
    // TODO: Cleanup
  }

  async getBalance(): Promise<BrokerBalance> {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }

  async getCandles(_symbol: string, _timeframe: Timeframe, _limit?: number): Promise<OHLCV[]> {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }

  async placeOrder(_params: {
    symbol: string; side: Side; type: OrderType;
    quantity: number; price?: number; stopPrice?: number;
  }): Promise<BrokerOrder> {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }

  async cancelOrder(_orderId: string) {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }

  async getOrder(_orderId: string): Promise<BrokerOrder> {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }

  async getOpenOrders(_symbol?: string): Promise<BrokerOrder[]> {
    throw new Error('Binance broker not yet implemented — Phase 3');
  }
}
