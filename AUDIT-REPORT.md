# Nexus Pro — Audit Report

**Date:** 2026-04-06
**Auditor:** Claude Opus 4.6

---

## Demo/Real Separation

**Status:** FIXED

**Issues found:**
1. `/api/bot/status` returned ALL bots regardless of mode — **FIXED**: now accepts `?mode=demo|real` and filters by `config.environment`
2. Dashboard fetched bot status without mode — **FIXED**: now passes `?mode=${mode}` from Zustand store
3. Dashboard trades used hardcoded `env=demo` — **FIXED**: uses `env=${mode}`
4. Strategy page didn't filter bots by mode — **FIXED**: passes `?mode=${mode}` to bot status API
5. Strategy form defaulted environment to 'demo' regardless of current mode — **FIXED**: initializes from mode store

**Architecture:**
- Bots store their `environment` field ('demo'|'real') in the MultiBotConfig
- All configs live under one Redis key `nexus:bot_config` (array)
- Filtering happens at API level via `?mode=` query param
- The cron tick processes ALL running bots regardless of environment (both demo and real bots can run simultaneously)

---

## R&D Lab

| Component | Status | Notes |
|---|---|---|
| History Loader | WORKING | Binance BLOCKED from US server — falls back to CoinGecko OHLC. Twelve Data works for stocks. |
| Indicator Scanner | WORKING | Scans 17 single + 7 combo conditions, calculates win rates from future returns |
| Pattern Mapper | WORKING | Detects 12 candlestick patterns, cross-analyzes with regime and volume |
| Strategy Trainer | WORKING | Grid search SL×TP, runs real backtests via `runBacktest()`, assigns grades A-F |
| Knowledge Base | WORKING | Builds from indicator + pattern + event findings, saves to Redis |
| Famous Strategies | WORKING | 6 strategies with real `test()` implementations |
| UI | WORKING | 4-phase analysis with progress, results display, knowledge base tab |

**Limitation:** Crypto historical data limited to CoinGecko OHLC (max ~90 days daily, ~14 days 4h) since Binance API is geo-blocked from US servers.

---

## Trading Engine

| Component | Status | Notes |
|---|---|---|
| Cron Worker | WORKING | `cron-worker.js` calls `/api/cron/tick` every 60s via HTTP |
| Tick Processing | WORKING | Reads bots from Redis, processes each running bot |
| Price Fetching | WORKING | CoinGecko (crypto), Twelve Data (stocks) |
| Master Signal | FIXED | Was always neutral (50-55) due to dilution by constant news/calendar scores. Fixed: only includes components with real data |
| Regime Classifier | WORKING | 6 regimes: TRENDING_UP/DOWN, RANGING, VOLATILE, BREAKOUT, EXHAUSTION |
| Trap Detector | WORKING | Detects bull traps, bear traps, fakeouts, stop hunts |
| Smart Timing | WORKING | Pullback, volume, volatility checks before entry |
| Position Manager | WORKING | Regime-adaptive trailing, scale out, time stop |
| Pre-trade Checks | WORKING | 8 safety checks before every order |
| Order Placement | WORKING | Alpaca paper API via `AlpacaBroker.placeOrder()` |

**Why bots weren't trading:**
1. Master signal formula diluted scores: `MTF*0.5 + 50*0.25 + 50*0.25` → max ~60-65
2. Confidence threshold was 70% — now mode-based: scalp 55%, intraday 60%, daily 65%
3. Formula fixed: only includes news/calendar if they have real (non-neutral) data

---

## Pages

| Page | Status | Issues Fixed |
|---|---|---|
| /dashboard | WORKING | Fixed mode filtering for bot status and trades |
| /portfolio | WORKING | Mode-aware: demo→paper, real→live (or "not connected") |
| /operazioni | WORKING | Mode-filtered trades, card view mobile, CSV export |
| /segnali | WORKING | Real signals from trading engine |
| /analysis | WORKING | Candlestick chart (dynamic import), AI analysis panel |
| /strategy | WORKING | Fixed mode filtering, formEnv defaults to current mode |
| /intelligence | WORKING | MTF analysis, news, calendar |
| /backtest | WORKING | Real backtest engine with Monte Carlo |
| /rnd | WORKING | 4-phase deep analysis, knowledge base |
| /connections | WORKING | Service status cards |
| /impostazioni | WORKING | Settings persist to Redis, ticker customization |
| /status | WORKING | Health checks |
| /login | WORKING | Redis-based auth |
| /register | WORKING | User creation with password hash |
| /onboarding | WORKING | 4-step wizard |

---

## Redis Keys

See `REDIS-KEYS.md` for complete list.

**Issues:**
- Bot configs stored globally (not per-user) — acceptable for single-user deployment
- No mode prefix on bot configs — filtering done at API level via `environment` field
- Trade/notification lists are global — acceptable for current architecture

---

## Environment Variables

| Variable | Status |
|---|---|
| `ALPACA_API_KEY` | Configured, working (paper) |
| `ALPACA_API_SECRET` | Configured, working |
| `ALPACA_LIVE_API_KEY` | Empty (expected — no live account) |
| `ALPACA_LIVE_SECRET_KEY` | Empty (expected) |
| `TWELVE_DATA_API_KEY` | Configured, working |
| `UPSTASH_REDIS_REST_URL` | Configured, working |
| `UPSTASH_REDIS_REST_TOKEN` | Configured, working |
| `COINGECKO_API_KEY` | Empty (uses free tier, working) |
| `DISCORD_WEBHOOK_URL` | Empty (optional) |

All env vars checked: code degrades gracefully when undefined.

---

## Critical Fixes Applied

1. **Bot status mode filtering** — `/api/bot/status` now accepts `?mode=` and filters bots
2. **Dashboard mode-aware fetching** — all API calls include current mode
3. **Strategy page mode filtering** — shows only bots matching current mode
4. **Strategy form env default** — initializes from Zustand mode store
5. **Master signal formula** — only includes news/calendar when they have real data (not constant 50)
6. **Confidence thresholds** — mode-based: scalp 55%, intraday 60%, daily 65%
7. **Regime classifier** — blocks entry during EXHAUSTION, adjusts position size
8. **Trap detector** — prevents entry on bull/bear traps, fakeouts
9. **Smart timing** — prevents entry at bad price levels
10. **Position manager** — regime-adaptive trailing stops and scale-out

---

## Build Status

- **Routes:** 49
- **Unit Tests:** 100 passed
- **Build:** 0 errors
