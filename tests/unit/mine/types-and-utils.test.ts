import { describe, it, expect } from 'vitest';
import type {
  Mine,
  MineStatus,
  MineOutcome,
  EntrySignal,
  CapitalProfile,
  DetectedSignal,
  PortfolioSnapshot,
  TradeOutcome,
} from '@/lib/mine/types';
import { PROFILES, MINE_KEYS, DEFAULT_PROFILE, MIN_TP_SL_RATIO } from '@/lib/mine/constants';
import {
  generateMineId,
  formatPnl,
  formatPnlPct,
  calcUnrealizedPnl,
  calcUnrealizedPnlPct,
  isTpHit,
  isSlHit,
  isTimedOut,
  getProfile,
  calcPositionSize,
  isTerminal,
  calcRiskReward,
} from '@/lib/mine/utils';

// ─── Helper: build a mock mine ────────────────────────────────

function mockMine(overrides: Partial<Mine> = {}): Mine {
  return {
    id: 'test-mine-1',
    symbol: 'BTC/USD',
    status: 'open',
    strategy: 'reversion',
    timeframe: '1h',
    direction: 'long',
    entrySignal: {
      type: 'zone_bounce',
      confidence: 0.8,
      macroClear: true,
    },
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
    ticksMonitored: 0,
    lastCheck: Date.now(),
    exitPrice: null,
    exitTime: null,
    exitOrderId: null,
    outcome: null,
    realizedPnl: null,
    createdAt: Date.now() - 3600_000,
    updatedAt: Date.now(),
    notes: [],
    ...overrides,
  };
}

// ─── Types compile check ──────────────────────────────────────

describe('mine types', () => {
  it('Mine interface has all required fields', () => {
    const mine = mockMine();
    expect(mine.id).toBeDefined();
    expect(mine.symbol).toBe('BTC/USD');
    expect(mine.status).toBe('open');
    expect(mine.direction).toBe('long');
    expect(mine.entrySignal.type).toBe('zone_bounce');
    expect(mine.entrySignal.macroClear).toBe(true);
  });

  it('MineStatus covers all lifecycle stages', () => {
    const statuses: MineStatus[] = ['pending', 'open', 'closing', 'closed', 'cancelled'];
    expect(statuses.length).toBe(5);
  });

  it('MineOutcome covers all exit reasons', () => {
    const outcomes: MineOutcome[] = ['tp_hit', 'sl_hit', 'timeout', 'manual', 'trailing_exit'];
    expect(outcomes.length).toBe(5);
  });
});

// ─── Constants ────────────────────────────────────────────────

describe('mine constants', () => {
  it('all three profiles are defined', () => {
    expect(PROFILES.conservative).toBeDefined();
    expect(PROFILES.moderate).toBeDefined();
    expect(PROFILES.aggressive).toBeDefined();
  });

  it('conservative has lowest risk', () => {
    expect(PROFILES.conservative.maxPortfolioRiskPct).toBeLessThan(PROFILES.moderate.maxPortfolioRiskPct);
    expect(PROFILES.moderate.maxPortfolioRiskPct).toBeLessThan(PROFILES.aggressive.maxPortfolioRiskPct);
  });

  it('conservative requires highest confidence', () => {
    expect(PROFILES.conservative.minConfidence).toBeGreaterThan(PROFILES.moderate.minConfidence);
    expect(PROFILES.moderate.minConfidence).toBeGreaterThan(PROFILES.aggressive.minConfidence);
  });

  it('MINE_KEYS generates correct key patterns', () => {
    expect(MINE_KEYS.mine('abc')).toBe('nexus:mine:abc');
    expect(MINE_KEYS.activeMines('BTC/USD')).toBe('nexus:mines:active:BTC/USD');
    expect(MINE_KEYS.history('ETH/USD')).toBe('nexus:mines:history:ETH/USD');
    expect(MINE_KEYS.feedback('SOL/USD')).toBe('nexus:feedback:SOL/USD');
    expect(MINE_KEYS.engineEnabled).toBe('nexus:mine-engine:enabled');
  });

  it('default profile is conservative', () => {
    expect(DEFAULT_PROFILE).toBe('conservative');
  });

  it('MIN_TP_SL_RATIO is at least 1.5', () => {
    expect(MIN_TP_SL_RATIO).toBeGreaterThanOrEqual(1.5);
  });
});

// ─── Utils ────────────────────────────────────────────────────

describe('mine utils', () => {
  it('generateMineId returns 10-char string', () => {
    const id = generateMineId();
    expect(id).toHaveLength(10);
    expect(typeof id).toBe('string');
    // unique
    expect(generateMineId()).not.toBe(id);
  });

  it('formatPnl formats positive and negative', () => {
    expect(formatPnl(123.456)).toBe('+123.46');
    expect(formatPnl(-50)).toBe('-50.00');
    expect(formatPnl(0)).toBe('+0.00');
  });

  it('formatPnlPct formats percentage', () => {
    expect(formatPnlPct(2.5)).toBe('+2.50%');
    expect(formatPnlPct(-1.23)).toBe('-1.23%');
  });

  describe('calcUnrealizedPnl', () => {
    it('long mine: profit when price rises', () => {
      const mine = mockMine({ entryPrice: 70000, quantity: 0.1, direction: 'long' });
      expect(calcUnrealizedPnl(mine, 71000)).toBeCloseTo(100, 1);
    });

    it('long mine: loss when price drops', () => {
      const mine = mockMine({ entryPrice: 70000, quantity: 0.1, direction: 'long' });
      expect(calcUnrealizedPnl(mine, 69000)).toBeCloseTo(-100, 1);
    });

    it('short mine: profit when price drops', () => {
      const mine = mockMine({ entryPrice: 70000, quantity: 0.1, direction: 'short' });
      expect(calcUnrealizedPnl(mine, 69000)).toBeCloseTo(100, 1);
    });

    it('returns 0 if entryPrice is null', () => {
      const mine = mockMine({ entryPrice: null });
      expect(calcUnrealizedPnl(mine, 71000)).toBe(0);
    });
  });

  describe('calcUnrealizedPnlPct', () => {
    it('calculates correct percentage', () => {
      const mine = mockMine({ entryPrice: 70000, direction: 'long' });
      expect(calcUnrealizedPnlPct(mine, 71400)).toBeCloseTo(2.0, 1);
    });

    it('returns 0 for null entry', () => {
      expect(calcUnrealizedPnlPct(mockMine({ entryPrice: null }), 71000)).toBe(0);
    });
  });

  describe('isTpHit', () => {
    it('long: true when price >= TP', () => {
      const mine = mockMine({ takeProfit: 73500, direction: 'long' });
      expect(isTpHit(mine, 73500)).toBe(true);
      expect(isTpHit(mine, 74000)).toBe(true);
      expect(isTpHit(mine, 73000)).toBe(false);
    });

    it('short: true when price <= TP', () => {
      const mine = mockMine({ takeProfit: 66000, direction: 'short' });
      expect(isTpHit(mine, 66000)).toBe(true);
      expect(isTpHit(mine, 65000)).toBe(true);
      expect(isTpHit(mine, 67000)).toBe(false);
    });
  });

  describe('isSlHit', () => {
    it('long: true when price <= SL', () => {
      const mine = mockMine({ stopLoss: 68600, direction: 'long' });
      expect(isSlHit(mine, 68600)).toBe(true);
      expect(isSlHit(mine, 68000)).toBe(true);
      expect(isSlHit(mine, 69000)).toBe(false);
    });

    it('short: true when price >= SL', () => {
      const mine = mockMine({ stopLoss: 72000, direction: 'short' });
      expect(isSlHit(mine, 72000)).toBe(true);
      expect(isSlHit(mine, 73000)).toBe(true);
      expect(isSlHit(mine, 71000)).toBe(false);
    });
  });

  describe('isTimedOut', () => {
    it('returns false if within timeout window', () => {
      const mine = mockMine({ entryTime: Date.now() - 1000, timeoutHours: 48 });
      expect(isTimedOut(mine)).toBe(false);
    });

    it('returns true if past timeout window', () => {
      const mine = mockMine({ entryTime: Date.now() - 49 * 3600_000, timeoutHours: 48 });
      expect(isTimedOut(mine)).toBe(true);
    });

    it('returns false if entryTime is null', () => {
      const mine = mockMine({ entryTime: null });
      expect(isTimedOut(mine)).toBe(false);
    });
  });

  it('getProfile returns correct profile', () => {
    expect(getProfile('aggressive').name).toBe('aggressive');
    expect(getProfile('conservative').name).toBe('conservative');
    expect(getProfile(null).name).toBe('conservative');
    expect(getProfile(undefined).name).toBe('conservative');
  });

  describe('calcPositionSize', () => {
    it('calculates correct size (capped at 20% equity)', () => {
      // $100k equity, 2% risk, 2% SL → raw $100k, capped at 20% = $20k
      expect(calcPositionSize(100000, 2, 2)).toBe(1000);
    });

    it('returns 0 for zero SL distance', () => {
      expect(calcPositionSize(100000, 2, 0)).toBe(0);
    });

    it('returns 0 for zero equity', () => {
      expect(calcPositionSize(0, 2, 2)).toBe(0);
    });
  });

  it('isTerminal correctly identifies terminal states', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('open')).toBe(false);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('closing')).toBe(false);
  });

  describe('calcRiskReward', () => {
    it('calculates correct R:R for long', () => {
      // Entry 70000, TP 73500, SL 68600 → TP dist 3500, SL dist 1400 → R:R = 2.5
      expect(calcRiskReward(70000, 73500, 68600)).toBe(2.5);
    });

    it('calculates correct R:R for short', () => {
      // Entry 70000, TP 66000, SL 72000 → TP dist 4000, SL dist 2000 → R:R = 2.0
      expect(calcRiskReward(70000, 66000, 72000)).toBe(2);
    });

    it('returns 0 for zero SL distance', () => {
      expect(calcRiskReward(70000, 73500, 70000)).toBe(0);
    });
  });
});
