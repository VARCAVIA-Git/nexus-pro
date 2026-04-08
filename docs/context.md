# NEXUS PRO — Project Context

> Piattaforma di trading algoritmico con analisi multi-timeframe, adaptive learning, e live trading su Alpaca Markets.

## Stack Tecnologico

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 14.2 (App Router) |
| Linguaggio | TypeScript 5.6, strict mode |
| UI | Tailwind CSS 3.4, Lucide React icons |
| Grafici | Recharts (dashboard), lightweight-charts 4.2 (candlestick) |
| Font | Inter (body), Roboto Mono (numeri) |
| State | Zustand (mode store), React useState |
| Persistence | Upstash Redis (REST API) |
| Broker | Alpaca Markets (paper + live) |
| Market Data | Twelve Data (stocks), CoinGecko (crypto) |
| Auth | Redis-based sessions (cookie `nexus-session`) |
| Process Manager | PM2 (nexus-web + nexus-cron) |
| Testing | Vitest (100 unit tests) |
| Deploy | DigitalOcean droplet, PM2, Cloudflare Tunnel |

## Architettura

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Public: login, register, onboarding, forgot-password
│   ├── (dashboard)/              # Protected (middleware auth check)
│   │   ├── dashboard/            # Overview con stat cards, equity curve, bot status
│   │   ├── portfolio/            # Bilancio Alpaca, posizioni, trade (mode-aware)
│   │   ├── operazioni/           # Storico trade da Redis con filtri, card mobile
│   │   ├── segnali/              # Segnali live generati dal trading engine
│   │   ├── analysis/             # Candlestick chart + AI analysis panel
│   │   ├── strategy/             # Multi-bot manager: crea, avvia, ferma, elimina
│   │   ├── intelligence/         # MTF analysis + news + economic calendar
│   │   │   └── learning/         # Adaptive learning insights per asset
│   │   ├── backtest/             # Backtest engine con Monte Carlo + Walk-Forward
│   │   ├── rnd/                  # R&D Lab: training, knowledge base, famous strategies
│   │   ├── connections/          # Status servizi API + gestione fondi Alpaca
│   │   ├── impostazioni/         # Profilo, API keys, notifiche, logout
│   │   └── status/               # Health check tutti i servizi
│   ├── api/                      # API Routes (23 endpoints)
│   └── globals.css               # Theme system (neutral/demo/real via CSS vars)
├── components/                   # Shared: sidebar, ticker, notification-bell, trade-list, mode-provider
├── lib/
│   ├── engine/                   # Trading engine core
│   │   ├── indicators.ts         # RSI, MACD, Bollinger, ATR, ADX, Stochastic, EMA, SMA, Volume
│   │   ├── patterns.ts           # 12 candlestick patterns + double top/bottom
│   │   ├── strategies.ts         # 6 strategie con shouldEnter/shouldExit/calculateSize
│   │   ├── backtest.ts           # Backtest + Monte Carlo + Walk-Forward
│   │   ├── risk.ts               # Kelly, ATR sizing, pre-trade checks, profit lock, timeframe rules
│   │   ├── master-signal.ts      # Combina MTF + news + calendar + adaptive weights + knowledge
│   │   ├── live-runner.ts        # Multi-bot engine: create, start, stop, delete, tick
│   │   ├── mtf-analysis.ts       # Multi-timeframe analysis (5 TF weighted)
│   │   ├── mtf-data.ts           # Data fetcher con Redis cache per timeframe
│   │   ├── news-sentiment.ts     # Keyword-based scoring da Alpaca News API
│   │   ├── economic-calendar.ts  # FOMC, CPI, NFP, earnings con blocking logic
│   │   ├── notifications.ts      # In-app (Redis) + Discord webhook
│   │   ├── data-generator.ts     # GBM (Geometric Brownian Motion) per backtest
│   │   ├── signals.ts            # Signal generator per segnali pagina
│   │   ├── learning/             # Adaptive learning: outcomes, patterns, weights, optimizer
│   │   └── rnd/                  # R&D: warehouse, scanner, trainer, famous strategies, knowledge
│   ├── broker/                   # Alpaca adapter (paper + live), legacy Binance
│   ├── data/providers/           # Twelve Data + CoinGecko market data
│   ├── db/redis.ts               # Upstash Redis REST client
│   ├── config/assets.ts          # Asset + strategy config constants
│   └── utils/format.ts           # Number formatting (en-US, Intl.NumberFormat)
├── stores/mode-store.ts          # Zustand: demo/real mode, persisted
├── types/                        # trading.ts, bot.ts, intelligence.ts
├── workers/                      # bot-worker.js (standalone), cron-worker.js (HTTP ticker)
└── middleware.ts                 # Auth: protects all routes, redirects to /login
```

## API Routes (23 endpoints)

| Route | Method | Funzione |
|---|---|---|
| `/api/auth/register` | POST | Registra utente in Redis, setta cookie session |
| `/api/auth/login` | POST | Verifica password, crea session |
| `/api/auth/logout` | POST | Cancella session |
| `/api/auth/me` | GET | Ritorna utente dalla session |
| `/api/prices` | GET | Prezzi live: CoinGecko (crypto) + Twelve Data (stocks) |
| `/api/portfolio` | GET | Bilancio Alpaca (paper o live in base a `?env=`) |
| `/api/trades` | GET | Trade da Redis con paginazione |
| `/api/signals` | GET | Segnali generati dal trading engine |
| `/api/analysis` | POST | Analisi AI completa: chart data + indicatori + MTF + news |
| `/api/bot/start` | POST | Crea + avvia bot (o avvia esistente con `botId`) |
| `/api/bot/stop` | POST | Ferma bot (o elimina con `action=delete`) |
| `/api/bot/status` | GET | Stato tutti i bot + aggregate |
| `/api/bot/resume` | POST | Riavvia bot da config salvata in Redis |
| `/api/broker/status` | GET | Connessione Alpaca paper + live |
| `/api/intelligence` | GET | Master signals + economic calendar |
| `/api/learning` | GET | Adaptive learning insights + weights |
| `/api/performance` | GET | P&L, win rate, Sharpe da trade in Redis |
| `/api/notifications` | GET/POST | Lista notifiche + mark read |
| `/api/settings` | GET/POST | Preferenze utente in Redis |
| `/api/rnd` | GET/POST | R&D: download, scan, train, knowledge base |
| `/api/cron/tick` | GET | Serverless cron: esegue tick per tutti i bot running |
| `/api/test-all` | GET | Test suite: 9 integration tests |
| `/api/health` | GET | Health check |

## Broker Routing

| Mode | URL | Keys | Uso |
|---|---|---|---|
| `demo` | `paper-api.alpaca.markets` | `ALPACA_API_KEY` | Portfolio, bot, operazioni demo |
| `real` (con live keys) | `api.alpaca.markets` | `ALPACA_LIVE_API_KEY` | Portfolio reale, fondi veri |
| `real` (senza live keys) | — | — | Mostra "Collega conto live" |

## Trading Engine

### 6 Strategie
1. **Trend Following** — EMA21 > SMA50, ADX > 25, MACD positivo
2. **Mean Reversion** — RSI < 30 + BB lower touch + volume spike
3. **Breakout** — Rottura high 20 periodi + volume > 1.5x + ADX crescente
4. **Adaptive Momentum** — RSI > 50 + MACD cross up + Stochastic cross up
5. **Pattern Intelligence** — Pattern bullish conf > 70% + volume
6. **Combined AI** — Voto da 5 sub-strategie, entra con ≥4 concordi

### 6 Famous Strategies (R&D)
1. Turtle Trading (Dennis) — breakout 20-day
2. MACD + RSI Combo (Appel)
3. Bollinger Squeeze (Bollinger)
4. EMA Ribbon Scalping
5. RSI Divergence (Wilder)
6. Volume Breakout

### Multi-Timeframe Analysis
- 5 timeframe: 15m, 1h, 4h, 1d, 1w
- Pesi: 1w 30%, 1d 25%, 4h 20%, 1h 15%, 15m 10%
- Alignment: strong/moderate/weak/conflicting

### Risk Management
- Timeframe capital rules: scalp 5%/trade, intraday 3%, daily 2%, swing 1.5%
- 8 pre-trade safety checks (daily loss, score, alignment, calendar, news, correlation, weekly DD, capital preservation)
- Profit lock: +1 ATR → breakeven, +2 ATR → lock +1 ATR, +3 ATR → close 50%
- Circuit breaker: -3% daily → 24h stop, -5% weekly → 72h, -15% total → full stop

### Adaptive Learning
- TradeOutcome tracking con contesto completo (indicatori, regime, news, timing)
- Pattern Analyzer: best strategy, timing, news impact, RSI range per asset
- Adaptive Weights: modifica pesi master signal per asset basandosi su storico
- Strategy Optimizer: grid search SL/TP per strategia×asset
- Knowledge Base: boost/penalità al master signal da R&D findings

## Theme System

3 temi via CSS custom properties (`data-mode` attribute):
- **neutral** (default): grigio/slate — per Strategy, Backtest, R&D, Settings
- **demo**: arancione (`#f59e0b`) — quando mode=demo
- **real**: blu (`#3b82f6`) — quando mode=real

Switch mode: bottone in fondo alla sidebar → Zustand store → `data-mode` attribute → CSS vars

## Auth System

- Redis-based: `nexus:user:{email}` per utenti, `nexus:session:{id}` per sessioni
- Cookie: `nexus-session` httpOnly, 7 giorni
- Middleware: `src/middleware.ts` — protegge tutte le route tranne /login, /register, /api/auth/*
- Predisposto per swap a Supabase Auth quando le credenziali saranno reali

## Redis Keys

| Pattern | Contenuto |
|---|---|
| `nexus:user:{email}` | User record (id, name, email, passwordHash) |
| `nexus:session:{id}` | Session (userId, email, name) — TTL 7 giorni |
| `nexus:{userId}:settings` | Preferenze utente |
| `nexus:bot_config` | Array di MultiBotConfig |
| `nexus:bot:state:{botId}` | Runtime state per bot (positions, trades, signals) |
| `nexus:trades` | Lista trade (max 500) |
| `nexus:notifications` | Lista notifiche (max 200) |
| `nexus:signal_log` | Lista segnali generati |
| `nexus:learning:outcomes` | Trade outcomes per adaptive learning (max 10k) |
| `nexus:learning:insights:{asset}` | Insights per asset — TTL 1h |
| `nexus:learning:weights:{asset}` | Pesi adattivi — TTL 30min |
| `nexus:history:{asset}:{tf}` | Dati OHLCV storici — TTL variabile |
| `nexus:ohlcv:{asset}:{tf}` | Cache MTF data — TTL per timeframe |
| `nexus:news:{asset}` | News sentiment cache — TTL 15min |
| `nexus:rnd:training:{asset}:{tf}:{strategy}` | Training result — TTL 24h |
| `nexus:rnd:knowledge` | Knowledge base — TTL 24h |

## Process Management (PM2)

```
nexus-web   — Next.js production server (port 3000)
nexus-cron  — HTTP cron worker (chiama /api/cron/tick ogni 60s)
```

`ecosystem.config.js` configura entrambi.

## Comandi

```bash
pnpm dev              # Dev server con HMR
pnpm build            # Production build
pnpm prod             # Build + PM2 start
pnpm prod:stop        # PM2 stop all
pnpm prod:logs        # PM2 logs
pnpm test             # Vitest (100 tests)
pnpm tunnel           # Cloudflare Tunnel (accesso smartphone)
```

## External Services

| Servizio | Uso | Rate Limit |
|---|---|---|
| Alpaca Markets | Broker (paper + live), News API | Illimitato (paper) |
| Twelve Data | Stock OHLCV + prices | 8 req/min (free) |
| CoinGecko | Crypto OHLCV + prices | 30 req/min (free) |
| Upstash Redis | Persistence (REST API) | 10k req/day (free) |
| Discord Webhook | Notifiche opzionali | Illimitato |

## Mobile Responsive

- **Desktop (>1024px)**: sidebar 240px, contenuto flex
- **Mobile (<768px)**: sidebar nascosta → hamburger, topbar con logo + campana
- **Operazioni**: tabella desktop → card view mobile
- **Intelligence**: tabella desktop → card view mobile
- **Bottoni**: min-height 44px per touch targets
- **Ticker**: marquee animation, 32px height

## File Count

- **113 TypeScript/TSX files**
- **48 compiled routes** (28 pages + 20 API)
- **100 unit tests** (6 test files)
- **2 JS workers** (bot-worker, cron-worker)
