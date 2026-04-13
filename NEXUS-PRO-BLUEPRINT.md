# NEXUS PRO — Blueprint Completo v5.0

## Visione

Nexus Pro è un **centro di comando autonomo per trading algoritmico** che combina analisi AI multi-asset, backtesting avanzato, e execution automatica su mercati crypto e azionari. L'obiettivo è generare rendimento positivo attraverso strategie scoperte automaticamente dall'AI e validate su anni di dati storici.

---

## Architettura di Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NEXUS PRO PLATFORM                          │
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐    │
│  │     FRONTEND         │    │         BACKEND                  │    │
│  │  Next.js 14 + React  │◄──►│  API Routes + Cron Workers      │    │
│  │  Dashboard, Analisi  │    │  TypeScript server-side          │    │
│  │  Bot Manager, Settings│    │                                  │    │
│  └─────────────────────┘    └──────┬────────────────────────┘    │
│                                     │                              │
│  ┌──────────────────────────────────┼──────────────────────────┐  │
│  │                AI ENGINE CORE     │                          │  │
│  │  ┌─────────────┐  ┌─────────────┐│  ┌──────────────────┐   │  │
│  │  │  AI Analytic │  │ Full        ││  │ Genetic Optimizer │   │  │
│  │  │  Pipeline    │  │ Backtester  ││  │ (da NeuralTrade)  │   │  │
│  │  │  (5 fasi)    │  │             ││  │ NEW              │   │  │
│  │  └─────────────┘  └─────────────┘│  └──────────────────┘   │  │
│  │  ┌─────────────┐  ┌─────────────┐│  ┌──────────────────┐   │  │
│  │  │ Live Observer│  │ Mine Rule   ││  │ Kelly Criterion   │   │  │
│  │  │ (regime,     │  │ Executor    ││  │ Position Sizing   │   │  │
│  │  │  confluence) │  │             ││  │ NEW              │   │  │
│  │  └─────────────┘  └─────────────┘│  └──────────────────┘   │  │
│  └──────────────────────────────────┼──────────────────────────┘  │
│                                     │                              │
│  ┌──────────────────────────────────┼──────────────────────────┐  │
│  │             EXECUTION LAYER       │                          │  │
│  │  ┌─────────────┐  ┌─────────────┐│  ┌──────────────────┐   │  │
│  │  │ Bot Runner  │  │ Mine Engine ││  │ AIC Instances     │   │  │
│  │  │ (multi-bot) │  │ (auto-trade)││  │ BTC/ETH/SOL      │   │  │
│  │  └─────────────┘  └─────────────┘│  │ (Python/Kraken)   │   │  │
│  │                                   │  └──────────────────┘   │  │
│  └──────────────────────────────────┼──────────────────────────┘  │
│                                     │                              │
│  ┌──────────────────────────────────┼──────────────────────────┐  │
│  │          DATA & PERSISTENCE       │                          │  │
│  │  Alpaca API │ CoinGecko │ CoinMarketCap │ Finnhub │ FMP    │  │
│  │  Redis (Upstash) │ Supabase (Auth)                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnologico

| Componente | Tecnologia | Ruolo |
|-----------|-----------|-------|
| Frontend | Next.js 14 + React + Tailwind CSS | Dashboard, pagine asset, bot manager |
| Backend | Next.js API Routes + TypeScript | REST API, business logic |
| Workers | PM2 + cron-worker.js | Tick 60s: bot, mine, live observer, news |
| AI Engine | TypeScript (analytics pipeline) | Pattern mining, backtesting, strategy discovery |
| AIC | Python (Kraken data) | Real-time indicator engine, segnali, confluence |
| Database | Upstash Redis (REST) | State, cache, signal log, bot config |
| Auth | Supabase | Users, sessions |
| Broker | Alpaca Markets | Paper + Live trading, OHLCV data |
| Data Providers | CoinGecko, CoinMarketCap, Finnhub, FMP | Prezzi, metadata, news, earnings |
| Hosting | DigitalOcean Droplet (3.8GB) | Produzione |

---

## Struttura Directory

```
nexus-pro/
├── src/
│   ├── app/
│   │   ├── (dashboard)/           # Pagine protette (layout con sidebar)
│   │   │   ├── dashboard/         # Home — portfolio, posizioni, ordini
│   │   │   ├── analisi/           # Hub AI Analytics
│   │   │   │   └── [symbol]/      # Analisi dettagliata per asset
│   │   │   ├── bot/               # Bot Manager — crea, gestisci, monitora
│   │   │   ├── operazioni/        # Storico operazioni
│   │   │   ├── portfolio/         # Portfolio dettagliato
│   │   │   ├── mines/             # Mine Engine dashboard
│   │   │   ├── impostazioni/      # Settings — broker, AI engine, profilo
│   │   │   ├── connections/       # Connessioni broker
│   │   │   └── status/            # System status
│   │   ├── api/
│   │   │   ├── auth/              # Login, register, logout, me
│   │   │   ├── bot/               # start, stop, status
│   │   │   ├── broker/            # account, positions, orders, status, test
│   │   │   ├── analytics/         # [symbol]: report, live, backtest, refresh
│   │   │   ├── aic/               # status, activity, confluence, research
│   │   │   ├── asset/             # [symbol]/intel — aggregated intelligence
│   │   │   ├── mine/              # list, [id], engine, manual
│   │   │   ├── cron/              # tick, mine-tick, live-observer, news, retrain
│   │   │   ├── prices/            # Top 15 movers (auto)
│   │   │   │   └── symbol/        # Single asset live price
│   │   │   ├── portfolio/         # Portfolio snapshot
│   │   │   ├── performance/       # Performance metrics
│   │   │   ├── trades/            # Trade history
│   │   │   ├── settings/          # User settings CRUD
│   │   │   └── health/            # Health check
│   │   └── layout.tsx, page.tsx   # Root layout, login redirect
│   ├── components/
│   │   ├── analytics/             # LiveContextCard, AICInsightsCard, AssetIntelCard
│   │   ├── mine/                  # MineCard, PortfolioGauge
│   │   ├── ui/                    # MetricTooltip
│   │   ├── sidebar.tsx            # Navigation
│   │   ├── ticker.tsx             # Top 15 movers banner
│   │   └── notification-bell.tsx  # Notifications
│   ├── lib/
│   │   ├── analytics/             # AI ENGINE CORE
│   │   │   ├── asset-analytic.ts  # 5-phase training pipeline
│   │   │   ├── live-observer.ts   # Real-time regime + context
│   │   │   ├── types.ts           # All analytics types
│   │   │   ├── backtester/        # Full Backtester + Mine Rule Executor
│   │   │   ├── cognition/         # Strategy definitions (6 strategies)
│   │   │   ├── perception/        # MTF analysis, regime classifier
│   │   │   ├── learning/          # Feedback loop, outcome tracker
│   │   │   ├── action/            # Bot runner, notifications, risk
│   │   │   ├── news/              # RSS aggregator + sentiment
│   │   │   └── macro/             # Economic calendar
│   │   ├── mine/                  # MINE ENGINE
│   │   │   ├── mine-tick.ts       # 60s orchestrator
│   │   │   ├── signal-detector.ts # Signal generation
│   │   │   ├── decision-engine.ts # Risk gates + AIC gates
│   │   │   ├── risk-manager.ts    # TP/SL + position sizing
│   │   │   ├── execution.ts       # Alpaca order placement
│   │   │   ├── mine-store.ts      # Redis CRUD
│   │   │   ├── aic-client.ts      # AIC HTTP client
│   │   │   └── feedback.ts        # Closed mine → scorecard
│   │   ├── broker/                # Broker adapters
│   │   │   ├── alpaca.ts          # AlpacaBroker class
│   │   │   └── alpaca-keys.ts     # Key resolver (env → Redis)
│   │   ├── data-providers/        # External data APIs
│   │   │   ├── fmp.ts             # Financial Modeling Prep
│   │   │   ├── coinmarketcap.ts   # CMC metadata
│   │   │   ├── finnhub.ts         # Stock fundamentals
│   │   │   ├── cryptopanic.ts     # Crypto news (deprecated, needs key)
│   │   │   └── trading-economics.ts # Economic calendar (guest)
│   │   ├── research/              # Offline analysis
│   │   │   └── deep-mapping/      # Historical pattern mining
│   │   ├── core/                  # Shared primitives
│   │   │   ├── indicators.ts      # 15+ technical indicators
│   │   │   └── patterns.ts        # Candlestick pattern detection
│   │   ├── db/                    # Database
│   │   │   └── redis.ts           # Upstash REST client with retry
│   │   ├── config/                # Asset + strategy configuration
│   │   └── utils/                 # Encryption, formatting
│   ├── types/                     # Global TypeScript types
│   ├── stores/                    # Client-side state
│   ├── hooks/                     # Custom React hooks
│   └── workers/                   # PM2 workers
│       ├── cron-worker.js         # Main 60s cron
│       └── bot-worker.js          # Bot-specific worker
├── tests/unit/                    # 32 test files, 374 tests
├── CLAUDE.md                      # Instructions for AI development
├── NEXUS-PRO-BLUEPRINT.md         # THIS FILE
├── .env.local                     # Environment variables (not in git)
└── .env.local.example             # Template
```

---

## Backend — Moduli Dettagliati

### 1. AI Analytics Pipeline (`src/lib/analytics/asset-analytic.ts`)

**5 fasi di training per ogni asset:**

| Fase | % | Cosa fa | Output |
|------|---|---------|--------|
| Download | 0→25% | Scarica OHLCV da Alpaca (5m, 15m, 1h, 4h, 1d, fino a 4 anni) | DeepHistory |
| Analysis | 25→55% | Analizza ogni candela 1h → CandleContext (15 indicatori + ground truth) | CandleContext[] |
| Mining | 55→75% | Testa 4.495 combinazioni di 2-3 condizioni, filtra con Wilson score | Top 50 MinedRule[] |
| Profiling | 75→90% | Reaction zones, indicator reactivity, strategy fit + **Full Backtest** | StrategyFit[], BacktestReport |
| Finalize | 90→100% | Salva report in Redis, schedula prossimo refresh (7gg) | AnalyticReport |

**Dati storici per timeframe:**
- 5m: ~50.000 candele (~6 mesi) — scalping
- 15m: ~35.000 candele (~1 anno)
- 1h: ~17.500 candele (~2 anni) — analysis principale
- 4h: ~9.000 candele (tutto lo storico)
- 1d: ~1.500 candele (4 anni)

### 2. Full Backtester (`src/lib/analytics/backtester/`)

**Simulazione realistica di ogni strategia:**
- Capitale iniziale: $100.000 / $100 per trade (scalabile a $1.000/$10 per UI)
- 6 strategie coded + top 10 mined rules × 4 timeframe = 64+ combinazioni
- Per ogni trade: entry con slippage, SL/TP da ATR (2× SL, 3× TP), trailing stop, commissioni 0.1%
- Output: StrategyTimeframeResult con WR, PF, Sharpe, Sortino, Calmar, max DD, equity curve

**Mine Rule Executor** (`mine-rule-executor.ts`):
- Converte le 30 condizioni del pattern miner in funzioni runtime
- Ogni MinedRule diventa una Strategy eseguibile dal backtester e dal bot

### 3. Live Observer (`src/lib/analytics/live-observer.ts`)

**Aggiornamento ogni 60s per TUTTI gli asset (in parallelo):**
- Fetch ultime 200 candele 1h da Alpaca
- Calcola indicatori (RSI, MACD, BB, ADX, Stochastic, ATR)
- Classifica regime: TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE
- Match delle topRules contro stato attuale → active rules
- Trova zone S/R più vicine al prezzo
- Salva in Redis con TTL 10 min

### 4. Mine Engine (`src/lib/mine/`)

**Trading automatico AI-driven (tick ogni 60s):**

```
mine-tick.ts
├── isEngineEnabled()? → check Redis flag
├── loadState() → account info, active mines, profile
├── syncPendingMines() → check entry order fills
├── monitorOpenMines() → TP/SL/timeout/trailing check
├── detectSignals() → AIC-first → TS fallback
│   ├── tryAICSignal() → /signals endpoint
│   ├── detectZoneBounce()
│   ├── detectTrendContinuation()
│   └── detectBreakoutConfirm()
├── evaluateSignals() → decision-engine gates
│   ├── regime check (DISTRIBUTION + LONG = block)
│   ├── confluence scoring
│   ├── risk checks (max %, max positions)
│   └── confidence threshold
├── executeActions() → open/close mines via Alpaca
└── saveFeedback() → outcomes for learning
```

### 5. Bot Runner (`src/lib/analytics/action/live-runner.ts`)

**Multi-bot con signal chain:**
1. **AIC signal** (crypto, se online) → highest priority
2. **Mined Rule** (se bot configurato con `usesMineRules`) → specific conditions
3. **TS strategies** (fallback generico) → 6 coded strategies
4. **Live Context enrichment** → regime gate, zone boost

**Per ogni bot:**
- Config: asset[], strategies[], riskLevel, operationMode, TP/SL calibrati
- Tick interval: scalp=60s, intraday=300s, daily=3600s
- Circuit breaker: daily/weekly/total drawdown limits
- Pre-trade checks: P&L metrics, macro blackout, position limits

### 6. Data Providers (`src/lib/data-providers/`)

| Provider | Cosa fornisce | Auth |
|----------|-------------|------|
| FMP | Company profile, earnings, ratings | API key (free 250/day) |
| CoinMarketCap | Rank, market cap, dominance, supply, % changes | API key (free 10k/month) |
| Finnhub | Stock profile, P/E, EPS, 52w range, recommendations, news | API key (free 60/min) |
| Trading Economics | Economic calendar 30gg (guest tier) | Nessuna |

---

## Frontend — Pagine e Componenti

### Dashboard (`/dashboard`)
- **Portfolio value** hero con variazione giornaliera
- **Stats grid**: equity, cash, buying power, bot attivi
- **Posizioni aperte**: tabella live da Alpaca con P&L
- **Ordini recenti**: status badge (eseguito/annullato/in attesa)
- Badge LIVE/PAPER, auto-refresh 15s

### Analisi Asset (`/analisi/[symbol]`)
- **Hero banner**: candele analizzate, strategie testate, trade simulati
- **Simulazione Trading $1000→?**: card per ogni strategia con capitale finale, WR, PF
- **AI Live Monitor**: prezzo live (15s), regime, momentum, active rules, pulsing badge
- **AI Activity Feed**: segnali AIC, confluence, backtest results — live 15s
- **Asset Intelligence**: CMC metadata, Finnhub fundamentals, macro calendar, news
- **Come operare**: stile consigliato, timeframe, regime migliore
- **Segnali acquisto/vendita**: regole minate con spiegazione in italiano
- **Classifica Strategie**: tabella completa con "Lancia Bot" per ogni riga

### Bot Manager (`/bot`)
- **Due modalità creazione**: AI Ranking (seleziona dalla classifica) + Manuale
- **Multi-strategy selection**: checkbox multiple, stats combinate
- **Bot cards**: status, P&L, WR, trades, badge AI-CAL/MINE RULE
- **Mine Engine section**: toggle ON/OFF, mine attive

### Impostazioni (`/impostazioni`)
- **Connessione Broker**: API keys, "Collega Broker" (test+save), "Disconnetti" (con password)
- **AI Engine**: Mine Engine toggle, profilo rischio (Prudente/Moderato/Aggressivo)
- **Notifiche**: Trade + Segnali
- **Profilo**: Nome, email, timezone

---

## Flussi Operativi

### Flusso completo: dall'analisi al trade

```
1. Utente va su /analisi → sceglie asset (es. BTC/USD)
2. Clicca "Aggiorna ora" → training pipeline 5 fasi
3. AI scarica 4 anni di storico, analizza 100k+ candele
4. Pattern mining: 4.495 combo testate → top 50 regole
5. Full Backtest: 64 strategie × TF con $100k simulati
6. Report salvato in Redis con classifica ranked
7. UI mostra: "Simulazione Trading $1000→$1004" per ogni strategia
8. Utente clicca "Lancia Bot" sulla strategia migliore
9. → Redirect a /bot con config pre-popolata (TP/SL calibrati, TF, strategy)
10. Clicca "Lancia Bot AI-Calibrato"
11. Bot attivo → tick ogni N secondi
12. Ogni tick: AIC signal? → Mined Rule match? → TS fallback?
13. Se segnale OK: check regime, confluence, risk → ordine Alpaca
14. Ordine eseguito con TP/SL dal backtest storico
15. Trade chiuso → feedback → scorecard → migliora la strategia
```

### Cron Worker (ogni 60 secondi)

```
cron-worker.js → 6 endpoint in sequenza:
1. /api/cron/tick          → Bot tick (tutti i multi-bot)
2. /api/cron/analytic-tick → Queue worker per training jobs
3. /api/cron/live-observer-tick → Live context TUTTI gli asset
4. /api/cron/news-tick     → 1 asset round-robin per news
5. /api/cron/mine-tick     → Mine Engine (tutti i simboli)
6. /api/cron/auto-retrain-tick → Ogni 1h, incremental training
```

---

## Migliorie da Implementare (da NeuralTrade)

### PRIORITÀ 1: Genetic Optimizer

**Cosa**: Algoritmo genetico che scopre automaticamente le combinazioni ottimali di indicatori, parametri, e TP/SL per ogni asset/timeframe.

**Come funziona**:
```
Genoma = {
  indicatori_attivi: bitmask(19 indicatori),
  parametri: { rsi_period, macd_fast, bb_std, ... },
  tp_atr_multiplier, sl_atr_multiplier,
  trailing_config
}

Evoluzione:
- Popolazione: 100 individui
- Generazioni: 200
- Selezione: Tournament (size 5)
- Crossover: Uniform (70%)
- Mutazione: Adattiva (15%)
- Fitness: Sharpe + Calmar + Profit Factor
- Validazione: Walk-forward 70/30
```

**Dove**: `src/lib/analytics/optimizer/genetic-optimizer.ts`
**Integrazione**: Sostituisce/affianca il pattern mining nella fase 3 della pipeline

### PRIORITÀ 2: Indicatori Avanzati (da NeuralTrade)

**10 nuovi indicatori da aggiungere a `src/lib/core/indicators.ts`**:
1. Ichimoku Cloud (tenkan, kijun, senkou A/B, chikou)
2. Parabolic SAR (af=0.02, max_af=0.2)
3. CCI (Commodity Channel Index)
4. Williams %R
5. MFI (Money Flow Index)
6. Keltner Channels
7. Squeeze Momentum
8. CMF (Chaikin Money Flow)
9. Fibonacci Retracement levels
10. Pivot Points avanzati (standard, fibonacci, camarilla)

### PRIORITÀ 3: Kelly Criterion Position Sizing

**Formula**: `kelly = (WR × avg_win - (1-WR) × avg_loss) / avg_win × fraction`

**Dove**: `src/lib/mine/risk-manager.ts` + `src/lib/analytics/action/risk.ts`
**Integrazione**: Opzione in CapitalProfile, usa dati dal backtest per calcolo automatico

### PRIORITÀ 4: Walk-Forward Validation Migliorata

**Da NeuralTrade**: Split 70/30 train-test con k-fold rolling window
**Integrazione**: Nel Full Backtester per validare che le strategie non siano overfittate

---

## Infrastruttura Produzione

### Droplet DigitalOcean

| Processo PM2 | Funzione | Porta | RAM |
|---|---|---|---|
| nexus-web | Next.js server | 3000 | ~150MB |
| nexus-cron | Worker 60s | — | ~60MB |
| aic-btc | AIC Python BTC | 8080 | ~370MB |
| aic-eth | AIC Python ETH | 8081 | ~370MB |
| aic-sol | AIC Python SOL | 8082 | ~370MB |

**RAM**: 3.8GB totale, ~1.3GB usata, 2GB swap
**OS**: Ubuntu 22.04, Node 20, Python 3.12

### Redis (Upstash)

**Chiavi principali:**
```
nexus:analytic:{symbol}           → AssetAnalytic state
nexus:analytic:report:{symbol}    → AnalyticReport (backtest, rules, zones)
nexus:analytic:backtest:{symbol}  → Full BacktestReport
nexus:analytic:live:{symbol}      → LiveContext (10min TTL)
nexus:bot:config                  → MultiBotConfig[]
nexus:bot:state:{botId}           → Bot runtime state
nexus:mine:{id}                   → Mine object (7d TTL)
nexus:broker:keys                 → API keys (da UI)
nexus:session:{id}                → User session
nexus:{userId}:settings           → User preferences
```

### Variabili d'Ambiente

```bash
# Obbligatorie
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ALPACA_API_KEY=          # Paper
ALPACA_API_SECRET=       # Paper
ENCRYPTION_KEY=          # 64-char hex

# Opzionali — Data Providers
FMP_API_KEY=             # Financial Modeling Prep
COINMARKETCAP_API_KEY=   # CoinMarketCap
FINNHUB_API_KEY=         # Finnhub
TWELVE_DATA_API_KEY=     # TwelveData stocks

# AIC (Python instances)
AIC_BTC_URL=http://localhost:8080
AIC_ETH_URL=http://localhost:8081
AIC_SOL_URL=http://localhost:8082
```

---

## Test

**32 file test, 374+ test unitari (Vitest)**

| Area | File | Test | Coverage |
|------|------|------|----------|
| Backtester | 2 | 20 | full-backtester, mine-rule-executor |
| Broker | 1 | 6 | alpaca-keys resolution |
| Analytics | 10 | 78 | pipeline, queue, narrative, zones, feedback |
| Engine | 4 | 63 | indicators, patterns, risk, strategies |
| Mine | 7 | 129 | types, store, execution, signal, decision, tick, aic |
| DB | 3 | 19 | redis helpers, retry, get parsing |

**Comando**: `pnpm test:run` (deve essere verde prima di ogni deploy)

---

## Regole di Sviluppo

1. **Test prima, deploy dopo**: `pnpm test:run && pnpm build` deve passare
2. **Codice in inglese, UI in italiano**: variabili/funzioni in inglese, testo UI in italiano
3. **Leggi prima di scrivere**: mai modificare un file senza averlo letto tutto
4. **RAM budget**: 3.8GB totale, ogni processo deve stare sotto i suoi limiti
5. **Redis payload**: Upstash free tier ha limiti — non salvare equity curves o trade individuali
6. **Gradual degradation**: ogni provider esterno deve funzionare anche offline (fallback)
7. **No secrets in code**: tutte le keys in .env.local, mai committate
8. **Branch per feature**: nuove feature su branch, merge in main dopo test

---

## Roadmap

### Fase corrente: Stabilizzazione + Migliorie NeuralTrade

- [ ] Genetic Optimizer (scoperta automatica strategie)
- [ ] 10 nuovi indicatori (Ichimoku, PSAR, CCI, etc.)
- [ ] Kelly Criterion position sizing
- [ ] Walk-forward validation k-fold
- [ ] Calendario macro funzionante (sostituire ForexFactory)
- [ ] Multi-lingua (i18n: EN, ES, ZH, PT)

### Fase successiva: Produzione e Scaling

- [ ] Dominio personalizzato + HTTPS
- [ ] Monitoring (Sentry error tracking)
- [ ] Alerting Telegram/Discord per trade
- [ ] Multi-user (pricing, quote)
- [ ] Mobile responsive optimization
- [ ] Advanced charting (TradingView widget)
