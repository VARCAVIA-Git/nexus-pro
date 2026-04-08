// ═══════════════════════════════════════════════════════════════
// Mine Manager — gestione lifecycle delle Mine (Phase 1: stub)
// ═══════════════════════════════════════════════════════════════

import type { Mine, MineCandidate } from '../types';

const NOT_IMPL = 'Not implemented in Phase 1';

/** Crea una nuova Mine a partire da una candidate generata da una Strategy. */
export async function createMine(strategyId: string, candidate: MineCandidate): Promise<Mine> {
  void strategyId;
  void candidate;
  throw new Error(NOT_IMPL);
}

/** Cancella tutte le mine il cui TTL è scaduto. Ritorna il numero cancellate. */
export async function cancelExpiredMines(): Promise<number> {
  throw new Error(NOT_IMPL);
}

/** Sincronizza lo stato della Mine con il broker (fill/cancel/expire). */
export async function syncMineState(mine: Mine): Promise<Mine> {
  void mine;
  throw new Error(NOT_IMPL);
}
