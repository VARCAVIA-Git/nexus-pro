# S1 Backtest Report — 2026-04-15

## Strategy
- **ID**: S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1
- **Symbol**: BTC-USD (5m bars)
- **Direction**: Short
- **Trigger**: Funding z-score > 2.0 AND autocorrelation > 0.15
- **Hold**: 6 bars (30 min)
- **Cooldown**: 6 bars

## Data
- **Source**: Alpaca Data API (OHLCV) + synthetic funding proxy (momentum-based)
- **Period**: 2026-02-14 to 2026-04-15 (60 days)
- **Bars**: 17,234
- **Cost model**: 13 bps round-trip (2.5 taker + 3 slippage + 1 spread per leg)

## Results

| Metric | Value | Gate | Pass? |
|---|---|---|---|
| Total trades | 44 | >= 30 | PASS |
| Win rate | 34.09% | > 40% | **FAIL** |
| Net PnL | -812 bps | > 0 | **FAIL** |
| Avg trade | -18.45 bps | > 0 | **FAIL** |
| Avg winner | +22.15 bps | — | — |
| Avg loser | -39.46 bps | — | — |
| Profit factor | 0.29 | > 1.0 | **FAIL** |
| Max drawdown | 846 bps | < 500 | **FAIL** |
| Sharpe (ann.) | -7.09 | > 0.5 | **FAIL** |
| T-statistic | -2.74 | > 2.0 | **FAIL** |

## Walk-Forward (4 folds)

| Fold | Trades | Net bps | Win % | Sharpe |
|---|---|---|---|---|
| 1 (Feb 14-28) | 9 | -93 | 56% | -4.72 |
| 2 (Feb 28-Mar 14) | 12 | -281 | 50% | -6.24 |
| 3 (Mar 14-29) | 11 | -111 | 36% | -6.52 |
| 4 (Mar 29-Apr 15) | 12 | -327 | 0% | -19.47 |

All folds negative. Degradation trend across folds.

## VERDICT: NO-GO

S1 does not show a tradeable edge on BTC-USD in the Feb-Apr 2026 period.

## Analysis

1. **Funding proxy limitation**: Synthetic funding derived from 24h momentum is not the same as actual exchange funding rates. The signal may be testing a momentum proxy, not true funding dislocation.
2. **Cost drag**: 13 bps per round-trip on 30-min holds requires significant gross edge. Avg winner (+22 bps) barely covers costs, avg loser (-39 bps) is nearly 2x the cost.
3. **Short bias in uptrend**: BTC moved from ~68k to ~85k in this period. Systematic short-only strategies face headwinds in uptrends.
4. **Low win rate**: 34% win rate requires profit factor > 2 to break even, but actual PF is 0.29.

## Recommendations

1. **Do not promote S1 to paper trading** in current form
2. **Acquire real funding rates** (Binance FAPI from non-US server, or OKX via droplet)
3. **Retest with real funding** before any further action on S1
4. **Consider**: S1 may only work in specific funding regimes (extreme funding > 0.05%/8h)
5. **Research alternative strategies** that work in both directions or adapt to regime

## Status Change
S1 status: `paper` → `research` (demoted pending real funding data)
