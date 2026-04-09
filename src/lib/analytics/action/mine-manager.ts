// ═══════════════════════════════════════════════════════════════
// Mine Manager — DEPRECATED Phase 1 stub
// Phase 4 uses src/lib/mine/ instead. This file is kept for
// backward compatibility only.
// ═══════════════════════════════════════════════════════════════

const NOT_IMPL = 'Deprecated: use src/lib/mine/ (Phase 4)';

export async function createMine(): Promise<never> {
  throw new Error(NOT_IMPL);
}

export async function cancelExpiredMines(): Promise<never> {
  throw new Error(NOT_IMPL);
}

export async function syncMineState(): Promise<never> {
  throw new Error(NOT_IMPL);
}
