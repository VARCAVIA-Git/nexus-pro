// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Venue Registry
//
// Single entry point for selecting the venue for an asset.
// Today: everything routes to Alpaca Paper. Tomorrow: swap in
// Binance/Bybit for crypto live without touching strategy code.
// ═══════════════════════════════════════════════════════════════

import { AlpacaPaperVenue } from './venues/alpaca-paper';
import type { TradingVenue } from './venues/venue.interface';

let _venue: TradingVenue | null = null;

export function getVenueForAsset(_asset: string): TradingVenue {
  if (_venue) return _venue;
  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? '';
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY / ALPACA_API_SECRET missing');
  }
  _venue = new AlpacaPaperVenue(key, secret);
  return _venue;
}

export function _setVenueForTests(venue: TradingVenue | null): void {
  _venue = venue;
}
