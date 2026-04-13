import { describe, it, expect } from 'vitest';
import { monitorMines, evaluateSignals, applyAICGates } from '@/lib/mine/decision-engine';
import type { AICContext } from '@/lib/mine/decision-engine';
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
    const mines = Array.from({ length: 10 }, (_, i) =>
      mockMine({ id: `mine-${i}` }),
    );
    const result = checkRisk(mockSignal(), moderateProfile, 100000, mines, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('concurrent');
  });

  it('rejects when max mines per asset reached', () => {
    const assetMines = Array.from({ length: 4 }, (_, i) => mockMine({ id: `mine-${i}` }));
    const result = checkRisk(mockSignal(), moderateProfile, 100000, assetMines, assetMines);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per asset');
  });

  it('conservative requires higher confidence than moderate', () => {
    const signal = mockSignal({
      signal: { type: 'zone_bounce', confidence: 0.42, macroClear: true },
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
    const existingMines = Array.from({ length: 7 }, (_, i) =>
      mockMine({ id: `mine-${i}`, symbol: `ASSET-${i}/USD` }),
    );
    const signals = [
      mockSignal({ symbol: 'ETH/USD' }),
      mockSignal({ symbol: 'SOL/USD' }),
    ];
    const actions = evaluateSignals(signals, moderateProfile, 100000, existingMines);
    const opens = actions.filter((a) => a.type === 'open_mine');
    // moderate allows 8 max, 7 existing → only 1 new
    expect(opens.length).toBe(1);
  });
});

// ─── AIC Gates (Phase 4.5) ───────────────────────────────────

describe('applyAICGates', () => {
  it('CHOP regime reduces confidence by 30%', () => {
    const result = applyAICGates(mockSignal({ signal: { type: 'zone_bounce', confidence: 0.8, macroClear: true } }), { regime: 'CHOP' });
    expect(result.rejected).toBe(false);
    expect(result.confidence).toBeCloseTo(0.56, 1);
  });

  it('ACCUMULATION blocks SHORT', () => {
    const result = applyAICGates(
      mockSignal({ suggestedDirection: 'short' }),
      { regime: 'ACCUMULATION' },
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('ACCUMULATION');
  });

  it('DISTRIBUTION blocks LONG', () => {
    const result = applyAICGates(
      mockSignal({ suggestedDirection: 'long' }),
      { regime: 'DISTRIBUTION' },
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('DISTRIBUTION');
  });

  it('BULL gives +10% bonus to LONG', () => {
    const result = applyAICGates(
      mockSignal({ signal: { type: 'zone_bounce', confidence: 0.7, macroClear: true }, suggestedDirection: 'long' }),
      { regime: 'BULL' },
    );
    expect(result.confidence).toBeCloseTo(0.77, 1);
  });

  it('confluence BEARISH rejects LONG', () => {
    const result = applyAICGates(
      mockSignal({ suggestedDirection: 'long' }),
      { confluence: { bias: 'BEARISH', score: 0.8, bull_score: 0.2, bear_score: 0.7, bullish_tfs: [], bearish_tfs: ['4h'], neutral_tfs: [], aligned_count: 1, tf_biases: {} } },
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('confluence');
  });

  it('low confluence score reduces confidence', () => {
    const result = applyAICGates(
      mockSignal({ signal: { type: 'zone_bounce', confidence: 0.8, macroClear: true }, suggestedDirection: 'long' }),
      { confluence: { bias: 'BULLISH', score: 0.3, bull_score: 0.3, bear_score: 0.2, bullish_tfs: ['4h'], bearish_tfs: [], neutral_tfs: [], aligned_count: 1, tf_biases: {} } },
    );
    expect(result.confidence).toBeCloseTo(0.64, 1); // 0.8 * 0.8
  });

  it('LONG_CROWDED funding reduces confidence for LONG', () => {
    const result = applyAICGates(
      mockSignal({ signal: { type: 'zone_bounce', confidence: 0.8, macroClear: true }, suggestedDirection: 'long' }),
      { research: { funding_rate_current: 0.05, funding_sentiment: 'LONG_CROWDED', open_interest: 50000, fear_greed_index: 60, fear_greed_label: 'Greed', news_sentiment: 'NEUTRAL', total_liquidations_24h_usd: 100000000 } },
    );
    expect(result.confidence).toBeCloseTo(0.68, 1); // 0.8 * 0.85
  });

  it('scorecard rejects setup with WR < 40%', () => {
    const scorecards = new Map([
      ['bad_setup', { setup_name: 'bad_setup', symbol: 'BTC/USD', total_signals: 30, total_executed: 25, wins: 8, losses: 17, timeouts: 0, real_win_rate: 0.32, real_profit_factor: 0.6, avg_pnl_pct: -1.2, avg_confidence: 0.7, confidence_accuracy: 0.38, last_updated: '', last_10_outcomes: [] }],
    ]);
    const signal = { ...mockSignal(), aicSetupName: 'bad_setup' } as any;
    const result = applyAICGates(signal, { scorecards });
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('WR');
  });

  it('evaluateSignals with AIC context applies gates', () => {
    const aicCtx: AICContext = { regime: 'DISTRIBUTION' };
    const actions = evaluateSignals(
      [mockSignal({ suggestedDirection: 'long' })],
      moderateProfile,
      100000,
      [],
      aicCtx,
    );
    expect(actions.find((a) => a.type === 'open_mine')).toBeUndefined();
    expect(actions.find((a) => a.type === 'no_action')).toBeDefined();
  });
});
