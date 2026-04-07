// ═══════════════════════════════════════════════════════════════
// AssetAnalytic — orchestratore per asset (Phase 1: stub)
// ═══════════════════════════════════════════════════════════════

import type {
  AssetAnalytic as AssetAnalyticState,
  AssetClass,
  AnalyticReport,
  ReactionZone,
} from './types';

const NOT_IMPL = 'Not implemented in Phase 1';

export class AssetAnalytic {
  readonly symbol: string;
  readonly assetClass: AssetClass;

  constructor(symbol: string, assetClass: AssetClass) {
    this.symbol = symbol;
    this.assetClass = assetClass;
  }

  /** Avvia il training completo: download, analisi, mining, profiling, finalize. */
  async train(): Promise<void> {
    throw new Error(NOT_IMPL);
  }

  /** Refresh on-demand del report (idempotente). */
  async refresh(): Promise<void> {
    throw new Error(NOT_IMPL);
  }

  /** Tick di osservazione live (chiamato dal cron). */
  async observeLive(): Promise<void> {
    throw new Error(NOT_IMPL);
  }

  /** Carica l'AnalyticReport completo dalla persistenza. */
  async getReport(): Promise<AnalyticReport | null> {
    throw new Error(NOT_IMPL);
  }

  /** Restituisce le reaction zones live. */
  async getReactionZones(): Promise<ReactionZone[]> {
    throw new Error(NOT_IMPL);
  }

  /** Stato corrente dell'AI Analytic. */
  async getStatus(): Promise<AssetAnalyticState> {
    throw new Error(NOT_IMPL);
  }
}
