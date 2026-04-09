// ═══════════════════════════════════════════════════════════════
// Phase 4 — Mine Engine Constants
// ═══════════════════════════════════════════════════════════════

import type { AggressivenessProfile, CapitalProfile } from './types';

// ─── Capital Profiles ─────────────────────────────────────────

export const PROFILES: Record<AggressivenessProfile, CapitalProfile> = {
  conservative: {
    name: 'conservative',
    maxPortfolioRiskPct: 5,
    maxSingleMineRiskPct: 1,
    maxConcurrentMines: 3,
    maxMinesPerAsset: 1,
    slMultiplier: 1.5,
    tpMultiplier: 2.0,
    minConfidence: 0.7,
    trailingStopActivationPct: 3,
    trailingStopDistancePct: 1.5,
    timeoutHours: 48,
  },
  moderate: {
    name: 'moderate',
    maxPortfolioRiskPct: 10,
    maxSingleMineRiskPct: 2,
    maxConcurrentMines: 5,
    maxMinesPerAsset: 2,
    slMultiplier: 1.2,
    tpMultiplier: 2.5,
    minConfidence: 0.55,
    trailingStopActivationPct: 2,
    trailingStopDistancePct: 1,
    timeoutHours: 72,
  },
  aggressive: {
    name: 'aggressive',
    maxPortfolioRiskPct: 20,
    maxSingleMineRiskPct: 4,
    maxConcurrentMines: 8,
    maxMinesPerAsset: 3,
    slMultiplier: 1.0,
    tpMultiplier: 3.0,
    minConfidence: 0.4,
    trailingStopActivationPct: 1.5,
    trailingStopDistancePct: 0.8,
    timeoutHours: 96,
  },
};

// ─── Redis Keys ───────────────────────────────────────────────

export const MINE_KEYS = {
  mine: (id: string) => `nexus:mine:${id}`,
  activeMines: (symbol: string) => `nexus:mines:active:${symbol}`,
  minesByStatus: (status: string) => `nexus:mines:status:${status}`,
  history: (symbol: string) => `nexus:mines:history:${symbol}`,
  configProfile: 'nexus:config:profile',
  engineEnabled: 'nexus:mine-engine:enabled',
  engineLastTick: 'nexus:mine-engine:last-tick',
  engineLastError: 'nexus:mine-engine:last-error',
  portfolioSnapshot: 'nexus:portfolio:snapshot',
  feedback: (symbol: string) => `nexus:feedback:${symbol}`,
} as const;

// ─── Defaults ─────────────────────────────────────────────────

export const DEFAULT_PROFILE: AggressivenessProfile = 'conservative';

export const MINE_TTL_SECONDS = 7 * 24 * 3600; // 7 days

export const MAX_HISTORY_PER_ASSET = 100;

export const MACRO_BLACKOUT_MS = 2 * 3600 * 1000; // 2h before high-impact event

export const MIN_TP_SL_RATIO = 1.5;

export const SUPPORTED_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD'] as const;
