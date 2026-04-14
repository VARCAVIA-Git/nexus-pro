import { describe, it, expect } from 'vitest';
import { _internals, createEmptyMemory } from '@/lib/analytics/asset-memory';
import type { AssetMemory, Mine } from '@/lib/mine/types';

const { updateRegimeHistory, recordDecision, updateStrategyPerformance, recordBestCondition } = _internals;

// ─── Helpers ─────────────────────────────────────────────────

function emptyMemory(): AssetMemory {
  return createEmptyMemory('BTC/USD');
}

function mockMine(overrides: Partial<Mine> = {}): Mine {
  return {
    id: 'mine-1',
    symbol: 'BTC/USD',
    status: 'closed',
    strategy: 'trend',
    timeframe: '1h',
    direction: 'long',
    entrySignal: { type: 'pattern_match', confidence: 0.7, macroClear: true },
    entryPrice: 70000,
    entryTime: Date.now() - 3600_000,
    entryOrderId: 'ord-1',
    takeProfit: 73500,
    stopLoss: 68600,
    trailingStopPct: null,
    timeoutHours: 48,
    profile: 'moderate',
    allocatedCapital: 2000,
    quantity: 0.0286,
    unrealizedPnl: 0,
    maxUnrealizedPnl: 0,
    ticksMonitored: 10,
    lastCheck: Date.now(),
    exitPrice: 71000,
    exitTime: Date.now(),
    exitOrderId: 'ord-2',
    outcome: 'tp_hit',
    realizedPnl: 28.6,
    createdAt: Date.now() - 3600_000,
    updatedAt: Date.now(),
    notes: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('asset memory', () => {
  describe('updateRegimeHistory', () => {
    it('creates first regime entry', () => {
      const mem = emptyMemory();
      updateRegimeHistory(mem, 'TRENDING_UP', 1000);
      expect(mem.regimeHistory).toHaveLength(1);
      expect(mem.regimeHistory[0].regime).toBe('TRENDING_UP');
      expect(mem.regimeHistory[0].startedAt).toBe(1000);
      expect(mem.regimeHistory[0].endedAt).toBeNull();
    });

    it('updates duration of same regime', () => {
      const mem = emptyMemory();
      updateRegimeHistory(mem, 'TRENDING_UP', 1000);
      updateRegimeHistory(mem, 'TRENDING_UP', 2000);
      expect(mem.regimeHistory).toHaveLength(1);
      expect(mem.regimeHistory[0].durationMs).toBe(1000);
    });

    it('closes previous and opens new on regime change', () => {
      const mem = emptyMemory();
      updateRegimeHistory(mem, 'TRENDING_UP', 1000);
      updateRegimeHistory(mem, 'RANGING', 5000);
      expect(mem.regimeHistory).toHaveLength(2);
      expect(mem.regimeHistory[0].endedAt).toBe(5000);
      expect(mem.regimeHistory[0].durationMs).toBe(4000);
      expect(mem.regimeHistory[1].regime).toBe('RANGING');
      expect(mem.regimeHistory[1].endedAt).toBeNull();
    });

    it('trims to max entries', () => {
      const mem = emptyMemory();
      for (let i = 0; i < 110; i++) {
        updateRegimeHistory(mem, `regime_${i}`, i * 1000);
      }
      expect(mem.regimeHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('recordDecision', () => {
    it('records a decision with timestamp', () => {
      const mem = emptyMemory();
      recordDecision(mem, {
        direction: 'long',
        confidence: 0.7,
        acted: true,
        strategy: 'trend',
      }, 5000);
      expect(mem.recentDecisions).toHaveLength(1);
      expect(mem.recentDecisions[0].timestamp).toBe(5000);
      expect(mem.recentDecisions[0].direction).toBe('long');
    });

    it('trims to max 200 decisions', () => {
      const mem = emptyMemory();
      for (let i = 0; i < 210; i++) {
        recordDecision(mem, { direction: 'long', confidence: 0.5, acted: false, strategy: 'trend' }, i);
      }
      expect(mem.recentDecisions.length).toBeLessThanOrEqual(200);
    });
  });

  describe('updateStrategyPerformance', () => {
    it('creates new entry for first trade', () => {
      const mem = emptyMemory();
      const mine = mockMine({ outcome: 'tp_hit', exitPrice: 71000 });
      updateStrategyPerformance(mem, mine);
      expect(mem.strategyPerformance['trend']).toBeDefined();
      expect(mem.strategyPerformance['trend'].trades).toBe(1);
      expect(mem.strategyPerformance['trend'].wins).toBe(1);
    });

    it('updates existing entry for subsequent trades', () => {
      const mem = emptyMemory();
      updateStrategyPerformance(mem, mockMine({ outcome: 'tp_hit', exitPrice: 71000 }));
      updateStrategyPerformance(mem, mockMine({ outcome: 'sl_hit', exitPrice: 69000 }));
      expect(mem.strategyPerformance['trend'].trades).toBe(2);
      expect(mem.strategyPerformance['trend'].wins).toBe(1);
      expect(mem.strategyPerformance['trend'].losses).toBe(1);
    });

    it('skips non-closed mines', () => {
      const mem = emptyMemory();
      updateStrategyPerformance(mem, mockMine({ status: 'open', outcome: null }));
      expect(Object.keys(mem.strategyPerformance)).toHaveLength(0);
    });

    it('uses evaluatorSource as key when present', () => {
      const mem = emptyMemory();
      updateStrategyPerformance(mem, mockMine({ evaluatorSource: 'my_strategy' }));
      expect(mem.strategyPerformance['my_strategy']).toBeDefined();
    });
  });

  describe('recordBestCondition', () => {
    it('records winning conditions', () => {
      const mem = emptyMemory();
      const mine = mockMine({ outcome: 'tp_hit', exitPrice: 72000 });
      recordBestCondition(mem, mine, ['RSI<30', 'MACD=ABOVE']);
      expect(mem.bestConditions).toHaveLength(1);
      expect(mem.bestConditions[0].avgPnlPct).toBeGreaterThan(0);
      expect(mem.bestConditions[0].sampleSize).toBe(1);
    });

    it('updates existing condition set', () => {
      const mem = emptyMemory();
      const mine1 = mockMine({ outcome: 'tp_hit', exitPrice: 72000 });
      const mine2 = mockMine({ outcome: 'tp_hit', exitPrice: 73000 });
      recordBestCondition(mem, mine1, ['RSI<30', 'MACD=ABOVE']);
      recordBestCondition(mem, mine2, ['RSI<30', 'MACD=ABOVE']);
      expect(mem.bestConditions).toHaveLength(1);
      expect(mem.bestConditions[0].sampleSize).toBe(2);
    });

    it('skips losing trades', () => {
      const mem = emptyMemory();
      const mine = mockMine({ outcome: 'sl_hit', exitPrice: 68000 });
      recordBestCondition(mem, mine, ['RSI<30']);
      expect(mem.bestConditions).toHaveLength(0);
    });

    it('skips empty conditions', () => {
      const mem = emptyMemory();
      const mine = mockMine({ outcome: 'tp_hit', exitPrice: 72000 });
      recordBestCondition(mem, mine, []);
      expect(mem.bestConditions).toHaveLength(0);
    });
  });
});
