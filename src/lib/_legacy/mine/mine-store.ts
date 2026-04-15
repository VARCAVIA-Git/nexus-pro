// ═══════════════════════════════════════════════════════════════
// Phase 4 — Mine Store (Redis CRUD)
//
// All mine state lives in Redis. In-memory is stateless.
// Keys:
//   nexus:mine:{id}              → JSON Mine (TTL 7d)
//   nexus:mines:active:{symbol}  → Set<mine_id>
//   nexus:mines:status:{status}  → Set<mine_id>
//   nexus:mines:history:{symbol} → List<JSON Mine> (max 100)
//   nexus:portfolio:snapshot     → JSON PortfolioSnapshot
//   nexus:config:profile         → AggressivenessProfile string
//   nexus:mine-engine:enabled    → "true" | "false"
// ═══════════════════════════════════════════════════════════════

import {
  redisSet,
  redisGet,
  redisDel,
  redisSAdd,
  redisSRem,
  redisSMembers,
  redisLpush,
  redisLrange,
  redisGetRaw,
  redisSetRaw,
} from '@/lib/db/redis';
import type {
  Mine,
  MineStatus,
  MineOutcome,
  PortfolioSnapshot,
  AggressivenessProfile,
  MineEngineState,
} from './types';
import { MINE_KEYS, MINE_TTL_SECONDS, MAX_HISTORY_PER_ASSET, DEFAULT_PROFILE } from './constants';
import { generateMineId } from './utils';

// ─── Mine CRUD ────────────────────────────────────────────────

/** Create a new mine in Redis. Returns the mine with generated id + timestamps. */
export async function createMine(
  partial: Omit<Mine, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Mine> {
  const now = Date.now();
  const mine: Mine = {
    ...partial,
    id: generateMineId(),
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    redisSet(MINE_KEYS.mine(mine.id), mine, MINE_TTL_SECONDS),
    redisSAdd(MINE_KEYS.activeMines(mine.symbol), mine.id),
    redisSAdd(MINE_KEYS.minesByStatus(mine.status), mine.id),
  ]);

  return mine;
}

/** Get a single mine by id. */
export async function getMine(id: string): Promise<Mine | null> {
  return redisGet<Mine>(MINE_KEYS.mine(id));
}

/** Update a mine in Redis. Handles status index migration. */
export async function updateMine(
  id: string,
  updates: Partial<Mine>,
): Promise<Mine | null> {
  const existing = await getMine(id);
  if (!existing) return null;

  const oldStatus = existing.status;
  const updated: Mine = {
    ...existing,
    ...updates,
    id: existing.id,       // prevent id overwrite
    updatedAt: Date.now(),
  };

  const ops: Promise<unknown>[] = [
    redisSet(MINE_KEYS.mine(id), updated, MINE_TTL_SECONDS),
  ];

  // Migrate status index if status changed
  if (updates.status && updates.status !== oldStatus) {
    ops.push(
      redisSRem(MINE_KEYS.minesByStatus(oldStatus), id),
      redisSAdd(MINE_KEYS.minesByStatus(updates.status), id),
    );
  }

  await Promise.all(ops);
  return updated;
}

/** Get all active (non-terminal) mines, optionally filtered by symbol. */
export async function getActiveMines(symbol?: string): Promise<Mine[]> {
  let ids: string[];

  if (symbol) {
    ids = await redisSMembers(MINE_KEYS.activeMines(symbol));
  } else {
    // Union of waiting + pending + open + closing status sets
    const [waiting, pending, open, closing] = await Promise.all([
      redisSMembers(MINE_KEYS.minesByStatus('waiting')),
      redisSMembers(MINE_KEYS.minesByStatus('pending')),
      redisSMembers(MINE_KEYS.minesByStatus('open')),
      redisSMembers(MINE_KEYS.minesByStatus('closing')),
    ]);
    ids = [...new Set([...waiting, ...pending, ...open, ...closing])];
  }

  if (ids.length === 0) return [];

  const mines = await Promise.all(ids.map((id) => getMine(id)));
  return mines.filter((m): m is Mine => m != null && m.status !== 'closed' && m.status !== 'cancelled' && m.status !== 'expired');
}

/** Close a mine: update status, record outcome, move to history. */
export async function closeMine(
  id: string,
  outcome: MineOutcome,
  exitPrice: number,
): Promise<Mine | null> {
  const mine = await getMine(id);
  if (!mine) return null;

  const now = Date.now();
  const entryPrice = mine.entryPrice ?? 0;
  const multiplier = mine.direction === 'long' ? 1 : -1;
  const realizedPnl = (exitPrice - entryPrice) * multiplier * mine.quantity;

  const closed: Mine = {
    ...mine,
    status: 'closed',
    outcome,
    exitPrice,
    exitTime: now,
    realizedPnl,
    updatedAt: now,
    notes: [...mine.notes, `closed: ${outcome} @ ${exitPrice}`],
  };

  await Promise.all([
    redisSet(MINE_KEYS.mine(id), closed, MINE_TTL_SECONDS),
    // Remove from active set
    redisSRem(MINE_KEYS.activeMines(mine.symbol), id),
    // Migrate status index
    redisSRem(MINE_KEYS.minesByStatus(mine.status), id),
    redisSAdd(MINE_KEYS.minesByStatus('closed'), id),
    // Push to history (FIFO, max 100)
    redisLpush(MINE_KEYS.history(mine.symbol), closed, MAX_HISTORY_PER_ASSET),
  ]);

  return closed;
}

/** Get mine history for an asset (most recent first). */
export async function getMineHistory(
  symbol: string,
  limit: number = 20,
): Promise<Mine[]> {
  return redisLrange<Mine>(MINE_KEYS.history(symbol), 0, limit - 1);
}

// ─── Portfolio Snapshot ───────────────────────────────────────

export async function savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
  await redisSet(MINE_KEYS.portfolioSnapshot, snapshot);
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot | null> {
  return redisGet<PortfolioSnapshot>(MINE_KEYS.portfolioSnapshot);
}

// ─── Engine State ─────────────────────────────────────────────

export async function isEngineEnabled(): Promise<boolean> {
  const val = await redisGetRaw(MINE_KEYS.engineEnabled);
  return val === 'true';
}

export async function setEngineEnabled(enabled: boolean): Promise<void> {
  await redisSetRaw(MINE_KEYS.engineEnabled, enabled ? 'true' : 'false');
}

export async function getEngineState(): Promise<MineEngineState> {
  const [enabled, lastTick, lastError] = await Promise.all([
    isEngineEnabled(),
    redisGetRaw(MINE_KEYS.engineLastTick),
    redisGetRaw(MINE_KEYS.engineLastError),
  ]);

  const activeMines = await getActiveMines();

  return {
    enabled,
    lastTick: lastTick ? Number(lastTick) : null,
    lastError: lastError || null,
    activeMinesCount: activeMines.length,
  };
}

export async function updateEngineTick(error?: string): Promise<void> {
  const now = String(Date.now());
  await redisSetRaw(MINE_KEYS.engineLastTick, now);
  if (error) {
    await redisSetRaw(MINE_KEYS.engineLastError, error);
  }
}

// ─── Profile Config ───────────────────────────────────────────

export async function getActiveProfile(): Promise<AggressivenessProfile> {
  const val = await redisGetRaw(MINE_KEYS.configProfile);
  if (val === 'conservative' || val === 'moderate' || val === 'aggressive') return val;
  return DEFAULT_PROFILE;
}

export async function setActiveProfile(profile: AggressivenessProfile): Promise<void> {
  await redisSetRaw(MINE_KEYS.configProfile, profile);
}
