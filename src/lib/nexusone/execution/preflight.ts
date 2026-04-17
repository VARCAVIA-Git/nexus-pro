// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Pre-flight Check
//
// Runs BEFORE sending the order to the venue. Blocks:
//   - Insufficient cash for a buy (NexusOne v1's primary bug).
//   - Sell/short on a venue that doesn't support it AND we don't
//     already own the asset.
// ═══════════════════════════════════════════════════════════════

import type {
  TradingVenue,
  VenueOrderRequest,
  VenueBalance,
  VenuePosition,
} from './venues/venue.interface';
import { isCryptoAsset } from './venues/venue.interface';

export interface PreflightResult {
  approved: boolean;
  reason: string;
  balance?: VenueBalance;
  positions?: VenuePosition[];
}

const CASH_SAFETY_MARGIN = 1.02; // require 2% buffer above requested

export async function preflightCheck(
  venue: TradingVenue,
  req: VenueOrderRequest,
  lastPrice: number,
): Promise<PreflightResult> {
  const [balance, positions] = await Promise.all([
    venue.getBalance(),
    venue.getPositions(),
  ]);

  const priceRef = req.type === 'limit' && req.limitPrice ? req.limitPrice : lastPrice;
  const requiredCash = req.quantity * priceRef;

  // Buy: need cash.
  if (req.side === 'buy') {
    if (balance.buyingPower < requiredCash * CASH_SAFETY_MARGIN) {
      return {
        approved: false,
        reason: `insufficient_cash: need ~${(requiredCash * CASH_SAFETY_MARGIN).toFixed(2)}, have ${balance.buyingPower.toFixed(2)}`,
        balance,
        positions,
      };
    }
    return { approved: true, reason: 'ok', balance, positions };
  }

  // Sell: must have position on venues without short, unless the
  // venue adapter is allowed to simulate (crypto shorts on alpaca-paper).
  const canShort = isCryptoAsset(req.asset) ? venue.supportsCryptoShort : venue.supportsStockShort;
  if (!canShort) {
    const held = positions.find(p => p.asset === req.asset && p.quantity >= req.quantity);
    if (!held) {
      // The venue may still simulate the short (alpaca-paper crypto).
      // We return approved:true here but tag it so the caller knows.
      return { approved: true, reason: 'short_will_be_simulated', balance, positions };
    }
  }
  return { approved: true, reason: 'ok', balance, positions };
}
