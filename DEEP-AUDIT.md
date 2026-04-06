# DEEP-AUDIT.md — Nexus Pro Technical-Functional Audit

**Date:** 2026-04-06  
**Methodology:** Complete source code read of all 25 critical engine files, API verification, data flow tracing.

---

## SEZIONE 1: PIPELINE DATI

### CoinGecko Provider (`src/lib/data/providers/coingecko.ts` — 177 lines)
- **Real API call:** YES — `https://api.coingecko.com/api/v3`
- **Endpoints used:** `/coins/{id}/ohlc`, `/simple/price`, `/coins/markets`
- **Returns real OHLCV:** YES, but **volume is always 0** (CoinGecko OHLC endpoint does not return volume)
- **Error handling:** YES — try/catch, HTTP status check
- **Max history:** ~90 days daily, ~14 days 4h, ~2 days 1h (CoinGecko free tier limitation)
- **Rate limiting:** No built-in rate limiter (CoinGecko allows 30 req/min free)

### Twelve Data Provider (`src/lib/data/providers/twelve-data.ts` — 109 lines)
- **Real API call:** YES — `https://api.twelvedata.com`
- **Endpoints used:** `/time_series`, `/quote`
- **Uses API key from env:** YES — `TWELVE_DATA_API_KEY`
- **Returns real OHLCV:** YES, with real volume
- **Error handling:** YES
- **Max history:** 500 candles per request (free tier)
- **Rate limiting:** No built-in limiter (free tier allows 8 req/min)

### Market Data Router (`src/lib/data/providers/index.ts` — 85 lines)
- **Routing logic:** `symbol.includes('/')` → CoinGecko, else → Twelve Data
- **Fallback:** None — if one provider fails, the request fails

### History Loader (`src/lib/engine/rnd/history-loader.ts` — 96 lines)
- **Binance reachable from server:** **NO** — blocked from US. Returns geo-restriction error.
- **CoinGecko fallback:** YES — automatically falls back when Binance fails
- **Actually downloads candles:** YES, but limited to CoinGecko's max history (~90 days daily)
- **Volume caveat:** Crypto volume is **synthetically generated** via `Math.random()` when CoinGecko is the source
- **Redis caching:** YES — `nexus:history:{asset}:{tf}` with TTL ranging 1h (1m) to 7 days (1d)

### Cache/Storage
- All downloaded data cached in Redis as JSON strings
- Estimated size for 3 months 1h BTC data: ~500 candles × ~100 bytes = ~50KB per asset/timeframe
- Well within Upstash free tier (256MB)

---

## SEZIONE 2: MOTORE ANALITICO

### Indicators (`src/lib/engine/indicators.ts` — 192 lines)
| Function | Status | Implementation |
|---|---|---|
| `computeRSI` | **[FUNZIONANTE]** | Delegates to `technicalindicators` library (correct Wilder RSI) |
| `computeMACD` | **[FUNZIONANTE]** | `technicalindicators` (12,26,9 EMA-based) |
| `computeBollinger` | **[FUNZIONANTE]** | `technicalindicators` (20,2σ) + squeeze detection (width < 5th percentile) |
| `computeATR` | **[FUNZIONANTE]** | `technicalindicators` (14-period) |
| `computeADX` | **[FUNZIONANTE]** | `technicalindicators` (14-period) |
| `computeStochastic` | **[FUNZIONANTE]** | `technicalindicators` (14,3) |
| `computeEMA/SMA` | **[FUNZIONANTE]** | `technicalindicators` |
| `computeVolumeAnalysis` | **[FUNZIONANTE]** | Custom: 20-period moving average, spike detection (>1.5x avg) |
| `computeOBV` | **[FUNZIONANTE]** | `technicalindicators` |
| `detectRegime` | **[FUNZIONANTE]** | Custom: ADX, SMA50/200, BB width percentile |

- **Mathematical correctness:** VERIFIED — uses the established `technicalindicators` library
- **Test coverage:** 19 unit tests
- **Note:** All arrays padded to candle length with neutral defaults

### Pattern Recognition (`src/lib/engine/patterns.ts` — 212 lines)
- **Status:** **[FUNZIONANTE]** — 14 pattern types implemented with real geometric checks
- **Patterns:** hammer, inverted hammer, shooting star, doji, bullish/bearish engulfing, piercing line, dark cloud cover, morning star, evening star, three white soldiers, three black crows, double top, double bottom
- **Detection logic:** Range-based (e.g., hammer: bodyRatio < 0.35, lower shadow > 60% range, upper shadow < 10% range)
- **Test coverage:** 12 unit tests
- **Correctness:** Pattern definitions match standard technical analysis textbooks

### Strategies (`src/lib/engine/strategies.ts` — 444 lines)
| Strategy | Lines of Logic | Status |
|---|---|---|
| Trend Following | ~40 | **[FUNZIONANTE]** — EMA21>SMA50, ADX>25, MACD positive, exit on 2 closes below EMA21 |
| Mean Reversion | ~30 | **[FUNZIONANTE]** — RSI<30 + BB lower + volume spike, exit RSI>50 |
| Breakout | ~35 | **[FUNZIONANTE]** — 20-period high/low break, volume>1.5x, ADX rising, fixed -8% stop |
| Adaptive Momentum | ~40 | **[FUNZIONANTE]** — RSI>50 + MACD cross + Stochastic cross, trailing 2x ATR |
| Pattern Intelligence | ~25 | **[FUNZIONANTE]** — pattern confidence>70% + volume, exits on opposing pattern |
| Combined AI | ~40 | **[FUNZIONANTE]** — ensemble vote from 5 sub-strategies, Kelly sizing |

- **Each strategy implements:** `shouldEnter()`, `shouldExit()`, `calculateSize()`
- **Test coverage:** 29 unit tests

### R&D Indicator Scanner (`src/lib/engine/rnd/indicator-scanner.ts` — 111 lines)
- **Status:** **[FUNZIONANTE]** — scans 17 single + 7 combination conditions
- **Method:** Walks through history, for each condition occurrence, records forward 1d and 1w returns
- **Accuracy calculation:** `wins / (wins + losses)` where win = price moved ≥0 in predicted direction
- **Minimum sample:** 5 occurrences to be included

### R&D Strategy Lab (`src/lib/engine/rnd/strategy-lab.ts` — 95 lines)
- **Status:** **[FUNZIONANTE]** — runs real backtests via `runBacktest()` from backtest engine
- **Grid search:** 4 strategies × 4 SL × 4 TP (skipping TP ≤ SL) = up to 48 experiments
- **Ranking:** Composite score (Sharpe×0.4 + ProfitFactor×0.3 + WinRate×0.3)
- **Grading:** A (Sharpe>2, WR>60%), B, C, D, F

### Backtest Engine (`src/lib/engine/backtest.ts` — 430 lines)
- **Status:** **[FUNZIONANTE]** — complete event-driven backtest
- **Monte Carlo:** **[FUNZIONANTE]** — 200 Fisher-Yates shuffles, produces percentile distribution
- **Walk-Forward:** **[FUNZIONANTE]** — 4 train/test windows, robustness scoring
- **Correctness:** Handles commissions (0.1%), slippage (0.05%), cooldown, max DD circuit breaker
- **Test coverage:** 15 unit tests

---

## SEZIONE 3: CATENA DECISIONALE

### Complete Flow (Cron Tick → Order):

```
1. Cron tick every 60s
   → cron-worker.js calls: GET http://localhost:3000/api/cron/tick
   → Reads bots from Redis: key = nexus:bot_config
   → For each bot with status === 'running':

2. Fetch prices
   → Crypto: CoinGecko /coins/{id}/ohlc (volume SYNTHETIC)
   → Stocks: Twelve Data /time_series (real volume)
   → Typical candles: 84 (CoinGecko 4h) or 200-500 (Twelve Data daily)
   → If fails: continues to next asset

3. Regime classification — [FUNZIONANTE]
   → Input: all candles
   → Checks in order: EXHAUSTION → BREAKOUT → VOLATILE → TRENDING → RANGING
   → If EXHAUSTION: skip all entry, only manage positions
   → Filters bot strategies to regime-recommended only
   → Applies sizeMultiplier (0-1.2x)

4. Master Signal — [FUNZIONANTE, FIXED]
   → MTF score: computed from 5 timeframes (real data from CoinGecko/TwelveData)
   → News score: from Alpaca News API (keyword-based, 16+16 words)
   → Calendar score: hardcoded approximate events
   → Formula: ONLY includes components with real data (not neutral defaults)
   → Output range: realistic 20-80 after fix (was always 50-60 before)

5. Trap detection — [FUNZIONANTE]
   → Checks: bull trap, bear trap, fakeout, stop hunt
   → If trapped: skip with log

6. Smart timing — [FUNZIONANTE]
   → Checks: pullback position, volume, volatility spike
   → If not ready: skip, retry next tick

7. Pre-trade checks (8 checks) — [FUNZIONANTE]
   → Check 1: Daily loss < -2% → blocks
   → Check 2: Score >= adaptive minimum → blocks if too low
   → Check 3: TF alignment not conflicting → blocks
   → Check 4: No high-impact event → blocks
   → Check 5: News not strongly opposing → blocks
   → Check 6: No duplicate position for asset → blocks
   → Check 7: Weekly DD < -4% → blocks
   → Check 8: Capital preservation (if +5% P&L, raises threshold) → blocks
   → NONE of these always blocks — they all check real conditions

8. Position sizing
   → Kelly: YES, implemented (fractional 25%)
   → Timeframe rules: scalp 5%, intraday 3%, daily 2%, swing 1.5%
   → Regime sizeMultiplier: applied (0.5x to 1.2x)
   → Typical size for $100k account at 3% risk: ~$3,000 per trade

9. Order placement
   → Calls: Alpaca API POST /v2/orders
   → Symbol format: crypto as "BTC/USD", stocks as "AAPL"
   → Order type: market
   → time_in_force: gtc (crypto), day (stocks)
   → Error handling: try/catch, logged

10. Post-entry management — [FUNZIONANTE]
    → Position manager: regime-adaptive trailing (1.5x trending, 2x volatile, 0.8x ranging)
    → Scale out: 25% at +2R, 50% at +3R
    → Profit lock: breakeven at +1 ATR, lock at +2 ATR, partial at +3 ATR
    → Time stop: close flat after 20 candles
```

### News Sentiment (`src/lib/engine/news-sentiment.ts` — 88 lines)
- **Real API call:** YES — Alpaca News API
- **Sophistication:** LOW — keyword matching only (not NLP/ML)
- **Keyword lists:** 16 positive, 16 negative, 12 high-impact
- **If API fails:** Returns score 0 (neutral) — does not crash
- **Cache:** 15 minutes in Redis

### Economic Calendar (`src/lib/engine/economic-calendar.ts` — 138 lines)
- **Data source:** **HARDCODED** — no external API
- **Events:** Computed from approximate monthly schedules (FOMC ~3rd Wednesday, CPI ~12th, NFP ~1st Friday)
- **Earnings:** Hardcoded for 6 stocks with approximate dates
- **Accuracy:** Approximate only — real dates may differ by 1-3 days
- **Limitation:** No actual/forecast/previous values — only event names and dates

### Dashboard Signals (`src/lib/engine/signals.ts` — 106 lines)
- **WARNING:** Uses `generateAssetOHLCV()` — **SYNTHETIC DATA**, not real market data
- **Impact:** The `/segnali` page shows signals computed on fake GBM-generated candles
- **The cron tick and analysis page use REAL data** — only this file uses synthetic

---

## SEZIONE 4: INTEGRAZIONE BROKER

### Alpaca Adapter (`src/lib/broker/alpaca.ts` — 328 lines)
- **Status:** **[FUNZIONANTE]** — complete implementation
- **Functions:** connect, disconnect, getBalance, getCandles, placeOrder, cancelOrder, getOrder, getOpenOrders, getPositions
- **Symbol handling:** Crypto uses `BTC/USD` format (Alpaca Crypto Trading API), stocks use `AAPL`
- **Error handling:** HTTP status check + error message extraction
- **Stop orders:** Supported via `stop_price` parameter
- **Position closing:** Achieved by placing opposite-side market order

### Broker Router (`src/lib/broker/index.ts` — 68 lines)
- **Routing:** `createBroker('paper')` → PaperBroker, default → AlpacaBroker
- **Live vs paper:** Constructor accepts `paper` boolean, sets correct URL
- **Live keys missing:** `/api/portfolio` returns `connected: false` — does NOT silently use paper

### Cron Worker (`src/workers/cron-worker.js` — 44 lines)
- **Calls:** `http://localhost:${PORT}/api/cron/tick` every 60s
- **Error handling:** YES — catches fetch errors, logs HTTP status
- **Cold start:** First tick delayed 5s to allow Next.js to start
- **Port:** Uses `PORT` env var, defaults to 3000

### Cron Tick Route (`src/app/api/cron/tick/route.ts` — 340 lines)
- **Broker mode:** **HARDCODED** `paper = true` on line 81 — `new AlpacaBroker(apiKey, apiSecret, true)`
- **Issue:** Even bots with `environment: 'real'` will trade on paper account
- **Severity:** LOW for now (no live keys configured), but needs fix before enabling live trading

---

## SEZIONE 5: STATO REALE vs DICHIARATO

| Modulo | Dichiarato | Stato Reale | Note |
|---|---|---|---|
| RSI, MACD, BB, ATR, ADX, Stoch, EMA, SMA | 8+ indicatori | **[FUNZIONANTE]** | Via `technicalindicators` lib, 19 tests |
| Pattern recognition | 14 patterns | **[FUNZIONANTE]** | Real geometric detection, 12 tests |
| Custom strategies | 6 strategie | **[FUNZIONANTE]** | Each ~30-40 lines of logic, 29 tests |
| Famous strategies (R&D) | 6 strategie | **[FUNZIONANTE]** | Each has `test()` with real backtest |
| Master signal | MTF+News+Cal | **[FUNZIONANTE]** | Fixed formula, real components |
| MTF analysis | 5 timeframes | **[FUNZIONANTE]** | Fetches real data per TF |
| News sentiment | Alpaca API | **[FUNZIONANTE]** | Real API, keyword scoring (not ML) |
| Economic calendar | Events | **[PARZIALE]** | Hardcoded approximate dates, no external API |
| Regime classifier | 6 regimes | **[FUNZIONANTE]** | Real indicators, priority-based classification |
| Trap detector | 4 types | **[FUNZIONANTE]** | Real candle analysis |
| Smart timing | 3 checks | **[FUNZIONANTE]** | Pullback, volume, volatility |
| Position manager | Trail+scale | **[FUNZIONANTE]** | Regime-adaptive |
| Risk management | Kelly+8 checks | **[FUNZIONANTE]** | All 8 checks implement real conditions |
| Backtest engine | MC+WF | **[FUNZIONANTE]** | 430 lines, 15 tests |
| R&D indicator scanner | 24 conditions | **[FUNZIONANTE]** | Real forward-looking accuracy test |
| R&D strategy lab | Grid search | **[FUNZIONANTE]** | Real backtests, 48 experiments |
| R&D knowledge base | Redis persist | **[FUNZIONANTE]** | Aggregates all findings |
| History loader | CoinGecko+TD | **[PARZIALE]** | Binance blocked, CoinGecko limited history, fake volume |
| Adaptive learning | Auto-weights | **[FUNZIONANTE]** | Requires 30+ trades to activate |
| Asset profiles | Hourly behavior | **[MANCANTE]** | Declared but `asset-profile.ts` was never created |
| Broker integration | Alpaca paper+live | **[PARZIALE]** | Paper works. Live keys empty. Cron hardcodes paper=true |
| Cron worker | 60s tick | **[FUNZIONANTE]** | HTTP polling, error handling |
| Demo/Real separation | Filtered | **[FUNZIONANTE]** | API accepts ?mode=, frontend passes from store |
| Notifications | In-app+Discord | **[FUNZIONANTE]** | Redis persistence, Discord webhook optional |
| Dashboard signals | Live signals | **[PLACEHOLDER]** | Uses synthetic GBM data, NOT real market prices |

---

## SEZIONE 6: PRIORITÀ DI SVILUPPO

### CRITICO (sistema non opera correttamente senza):
1. **Fix `/segnali` page** — currently shows signals from synthetic data. Should use real market data like the analysis page does.
2. **Fix cron tick broker mode** — hardcoded `paper=true` prevents real trading even with live keys configured. Should read `config.environment` and use appropriate keys.

### ALTO (limita significativamente la qualità):
3. **Economic calendar API** — hardcoded approximate dates are unreliable. Use a real API (Alpaca calendar, or Twelve Data economic calendar endpoint).
4. **Volume data for crypto** — CoinGecko OHLC has no volume. All crypto volume analysis (spike detection, volume-based strategies) operates on fake `Math.random()` data. Consider alternative data source with real volume.
5. **History depth** — CoinGecko limits crypto history to ~90 days daily. R&D analysis needs more depth for statistical significance. May need paid data source.

### MEDIO (migliora qualità decisioni):
6. **Create asset-profile.ts** — declared in code but never implemented. Hourly behavior analysis would improve timing.
7. **News sentiment upgrade** — keyword matching is rudimentary. Consider simple NLP or at minimum expand keyword lists and add context weighting.
8. **Dashboard signals from real data** — replace `generateSignalsForAssets()` in `signals.ts` to fetch from live providers instead of GBM generator.

### BASSO (nice to have):
9. **Multi-user data isolation** — currently all data is global. Redis keys should include `{userId}` prefix for multi-user support.
10. **Walk-forward validation in R&D** — strategy lab could include walk-forward to validate out-of-sample performance.
