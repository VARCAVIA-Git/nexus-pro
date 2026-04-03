import type { Side, OrderType, BrokerOrder, BrokerBalance, OHLCV, Timeframe } from '@/types';
import type { BrokerAdapter } from './base';

/**
 * Alpaca broker adapter (placeholder — Phase 3)
 */
export class AlpacaBroker implements BrokerAdapter {
  readonly name = 'alpaca';
  readonly isPaper: boolean;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    paper = true,
  ) {
    this.isPaper = paper;
  }

  async connect() {
    // TODO: Initialize Alpaca REST client
  }

  async disconnect() {
    // TODO: Cleanup
  }

  async getBalance(): Promise<BrokerBalance> {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }

  async getCandles(_symbol: string, _timeframe: Timeframe, _limit?: number): Promise<OHLCV[]> {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }

  async placeOrder(_params: {
    symbol: string; side: Side; type: OrderType;
    quantity: number; price?: number; stopPrice?: number;
  }): Promise<BrokerOrder> {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }

  async cancelOrder(_orderId: string) {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }

  async getOrder(_orderId: string): Promise<BrokerOrder> {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }

  async getOpenOrders(_symbol?: string): Promise<BrokerOrder[]> {
    throw new Error('Alpaca broker not yet implemented — Phase 3');
  }
}
