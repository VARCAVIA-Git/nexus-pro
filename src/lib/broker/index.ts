// ═══════════════════════════════════════════════════════════════
// BROKER ROUTER
// All trading goes through Alpaca Markets (crypto + stocks).
// Paper mode is controlled by ALPACA_PAPER env var.
// ═══════════════════════════════════════════════════════════════

export type { BrokerAdapter } from './base';
export { PaperBroker } from './paper';
export { AlpacaBroker } from './alpaca';
/** @deprecated Binance is not available in US — use AlpacaBroker */
export { BinanceBroker } from './binance';

import type { BrokerAdapter } from './base';
import { PaperBroker } from './paper';
import { AlpacaBroker } from './alpaca';

export type ActiveBrokerType = 'paper' | 'alpaca';

/**
 * Create a broker instance.
 * - 'paper': local simulated broker (for backtest / offline dev)
 * - 'alpaca': Alpaca Markets — handles BOTH crypto and stocks
 *
 * Any other type (e.g. 'binance') is routed to Alpaca.
 */
export function createBroker(
  type: string = 'alpaca',
  config?: Record<string, string>,
): BrokerAdapter {
  switch (type) {
    case 'paper':
      return new PaperBroker(Number(config?.balance) || 10000);

    case 'alpaca':
    default: {
      // All non-paper trading goes through Alpaca
      const apiKey = config?.apiKey
        ?? process.env.ALPACA_API_KEY
        ?? '';
      const apiSecret = config?.apiSecret
        ?? process.env.ALPACA_API_SECRET
        ?? '';
      const paper = config?.paper !== 'false'
        && process.env.ALPACA_PAPER !== 'false';

      return new AlpacaBroker(apiKey, apiSecret, paper);
    }
  }
}

/**
 * Create the default broker from environment variables.
 * Uses Alpaca with paper/live determined by ALPACA_PAPER.
 */
export function createDefaultBroker(): BrokerAdapter {
  const enableLive = process.env.NEXT_PUBLIC_ENABLE_LIVE_TRADING === 'true';
  const alpacaPaper = process.env.ALPACA_PAPER !== 'false';

  // Only use live if both flags allow it
  const usePaper = !enableLive || alpacaPaper;

  return new AlpacaBroker(
    process.env.ALPACA_API_KEY ?? '',
    process.env.ALPACA_API_SECRET ?? '',
    usePaper,
  );
}
