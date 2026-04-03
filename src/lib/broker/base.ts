import type { Side, OrderType, BrokerOrder, BrokerBalance, OHLCV, Timeframe } from '@/types';

export interface BrokerAdapter {
  readonly name: string;
  readonly isPaper: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  getBalance(): Promise<BrokerBalance>;
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<OHLCV[]>;

  placeOrder(params: {
    symbol: string;
    side: Side;
    type: OrderType;
    quantity: number;
    price?: number;
    stopPrice?: number;
  }): Promise<BrokerOrder>;

  cancelOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<BrokerOrder>;
  getOpenOrders(symbol?: string): Promise<BrokerOrder[]>;
}
