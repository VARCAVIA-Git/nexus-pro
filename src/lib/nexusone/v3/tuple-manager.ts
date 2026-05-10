// NexusOne v3 — adaptive tuple manager.
//
// One TupleStateV3 per (primitive, asset, timeframe). Each tuple tracks
// a rolling 50-trade ledger and a Bayesian-shrunk posterior expectancy.
//
// Activation rule:
//   ACTIVE if posterior > -2 bps AND last 30-trade sum > -300 bps
//   COOLDOWN otherwise (skip 30 trade slots, then re-evaluate)
//
// The ledger is the only mutable state. Primitives are frozen.
//
// Persistence: serialize() / deserialize() round-trip the tuple map for
// Redis storage between ticks. The runtime calls these at boundaries.

import type { TupleStateV3, TfV3 } from './types';

export class TupleManagerV3 {
  private map = new Map<string, TupleStateV3>();

  size(): number {
    return this.map.size;
  }

  all(): TupleStateV3[] {
    return [...this.map.values()];
  }

  get(key: string, primitive: string, asset: string, tf: TfV3): TupleStateV3 {
    let s = this.map.get(key);
    if (!s) {
      s = {
        key, primitive, asset, tf,
        netBpsHistory: [],
        active: true,
        cooldownUntilTrade: 0,
        totalTrades: 0,
        posteriorExpectancyBps: 0,
      };
      this.map.set(key, s);
    }
    return s;
  }

  update(key: string, netBps: number): void {
    const s = this.map.get(key);
    if (!s) return;

    s.netBpsHistory.push(netBps);
    s.totalTrades++;
    if (s.netBpsHistory.length > 50) s.netBpsHistory.shift();

    const n = s.netBpsHistory.length;
    const mean = s.netBpsHistory.reduce((a, b) => a + b, 0) / n;

    // Bayesian shrinkage to prior=0bps with weight=30
    const priorWeight = 30;
    s.posteriorExpectancyBps = (0 * priorWeight + mean * n) / (priorWeight + n);

    const last30 = s.netBpsHistory.slice(-30);
    const last30Sum = last30.reduce((a, b) => a + b, 0);

    if (!s.active && s.totalTrades >= s.cooldownUntilTrade) {
      if (s.posteriorExpectancyBps > -2 && last30Sum > -300) s.active = true;
    } else if (s.active) {
      if (s.posteriorExpectancyBps < -8 || (n >= 20 && last30Sum < -400)) {
        s.active = false;
        s.cooldownUntilTrade = s.totalTrades + 30;
      }
    }
  }

  serialize(): string {
    return JSON.stringify([...this.map.entries()]);
  }

  deserialize(json: string): void {
    if (!json) return;
    const entries = JSON.parse(json) as [string, TupleStateV3][];
    this.map = new Map(entries);
  }
}

// Quarter-Kelly fraction with 5% cap and small probe size before warm-up.
export function kellyFraction(t: TupleStateV3): number {
  if (t.netBpsHistory.length < 10) return 0.005; // 0.5% probe size
  const wins = t.netBpsHistory.filter((x) => x > 0);
  const losses = t.netBpsHistory.filter((x) => x <= 0);
  if (wins.length < 3 || losses.length < 3) return 0.005;
  const W = wins.reduce((a, b) => a + b, 0) / wins.length;
  const Lavg = Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length);
  if (Lavg <= 0) return 0.005;
  const p = wins.length / (wins.length + losses.length);
  const b = W / Lavg;
  const fStar = (p * b - (1 - p)) / b;
  if (fStar <= 0) return 0;
  return Math.min(fStar / 4, 0.05);
}
