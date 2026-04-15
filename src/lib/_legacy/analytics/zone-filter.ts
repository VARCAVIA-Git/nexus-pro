// ═══════════════════════════════════════════════════════════════
// Zone Filter (Phase 3.6)
//
// Filtra le ReactionZone storiche del report mantenendo solo quelle
// rilevanti per il prezzo corrente:
//   - distanza assoluta entro ±maxDistancePct (default 15%)
//   - ordinate per vicinanza al prezzo (più vicine in alto)
//
// Se currentPrice non è disponibile, ritorna l'array originale invariato
// (fallback: meglio mostrare livelli storici irrilevanti che non mostrare
// nulla).
// ═══════════════════════════════════════════════════════════════

import type { ReactionZone } from './types';

export interface FilteredZone extends ReactionZone {
  distancePct: number; // -1..+1, signed (positivo = sopra il prezzo)
}

const DEFAULT_MAX_DISTANCE = 0.15;

export function filterZonesByDistance(
  zones: ReactionZone[] | undefined | null,
  currentPrice: number | undefined | null,
  maxDistancePct: number = DEFAULT_MAX_DISTANCE,
): FilteredZone[] {
  const safe = Array.isArray(zones) ? zones : [];
  if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    // Fallback: nessun prezzo corrente → mostra tutto, decorato con distance 0
    return safe.map((z) => ({ ...z, distancePct: 0 }));
  }

  const out: FilteredZone[] = [];
  for (const z of safe) {
    if (!z || typeof z.priceLevel !== 'number') continue;
    const distance = (z.priceLevel - currentPrice) / currentPrice;
    if (Math.abs(distance) > maxDistancePct) continue;
    out.push({ ...z, distancePct: Math.round(distance * 10000) / 10000 });
  }
  // Sort per |distancePct| ASC (più vicine in alto)
  out.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
  return out;
}
