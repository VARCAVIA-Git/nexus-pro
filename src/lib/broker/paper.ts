import { nanoid } from 'nanoid';
import type { Side, OrderType, BrokerOrder, BrokerBalance, BrokerPosition, OHLCV, Timeframe } from '@/types';
import type { BrokerAdapter } from './base';

export class PaperBroker implements BrokerAdapter {
  readonly name = 'paper';
  readonly isPaper = true;

  private balance: number;
  private orders: Map<string, BrokerOrder> = new Map();
  private positions: BrokerPosition[] = [];

  constructor(initialBalance = 10000) {
    this.balance = initialBalance;
  }

  async connect() { /* no-op */ }
  async disconnect() { /* no-op */ }

  async getBalance(): Promise<BrokerBalance> {
    const locked = this.positions.reduce((s, p) => s + p.quantity * p.entryPrice, 0);
    return {
      total: this.balance + locked,
      available: this.balance,
      locked,
      currency: 'USD',
      positions: [...this.positions],
    };
  }

  async getCandles(_symbol: string, _timeframe: Timeframe, _limit?: number): Promise<OHLCV[]> {
    // Paper broker doesn't provide real data — use external data source
    return [];
  }

  async placeOrder(params: {
    symbol: string; side: Side; type: OrderType;
    quantity: number; price?: number; stopPrice?: number;
  }): Promise<BrokerOrder> {
    const now = new Date();
    const fillPrice = params.price ?? 0;
    const order: BrokerOrder = {
      id: nanoid(),
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      price: params.price,
      stopPrice: params.stopPrice,
      status: 'filled',
      filledQty: params.quantity,
      filledPrice: fillPrice,
      createdAt: now,
      updatedAt: now,
    };

    // Simulate fill
    const cost = params.quantity * fillPrice;
    if (params.side === 'LONG') {
      this.balance -= cost;
      this.positions.push({
        symbol: params.symbol,
        side: 'LONG',
        quantity: params.quantity,
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
      });
    } else {
      this.balance += cost;
      this.positions = this.positions.filter((p) => p.symbol !== params.symbol);
    }

    this.orders.set(order.id, order);
    return order;
  }

  async cancelOrder(orderId: string) {
    const order = this.orders.get(orderId);
    if (order) order.status = 'cancelled';
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    return order;
  }

  async getOpenOrders(_symbol?: string): Promise<BrokerOrder[]> {
    return [...this.orders.values()].filter((o) => o.status === 'new' || o.status === 'partial');
  }
}
