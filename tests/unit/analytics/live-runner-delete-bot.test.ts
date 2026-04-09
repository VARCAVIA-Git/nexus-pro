import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, any>();
const setStore = new Map<string, Set<string>>();

vi.mock('@/lib/db/redis', () => ({
  KEYS: {
    notifications: 'nexus:notifications',
    notifUnread: 'nexus:notif_unread_count',
    trades: 'nexus:trades',
    signals: 'nexus:signal_log',
    botConfig: 'nexus:bot_config',
    botState: 'nexus:bot_state',
    performance: 'nexus:performance',
  },
  async redisGet<T>(key: string): Promise<T | null> {
    return store.get(key) ?? null;
  },
  async redisSet(key: string, value: unknown) {
    store.set(key, value);
  },
  async redisDel(key: string) {
    store.delete(key);
  },
  async redisLpush() {},
  async redisLrange() { return []; },
  async redisLlen() { return 0; },
  async redisSAdd(key: string, member: string) {
    const s = setStore.get(key) ?? new Set<string>();
    s.add(member);
    setStore.set(key, s);
    return 1;
  },
  async redisSRem(key: string, member: string) {
    const s = setStore.get(key);
    if (!s) return 0;
    return s.delete(member) ? 1 : 0;
  },
  async redisSMembers(key: string) {
    return Array.from(setStore.get(key) ?? []);
  },
  async redisPing() { return true; },
}));

// Avoid loading the broker / Alpaca network code by mocking the modules
// imported by live-runner that we don't exercise here.
vi.mock('@/lib/broker/alpaca', () => ({
  AlpacaBroker: class {},
}));

beforeEach(() => {
  store.clear();
  setStore.clear();
});

describe('deleteBot — Phase 4 Redis-first cleanup', () => {
  it('removes bot from Redis nexus:bot_config even when in-memory map is empty', async () => {
    // Pre-populate Redis with two bots (simulating state after PM2 restart:
    // in-memory `bots` is empty, but Redis still has the configs).
    store.set('nexus:bot_config', [
      { id: 'bot-a', name: 'BTC AGGRESSIVO', status: 'running', assets: [], strategies: [], capitalPercent: 20, environment: 'demo', riskLevel: 5, stats: {} },
      { id: 'bot-b', name: 'BTC TRANQUILLO', status: 'running', assets: [], strategies: [], capitalPercent: 20, environment: 'demo', riskLevel: 5, stats: {} },
    ]);

    const { deleteBot } = await import('@/lib/analytics/action/live-runner');
    const result = await deleteBot('bot-a');
    expect(result.ok).toBe(true);

    const remaining = store.get('nexus:bot_config') as any[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('bot-b');
  });

  it('also deletes nexus:bot:state:{id}', async () => {
    store.set('nexus:bot_config', [
      { id: 'bot-x', name: 'X', status: 'stopped', assets: [], strategies: [], capitalPercent: 10, environment: 'demo', riskLevel: 5, stats: {} },
    ]);
    store.set('nexus:bot:state:bot-x', { positions: [], closedTrades: [] });

    const { deleteBot } = await import('@/lib/analytics/action/live-runner');
    await deleteBot('bot-x');
    expect(store.has('nexus:bot:state:bot-x')).toBe(false);
  });

  it('removes bot from nexus:bot_legacy_disabled set', async () => {
    store.set('nexus:bot_config', [
      { id: 'bot-z', name: 'Z', status: 'stopped', assets: [], strategies: [], capitalPercent: 10, environment: 'demo', riskLevel: 5, stats: {} },
    ]);
    setStore.set('nexus:bot_legacy_disabled', new Set(['bot-z', 'other']));

    const { deleteBot } = await import('@/lib/analytics/action/live-runner');
    await deleteBot('bot-z');
    expect(setStore.get('nexus:bot_legacy_disabled')?.has('bot-z')).toBe(false);
    expect(setStore.get('nexus:bot_legacy_disabled')?.has('other')).toBe(true);
  });

  it('idempotent: deleting non-existent bot returns ok and does not throw', async () => {
    store.set('nexus:bot_config', [
      { id: 'bot-c', name: 'C', status: 'stopped', assets: [], strategies: [], capitalPercent: 10, environment: 'demo', riskLevel: 5, stats: {} },
    ]);
    const { deleteBot } = await import('@/lib/analytics/action/live-runner');
    const result = await deleteBot('bot-not-existing');
    expect(result.ok).toBe(true);
    // bot-c still there
    expect((store.get('nexus:bot_config') as any[])).toHaveLength(1);
  });

  it('getAllBots reads from Redis (single source of truth)', async () => {
    store.set('nexus:bot_config', [
      { id: 'bot-1', name: 'A', status: 'running', assets: [], strategies: [], capitalPercent: 10, environment: 'demo', riskLevel: 5, stats: {} },
      { id: 'bot-2', name: 'B', status: 'stopped', assets: [], strategies: [], capitalPercent: 10, environment: 'demo', riskLevel: 5, stats: {} },
    ]);
    const { getAllBots } = await import('@/lib/analytics/action/live-runner');
    const all = await getAllBots();
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.id).sort()).toEqual(['bot-1', 'bot-2']);
  });
});
