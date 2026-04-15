# NexusOne — Strategy Registry

## Active Strategies

| ID | Version | Symbol | Direction | TF | Status |
|----|---------|--------|-----------|----|--------|
| S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1 | 1 | BTC-USD | SHORT | 5m | paper |

## S1 — Funding High + Autocorrelation Trending Short

**Thesis**: When funding is high and the market shows local trending structure (positive autocorrelation), longs become crowded and overpay carry. This creates a tradeable short reversal.

**Trigger conditions** (frozen):
- Funding rate z-score > 2.0 (30-bar window)
- Lag-1 autocorrelation > 0.15 (48-bar window)

**Execution**:
- Mode: maker-first (limit order at current price)
- Entry timeout: 2 bars (10 min)
- Hold: 6 bars (30 min)
- Cooldown: 6 bars between trades

**Risk**:
- Max 1 open position
- Risk per trade: 0.5% of equity
- Kill switch on 5 consecutive losses or rolling 20-trade negative edge

## Rules

1. Parameters are FROZEN. No live modification.
2. Any change creates a new version (S1_..._V2).
3. No strategy enters live without paper validation.
4. Research sandbox is separate from production.
