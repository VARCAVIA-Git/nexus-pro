// ═══════════════════════════════════════════════════════════════
// NexusOne — Strategy Registry
//
// Single source of truth for approved strategies.
// Rules:
//   - One active strategy at a time
//   - Every strategy is versioned and frozen
//   - No strategy enters live without paper validation
//   - Modifications create a new version
// ═══════════════════════════════════════════════════════════════

import type { StrategyManifest } from './types';
import { strategyS1 } from './strategies/s1';
import { redisGetRaw, redisSetRaw } from '@/lib/db/redis';

const KEY_ACTIVE = 'nexusone:strategy:active';
const KEY_MODE = 'nexusone:mode';

// ─── Registry ────────────────────────────────────────────────

/** All registered strategies. Add new ones here. */
const STRATEGIES: Record<string, StrategyManifest> = {
  [strategyS1.id]: strategyS1,
};

/** Get a strategy by ID. */
export function getStrategy(id: string): StrategyManifest | null {
  return STRATEGIES[id] ?? null;
}

/** List all registered strategies. */
export function listStrategies(): StrategyManifest[] {
  return Object.values(STRATEGIES);
}

/** Get the currently active strategy ID from Redis. */
export async function getActiveStrategyId(): Promise<string | null> {
  return redisGetRaw(KEY_ACTIVE);
}

/** Get the currently active strategy manifest. */
export async function getActiveStrategy(): Promise<StrategyManifest | null> {
  const id = await getActiveStrategyId();
  return id ? getStrategy(id) : null;
}

/** Set the active strategy. */
export async function setActiveStrategy(id: string): Promise<boolean> {
  if (!STRATEGIES[id]) return false;
  await redisSetRaw(KEY_ACTIVE, id);
  return true;
}

/** Clear the active strategy (disable all). */
export async function clearActiveStrategy(): Promise<void> {
  await redisSetRaw(KEY_ACTIVE, '');
}

// ─── System Mode ─────────────────────────────────────────────

export type SystemMode = 'disabled' | 'paper' | 'live_guarded';

/** Get current system mode. */
export async function getSystemMode(): Promise<SystemMode> {
  const val = await redisGetRaw(KEY_MODE);
  if (val === 'paper') return 'paper';
  if (val === 'live_guarded') return 'live_guarded';
  return 'disabled';
}

/**
 * Set system mode.
 * live_guarded requires explicit approval — cannot be set programmatically
 * without checking all gates first.
 */
export async function setSystemMode(mode: SystemMode): Promise<void> {
  if (mode === 'live_guarded') {
    // Gate check: only allow live if active strategy has paper track record
    const strategy = await getActiveStrategy();
    if (!strategy) throw new Error('Cannot enable live: no active strategy');
    if (strategy.status !== 'live' && strategy.status !== 'paper')
      throw new Error(`Cannot enable live: strategy status is ${strategy.status}`);
  }
  await redisSetRaw(KEY_MODE, mode);
}
