import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrokerAdapter } from '@/lib/broker/base';
import type { BrokerOrder, BrokerBalance, Side, OrderType, OHLCV, Timeframe } from '@/types';

// ─── Mock broker ──────────────────────────────────────────────

function createMockBroker(overrides: Partial<BrokerAdapter> = {}): BrokerAdapter {
  return {
    name: 'mock',
    isPaper: true,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getBalance: vi.fn(async (): Promise<BrokerBalance> => ({
      total: 100000,
      available: 80000,
      locked: 20000,
      currency: 'USD',
      positions: [],
    })),
    getCandles: vi.fn(async (): Promise<OHLCV[]> => []),
    placeOrder: vi.fn(async (params: {
      symbol: string; side: Side; type: OrderType; quantity: number; price?: number;
    }): Promise<BrokerOrder> => ({
      id: 'ord-mock-123',
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      price: params.price,
      status: 'filled',
      filledQty: params.quantity,
      filledPrice: 70000,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    cancelOrder: vi.fn(async () => {}),
    getOrder: vi.fn(async (orderId: string): Promise<BrokerOrder> => ({
      id: orderId,
      symbol: 'BTC/USD',
      side: 'LONG',
      type: 'market',
      quantity: 0.1,
      status: 'filled',
      filledQty: 0.1,
      filledPrice: 70000,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getOpenOrders: vi.fn(async (): Promise<BrokerOrder[]> => []),
    ...overrides,
  };
}

// Mock the broker factory
vi.mock('@/lib/broker', () => ({
  createDefaultBroker: vi.fn(),
}));

import {
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOrderStatus,
  getAccountInfo,
  closePosition,
  _resetBroker,
} from '@/lib/mine/execution';

// ─── Tests ────────────────────────────────────────────────────

describe('execution layer', () => {
  let mockBroker: BrokerAdapter;

  beforeEach(() => {
    mockBroker = createMockBroker();
    _resetBroker(mockBroker);
  });

  describe('placeMarketOrder', () => {
    it('places a long market order successfully', async () => {
      const result = await placeMarketOrder('BTC/USD', 'long', 0.1);
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-mock-123');
      expect(result.filledPrice).toBe(70000);
      expect(result.error).toBeNull();
      expect(mockBroker.placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        side: 'LONG',
        type: 'market',
        quantity: 0.1,
      });
    });

    it('places a short market order successfully', async () => {
      const result = await placeMarketOrder('BTC/USD', 'short', 0.05);
      expect(result.success).toBe(true);
      expect(mockBroker.placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        side: 'SHORT',
        type: 'market',
        quantity: 0.05,
      });
    });

    it('returns error on broker failure', async () => {
      _resetBroker(createMockBroker({
        placeOrder: vi.fn(async () => { throw new Error('Insufficient funds'); }),
      }));
      const result = await placeMarketOrder('BTC/USD', 'long', 0.1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient funds');
      expect(result.orderId).toBeNull();
    });
  });

  describe('placeLimitOrder', () => {
    it('places a limit order with price', async () => {
      const result = await placeLimitOrder('BTC/USD', 'long', 0.1, 69000);
      expect(result.success).toBe(true);
      expect(mockBroker.placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        side: 'LONG',
        type: 'limit',
        quantity: 0.1,
        price: 69000,
      });
    });
  });

  describe('cancelOrder', () => {
    it('returns true on success', async () => {
      expect(await cancelOrder('ord-123')).toBe(true);
      expect(mockBroker.cancelOrder).toHaveBeenCalledWith('ord-123');
    });

    it('returns false on failure', async () => {
      _resetBroker(createMockBroker({
        cancelOrder: vi.fn(async () => { throw new Error('Not found'); }),
      }));
      expect(await cancelOrder('ord-999')).toBe(false);
    });
  });

  describe('getOrderStatus', () => {
    it('returns order info', async () => {
      const order = await getOrderStatus('ord-123');
      expect(order).not.toBeNull();
      expect(order!.id).toBe('ord-123');
      expect(order!.status).toBe('filled');
    });

    it('returns null on failure', async () => {
      _resetBroker(createMockBroker({
        getOrder: vi.fn(async () => { throw new Error('Not found'); }),
      }));
      expect(await getOrderStatus('nope')).toBeNull();
    });
  });

  describe('getAccountInfo', () => {
    it('returns equity and buying power', async () => {
      const info = await getAccountInfo();
      expect(info).not.toBeNull();
      expect(info!.equity).toBe(100000);
      expect(info!.buyingPower).toBe(80000);
    });

    it('returns null on failure', async () => {
      _resetBroker(createMockBroker({
        getBalance: vi.fn(async () => { throw new Error('Connection error'); }),
      }));
      expect(await getAccountInfo()).toBeNull();
    });
  });

  describe('closePosition', () => {
    it('closes a long by selling', async () => {
      const result = await closePosition('BTC/USD', 'long', 0.1);
      expect(result.success).toBe(true);
      expect(mockBroker.placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        side: 'SHORT',
        type: 'market',
        quantity: 0.1,
      });
    });

    it('closes a short by buying', async () => {
      await closePosition('BTC/USD', 'short', 0.05);
      expect(mockBroker.placeOrder).toHaveBeenCalledWith({
        symbol: 'BTC/USD',
        side: 'LONG',
        type: 'market',
        quantity: 0.05,
      });
    });
  });
});
