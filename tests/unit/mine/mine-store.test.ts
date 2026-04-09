import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── In-memory Redis mock ─────────────────────────────────────

const kv = new Map<string, any>();
const sets = new Map<string, Set<string>>();
const lists = new Map<string, any[]>();

function resetStore() {
  kv.clear();
  sets.clear();
  lists.clear();
}

vi.mock('@/lib/db/redis', () => ({
  async redisSet(key: string, value: unknown, _ttl?: number) {
    kv.set(key, JSON.parse(JSON.stringify(value)));
  },
  async redisGet<T>(key: string): Promise<T | null> {
    const v = kv.get(key);
    return v != null ? (v as T) : null;
  },
  async redisDel(key: string) {
    kv.delete(key);
  },
  async redisSAdd(key: string, member: string): Promise<number> {
    if (!sets.has(key)) sets.set(key, new Set());
    const s = sets.get(key)!;
    if (s.has(member)) return 0;
    s.add(member);
    return 1;
  },
  async redisSRem(key: string, member: string): Promise<number> {
    const s = sets.get(key);
    if (!s || !s.has(member)) return 0;
    s.delete(member);
    return 1;
  },
  async redisSMembers(key: string): Promise<string[]> {
    return [...(sets.get(key) ?? [])];
  },
  async redisLpush(key: string, value: unknown, maxLen = 500) {
    if (!lists.has(key)) lists.set(key, []);
    const l = lists.get(key)!;
    l.unshift(JSON.parse(JSON.stringify(value)));
    while (l.length > maxLen) l.pop();
  },
  async redisLrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const l = lists.get(key) ?? [];
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    return l.slice(start, end) as T[];
  },
  async redisGetRaw(key: string): Promise<string | null> {
    return kv.get(key) ?? null;
  },
  async redisSetRaw(key: string, value: string) {
    kv.set(key, value);
  },
}));

import {
  createMine,
  getMine,
  updateMine,
  getActiveMines,
  closeMine,
  getMineHistory,
  savePortfolioSnapshot,
  getPortfolioSnapshot,
  isEngineEnabled,
  setEngineEnabled,
  getActiveProfile,
  setActiveProfile,
  getEngineState,
  updateEngineTick,
} from '@/lib/mine/mine-store';
import type { Mine, PortfolioSnapshot } from '@/lib/mine/types';

// ─── Helpers ──────────────────────────────────────────────────

function baseMine(): Omit<Mine, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    symbol: 'BTC/USD',
    status: 'pending',
    strategy: 'reversion',
    timeframe: '1h',
    direction: 'long',
    entrySignal: { type: 'zone_bounce', confidence: 0.8, macroClear: true },
    entryPrice: null,
    entryTime: null,
    entryOrderId: null,
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
    notes: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => resetStore());

describe('mine-store CRUD', () => {
  it('createMine stores and returns mine with id+timestamps', async () => {
    const mine = await createMine(baseMine());
    expect(mine.id).toHaveLength(10);
    expect(mine.createdAt).toBeGreaterThan(0);
    expect(mine.updatedAt).toBeGreaterThan(0);
    expect(mine.symbol).toBe('BTC/USD');
  });

  it('getMine retrieves a created mine', async () => {
    const mine = await createMine(baseMine());
    const fetched = await getMine(mine.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(mine.id);
    expect(fetched!.symbol).toBe('BTC/USD');
  });

  it('getMine returns null for non-existent id', async () => {
    expect(await getMine('nonexistent')).toBeNull();
  });

  it('updateMine updates fields and updatedAt', async () => {
    const mine = await createMine(baseMine());
    const updated = await updateMine(mine.id, {
      status: 'open',
      entryPrice: 70000,
      entryTime: Date.now(),
      entryOrderId: 'ord-123',
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('open');
    expect(updated!.entryPrice).toBe(70000);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(mine.updatedAt);
  });

  it('updateMine returns null for non-existent id', async () => {
    expect(await updateMine('nope', { status: 'open' })).toBeNull();
  });

  it('updateMine cannot overwrite id', async () => {
    const mine = await createMine(baseMine());
    const updated = await updateMine(mine.id, { id: 'hacked' } as any);
    expect(updated!.id).toBe(mine.id);
  });
});

describe('mine-store getActiveMines', () => {
  it('returns empty when no mines', async () => {
    const active = await getActiveMines('BTC/USD');
    expect(active).toEqual([]);
  });

  it('returns active mines for a symbol', async () => {
    const m1 = await createMine(baseMine());
    const m2 = await createMine({ ...baseMine(), symbol: 'ETH/USD' });
    await updateMine(m1.id, { status: 'open' });

    const btcMines = await getActiveMines('BTC/USD');
    expect(btcMines.length).toBe(1);
    expect(btcMines[0].id).toBe(m1.id);
  });

  it('returns all active mines when no symbol filter', async () => {
    const m1 = await createMine(baseMine());
    const m2 = await createMine({ ...baseMine(), symbol: 'ETH/USD' });

    const all = await getActiveMines();
    expect(all.length).toBe(2);
  });

  it('excludes closed mines', async () => {
    const mine = await createMine(baseMine());
    await closeMine(mine.id, 'tp_hit', 73500);

    const active = await getActiveMines('BTC/USD');
    expect(active.length).toBe(0);
  });
});

describe('mine-store closeMine', () => {
  it('closes a mine with correct PnL calculation (long)', async () => {
    const mine = await createMine(baseMine());
    await updateMine(mine.id, {
      status: 'open',
      entryPrice: 70000,
      entryTime: Date.now(),
      quantity: 0.1,
    });

    const closed = await closeMine(mine.id, 'tp_hit', 73500);
    expect(closed).not.toBeNull();
    expect(closed!.status).toBe('closed');
    expect(closed!.outcome).toBe('tp_hit');
    expect(closed!.exitPrice).toBe(73500);
    expect(closed!.realizedPnl).toBeCloseTo(350, 0); // (73500-70000)*0.1
    expect(closed!.exitTime).toBeGreaterThan(0);
    expect(closed!.notes).toContain('closed: tp_hit @ 73500');
  });

  it('closes a short mine with correct PnL', async () => {
    const mine = await createMine({ ...baseMine(), direction: 'short' });
    await updateMine(mine.id, {
      status: 'open',
      entryPrice: 70000,
      entryTime: Date.now(),
      quantity: 0.1,
    });

    const closed = await closeMine(mine.id, 'sl_hit', 72000);
    expect(closed).not.toBeNull();
    expect(closed!.realizedPnl).toBeCloseTo(-200, 0); // (72000-70000)*(-1)*0.1
  });

  it('returns null for non-existent mine', async () => {
    expect(await closeMine('nope', 'manual', 70000)).toBeNull();
  });
});

describe('mine-store history', () => {
  it('getMineHistory returns closed mines most-recent-first', async () => {
    const m1 = await createMine(baseMine());
    await updateMine(m1.id, { status: 'open', entryPrice: 70000, quantity: 0.1 });
    await closeMine(m1.id, 'tp_hit', 73000);

    const m2 = await createMine(baseMine());
    await updateMine(m2.id, { status: 'open', entryPrice: 71000, quantity: 0.1 });
    await closeMine(m2.id, 'sl_hit', 69000);

    const history = await getMineHistory('BTC/USD');
    expect(history.length).toBe(2);
    expect(history[0].id).toBe(m2.id); // most recent first
    expect(history[1].id).toBe(m1.id);
  });

  it('getMineHistory respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      const m = await createMine(baseMine());
      await updateMine(m.id, { status: 'open', entryPrice: 70000, quantity: 0.01 });
      await closeMine(m.id, 'timeout', 70000 + i);
    }
    const history = await getMineHistory('BTC/USD', 3);
    expect(history.length).toBe(3);
  });
});

describe('mine-store portfolio snapshot', () => {
  it('save and retrieve portfolio snapshot', async () => {
    const snap: PortfolioSnapshot = {
      equity: 100000,
      buyingPower: 50000,
      totalAllocated: 10000,
      totalUnrealizedPnl: 500,
      minesCount: 2,
      updatedAt: Date.now(),
    };
    await savePortfolioSnapshot(snap);
    const fetched = await getPortfolioSnapshot();
    expect(fetched).not.toBeNull();
    expect(fetched!.equity).toBe(100000);
    expect(fetched!.minesCount).toBe(2);
  });
});

describe('mine-store engine state', () => {
  it('engine defaults to disabled', async () => {
    expect(await isEngineEnabled()).toBe(false);
  });

  it('setEngineEnabled toggles state', async () => {
    await setEngineEnabled(true);
    expect(await isEngineEnabled()).toBe(true);
    await setEngineEnabled(false);
    expect(await isEngineEnabled()).toBe(false);
  });

  it('getEngineState returns full state', async () => {
    await setEngineEnabled(true);
    await updateEngineTick();
    const state = await getEngineState();
    expect(state.enabled).toBe(true);
    expect(state.lastTick).toBeGreaterThan(0);
    expect(state.activeMinesCount).toBe(0);
  });

  it('updateEngineTick records error', async () => {
    await updateEngineTick('test error');
    const state = await getEngineState();
    expect(state.lastError).toBe('test error');
  });
});

describe('mine-store profile config', () => {
  it('defaults to conservative', async () => {
    expect(await getActiveProfile()).toBe('conservative');
  });

  it('setActiveProfile changes profile', async () => {
    await setActiveProfile('aggressive');
    expect(await getActiveProfile()).toBe('aggressive');
  });

  it('invalid value falls back to conservative', async () => {
    kv.set('nexus:config:profile', 'invalid');
    expect(await getActiveProfile()).toBe('conservative');
  });
});
