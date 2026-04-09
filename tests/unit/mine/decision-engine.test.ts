import { describe, it, expect } from 'vitest';
import { monitorMines, evaluateSignals } from '@/lib/mine/decision-engine';
import { checkRisk } from '@/lib/mine/risk-manager';
import type { Mine, CapitalProfile, DetectedSignal } from '@/lib/mine/types';
import type { LiveContext } from '@/lib/analytics/types';
import { PROFILES } from '@/lib/mine/constants';

// ─── Helpers ──────────────────────────────────────────────────

const moderateProfile: CapitalProfile = PROFILES.moderate;

function mockMine(overrides: Partial<Mine> = {}): Mine {
  return {
    id: 'mine-1',
    symbol: 'BTC/USD',
    status: 'open',
    strategy: 'reversion',
    timeframe: '1h',
    direction: 'long',
    entrySignal: { type: 'zone_bounce', confidence: 0.7, macroClear: true },
    entryPrice: 70000,
    entryTime: Date.now() - 3600_000,
    entryOrderId: 'ord-1',
    takeProfit: 73500,
    stopLoss: 68600,
    trailingStopPct: null,
    timeoutHours: 72,
    profile: 'moderate',
    allocatedCapital: 2000,
    quantity: 0.0286,
    unrealizedPnl: 0,
    maxUnrealizedPnl: 0,
    ticksMonitored: 10,
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

function mockLive(price: number): LiveContext {
  return {
    updatedAt: Date.now(),
    price,
    regime: 'RANGING',
    activeRules: [],
    nearestZones: [],
    momentumScore: 0,
    volatilityPercentile: 50,
  };
}

function mockSignal(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    symbol: 'BTC/USD',
    signal: { type: 'zone_bounce', confidence: 0.7, macroClear: true },
    suggestedStrategy: 'reversion',
    suggestedTimeframe: '1h',
    suggestedDirection: 'long',
    suggestedTp: 73500,
    suggestedSl: 68600,
    ...overrides,
  };
}

// ─── monitorMines ─────────────────────────────────────────────

describe('monitorMines', () => {
  it('detects TP hit for long mine', () => {
    const actions = monitorMines(
      [mockMine({ takeProfit: 73500, direction: 'long' })],
      new Map([['BTC/USD', mockLive(74000)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('close_mine');
    if (actions[0].type === 'close_mine') {
      expect(actions[0].reason).toBe('tp_hit');
    }
  });

  it('detects SL hit for long mine', () => {
    const actions = monitorMines(
      [mockMine({ stopLoss: 68600, direction: 'long' })],
      new Map([['BTC/USD', mockLive(68000)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(1);
    if (actions[0].type === 'close_mine') {
      expect(actions[0].reason).toBe('sl_hit');
    }
  });

  it('detects TP hit for short mine', () => {
    const actions = monitorMines(
      [mockMine({ takeProfit: 66000, stopLoss: 72000, direction: 'short', entryPrice: 70000 })],
      new Map([['BTC/USD', mockLive(65500)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(1);
    if (actions[0].type === 'close_mine') {
      expect(actions[0].reason).toBe('tp_hit');
    }
  });

  it('detects timeout', () => {
    const pastEntry = Date.now() - 73 * 3600_000; // 73h ago, timeout is 72h
    const actions = monitorMines(
      [mockMine({ entryTime: pastEntry, timeoutHours: 72 })],
      new Map([['BTC/USD', mockLive(70500)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(1);
    if (actions[0].type === 'close_mine') {
      expect(actions[0].reason).toBe('timeout');
    }
  });

  it('no action when price between TP and SL', () => {
    const actions = monitorMines(
      [mockMine()],
      new Map([['BTC/USD', mockLive(71000)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(0);
  });

  it('skips non-open mines', () => {
    const actions = monitorMines(
      [mockMine({ status: 'pending' })],
      new Map([['BTC/USD', mockLive(74000)]]),
      moderateProfile,
    );
    expect(actions).toHaveLength(0);
  });

  it('activates trailing stop when profit threshold reached', () => {
    const actions = monitorMines(
      [mockMine({ entryPrice: 70000, direction: 'long' })],
      new Map([['BTC/USD', mockLive(71500)]]), // +2.14%, > moderate's 2% activation
      moderateProfile,
    );
    const adjust = actions.find((a) => a.type === 'adjust_sl');
    expect(adjust).toBeDefined();
    if (adjust?.type === 'adjust_sl') {
      expect(adjust.newSl).toBeGreaterThan(68600); // tighter than original SL
    }
  });
});

// ─── checkRisk ────────────────────────────────────────────────

describe('checkRisk', () => {
  it('allows signal when all checks pass', () => {
    const result = checkRisk(mockSignal(), moderateProfile, 100000, [], []);
    expect(result.allowed).toBe(true);
    expect(result.quantity).toBeGreaterThan(0);
    expect(result.allocatedCapital).toBeGreaterThan(0);
  });

  it('rejects low confidence', () => {
    const signal = mockSignal({
      signal: { type: 'zone_bounce', confidence: 0.3, macroClear: true },
    });
    const result = checkRisk(signal, moderateProfile, 100000, [], []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('confidence');
  });

  it('rejects when max concurrent mines reached', () => {
    const mines = Array.from({ length: 5 }, (_, i) =>
      mockMine({ id: `mine-${i}` }),
    );
    const result = checkRisk(mockSignal(), moderateProfile, 100000, mines, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('concurrent');
  });

  it('rejects when max mines per asset reached', () => {
    const assetMines = [mockMine({ id: 'mine-1' }), mockMine({ id: 'mine-2' })];
    const result = checkRisk(mockSignal(), moderateProfile, 100000, assetMines, assetMines);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per asset');
  });

  it('conservative requires higher confidence than moderate', () => {
    const signal = mockSignal({
      signal: { type: 'zone_bounce', confidence: 0.6, macroClear: true },
    });
    const modResult = checkRisk(signal, PROFILES.moderate, 100000, [], []);
    const conResult = checkRisk(signal, PROFILES.conservative, 100000, [], []);
    expect(modResult.allowed).toBe(true);
    expect(conResult.allowed).toBe(false);
  });
});

// ─── evaluateSignals ──────────────────────────────────────────

describe('evaluateSignals', () => {
  it('produces open_mine action for valid signal', () => {
    const actions = evaluateSignals([mockSignal()], moderateProfile, 100000, []);
    const open = actions.find((a) => a.type === 'open_mine');
    expect(open).toBeDefined();
    if (open?.type === 'open_mine') {
      expect(open.mine.symbol).toBe('BTC/USD');
      expect(open.mine.direction).toBe('long');
      expect(open.mine.status).toBe('pending');
      expect(open.mine.quantity).toBeGreaterThan(0);
    }
  });

  it('produces no_action for rejected signal', () => {
    const signal = mockSignal({
      signal: { type: 'zone_bounce', confidence: 0.3, macroClear: true },
    });
    const actions = evaluateSignals([signal], moderateProfile, 100000, []);
    expect(actions.find((a) => a.type === 'open_mine')).toBeUndefined();
    expect(actions.find((a) => a.type === 'no_action')).toBeDefined();
  });

  it('respects max concurrent mines across multiple signals', () => {
    const existingMines = Array.from({ length: 4 }, (_, i) =>
      mockMine({ id: `mine-${i}`, symbol: `ASSET-${i}/USD` }),
    );
    const signals = [
      mockSignal({ symbol: 'ETH/USD' }),
      mockSignal({ symbol: 'SOL/USD' }),
    ];
    const actions = evaluateSignals(signals, moderateProfile, 100000, existingMines);
    const opens = actions.filter((a) => a.type === 'open_mine');
    // moderate allows 5 max, 4 existing → only 1 new
    expect(opens.length).toBe(1);
  });
});
