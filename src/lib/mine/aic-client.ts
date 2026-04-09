// ═══════════════════════════════════════════════════════════════
// Phase 4.5 — AIC Client
//
// HTTP wrapper for Asset Intelligence Core (Python sidecar).
// Per-symbol URL routing: AIC_BTC_URL, AIC_ETH_URL, AIC_SOL_URL.
// Every method catches errors → returns null, never crashes.
// Timeout 5s per call.
// ═══════════════════════════════════════════════════════════════

import type {
  AICSignal,
  AICStatus,
  AICConfluence,
  AICResearch,
  TradeOutcome,
} from './types';

const AIC_TIMEOUT_MS = 5000;

// ─── URL mapping ──────────────────────────────────────────────

const SYMBOL_URL_MAP: Record<string, string> = {
  'BTC/USD': 'AIC_BTC_URL',
  'ETH/USD': 'AIC_ETH_URL',
  'SOL/USD': 'AIC_SOL_URL',
};

function getBaseUrl(symbol: string): string | null {
  const envKey = SYMBOL_URL_MAP[symbol];
  if (!envKey) return null;
  const url = process.env[envKey];
  return url || null;
}

function getToken(): string {
  return process.env.AIC_SECRET_TOKEN ?? '';
}

// ─── HTTP helper ──────────────────────────────────────────────

async function aicFetch<T>(
  symbol: string,
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const baseUrl = getBaseUrl(symbol);
  if (!baseUrl) return null;

  const token = getToken();
  const url = `${baseUrl}${path}${token ? `${path.includes('?') ? '&' : '?'}token=${token}` : ''}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AIC_TIMEOUT_MS);

    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────

/** Get AIC system status for a symbol. */
export async function getAICStatus(symbol: string): Promise<AICStatus | null> {
  return aicFetch<AICStatus>(symbol, '/status');
}

/** Check if AIC is online and responding for a symbol. */
export async function isAICHealthy(symbol: string): Promise<boolean> {
  const status = await getAICStatus(symbol);
  return status?.status === 'online';
}

/** Get the latest (highest confidence) active signal. */
export async function getLatestSignal(symbol: string): Promise<AICSignal | null> {
  return aicFetch<AICSignal>(symbol, '/signals/latest');
}

/** Get all active signals. */
export async function getActiveSignals(symbol: string): Promise<AICSignal[]> {
  const signals = await aicFetch<AICSignal[]>(symbol, '/signals');
  return Array.isArray(signals) ? signals : [];
}

/** Get multi-TF confluence assessment. */
export async function getConfluence(symbol: string): Promise<AICConfluence | null> {
  const data = await aicFetch<{ confluence: AICConfluence }>(symbol, '/confluence');
  return data?.confluence ?? null;
}

/** Get regime detection result. */
export async function getRegime(
  symbol: string,
): Promise<{ regime: string; confidence: number } | null> {
  return aicFetch<{ regime: string; confidence: number }>(symbol, '/regime');
}

/** Get research data (funding, fear/greed, liquidations). */
export async function getResearch(symbol: string): Promise<AICResearch | null> {
  return aicFetch<AICResearch>(symbol, '/research');
}

/** Get indicator analysis for a specific timeframe. */
export async function getAnalysis(
  symbol: string,
  tf: string,
): Promise<Record<string, any> | null> {
  return aicFetch<Record<string, any>>(symbol, `/analysis?tf=${tf}`);
}

/** Send trade outcome feedback to AIC. */
export async function sendFeedback(
  symbol: string,
  outcome: TradeOutcome & {
    setup_name: string;
    original_confidence: number;
    regime_at_entry?: string;
    confluence_at_entry?: number;
  },
): Promise<boolean> {
  const baseUrl = getBaseUrl(symbol);
  if (!baseUrl) return false;

  const token = getToken();
  const url = `${baseUrl}/feedback${token ? `?token=${token}` : ''}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AIC_TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mine_id: outcome.mineId,
        symbol: outcome.symbol,
        strategy: outcome.strategy,
        timeframe: outcome.timeframe,
        direction: outcome.direction,
        entry_price: outcome.entryPrice,
        exit_price: outcome.exitPrice,
        pnl_pct: outcome.pnlPct,
        outcome: outcome.outcome,
        duration_hours: outcome.durationHours,
        setup_name: outcome.setup_name,
        original_confidence: outcome.original_confidence,
        regime_at_entry: outcome.regime_at_entry ?? null,
        confluence_at_entry: outcome.confluence_at_entry ?? null,
        closed_at: new Date(outcome.closedAt).toISOString(),
      }),
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Get scorecard data from AIC. */
export async function getScorecard(symbol: string): Promise<any[]> {
  const data = await aicFetch<any[]>(symbol, '/scorecard');
  return Array.isArray(data) ? data : [];
}
