# NexusOne v3 — Adaptive Multi-Asset Trading

## Concept

The system is **adaptive in resource allocation, not in rule logic**. The set of primitives is frozen; what changes is *which (primitive, asset, tf) tuples are ACTIVE* based on the rolling performance ledger.

This avoids the curve-fitting trap (which destroyed v2/S5) while giving the system real-world adaptation: tuples that lose their edge fall asleep, profitable ones get more capital via Kelly sizing.

## Layout

```
v3/
  types.ts             — shared types (BarV3, IndicatorsV3, TupleStateV3, ...)
  indicators.ts        — precompute() returns all indicators + regime per bar
  primitives/
    index.ts           — 6 frozen primitives with regime-conditional activation
  tuple-manager.ts     — TupleManagerV3 (Bayesian gate) + kellyFraction()
  risk.ts              — daily/weekly halt caps, consecutive-loss cooldown
  orchestrator.ts      — pure tick(): exits + entries given a stream snapshot
```

## Universe (default)

- **Assets**: BTC, ETH, SOL, BNB, XRP, ADA (USDT perps on OKX)
- **Timeframes**: 1H and 4H
- **Primitives**: Donchian-24, Donchian-48, BB-Reversion, RSI-Cross, EMA-Pullback, Range-Fade
- **Tuples**: 6 × 6 × 2 = 72

## Validation (2026-05-03)

Backtested on 2 years of OKX 1H+4H data with 60-day warmup, regime-conditional
gating, Bayesian shrinkage, quarter-Kelly sizing, hard risk caps:

| Metric | Value |
|---|---|
| Period | 2024-05 → 2026-05 (24 months) |
| Trades total | 468 (after warmup) |
| Trades / day | 1.77 |
| Total return (after costs) | **+3.84%** |
| Max drawdown | **1.81%** |
| Sharpe (annualized) | **1.50** |
| Profit factor | 1.27 |
| Bootstrap p-value | 0.104 |

Per-fold (4-fold walk-forward, 60d warmup each):

| Fold | Period | Trades | Net | DD | Sharpe | p |
|---|---|---|---|---|---|---|
| 1 | 24-05 → 24-11 | 243 | -1.46% | 1.80% | -3.22 | 1.000 |
| 2 | 24-11 → 25-05 | 280 | +1.03% | 1.20% | +1.32 | 0.234 |
| 3 | 25-05 → 25-11 | 271 | **+2.42%** | 0.72% | **+2.81** | **0.080** |
| 4 | 25-11 → 26-05 | 192 | -0.86% | 1.48% | -2.79 | 1.000 |

**Verdict**: borderline. 5/7 validation gates pass. Bootstrap p=0.104 narrowly misses 0.10 threshold. **Paper-ready, not live-ready.**

## Activation flow

1. **Paper trading** (recommended next step):
   - Mode: `paper` via Redis flag
   - Run for 30 days minimum
   - Track per-tuple metrics; require Sharpe > 1.0 at end of period
2. **Live micro** (after paper passes):
   - Requires explicit `APPROVO_LIVE_NEXUSONE` Redis flag (manual)
   - Capital cap: $500
   - Same code path, just real broker
3. **Live full** (after 30 days micro-positive):
   - Capital cap: scaled per Kelly bankroll formula
   - Daily review until 90 days

## Key invariants

- **Primitives are frozen**: their parameters never change at runtime.
- **One trade per (asset, tf) at a time**: avoids pile-on into correlated moves.
- **Max 6 concurrent positions**: portfolio risk cap.
- **Costs assumed**: 6 bps round-trip (maker only). Taker mode disables the system.
- **Tuple state must be persisted between ticks** (Redis `nexusone:v3:tuples` recommended).

## Reproducing the validation

```bash
cd ~/dev/nexus-pro
node_modules/.bin/tsx scripts/research/fetch-cache.ts        # ~2 min, one-time
node_modules/.bin/tsx scripts/research/adaptive-backtest.ts  # ~1 sec
```

Output: `docs/nexusone/V3_VALIDATION_RAW.json`.
