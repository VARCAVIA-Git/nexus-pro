# Phase 4: Strategy V2 + Mine Engine — Development Kit

**Documento di architettura e piano operativo per sviluppo autonomo**
**Data**: 2026-04-09
**Autore**: Riccardo (visione) + Claude Opus (architettura)
**Per**: Claude Code — esecuzione autonoma

---

## 0. Come usare questo documento

Sei Claude Code su Ubuntu. Questo documento è il tuo piano di volo per Phase 4 di Nexus Pro. Leggi tutto prima di scrivere una riga di codice. Poi procedi step-by-step seguendo il piano operativo alla fine.

**Regole operative:**
1. Lavora su branch `phase-4-mine-engine` (crealo da `main`)
2. Prima di ogni step, leggi i file sorgente coinvolti per capire il contesto reale
3. Dopo ogni step completato: `pnpm test:run && pnpm build` — deve essere verde
4. Aggiorna `PHASE-4-PROGRESS.md` dopo ogni step completato
5. Committa ogni step separatamente con messaggi chiari
6. Se qualcosa non è chiaro, chiedi a Riccardo. Non inventare.
7. Rispetta i vincoli di memoria (1GB RAM + 2GB swap su produzione)

---

## 1. Visione del progetto

Nexus Pro è un sistema di trading algoritmico intelligente e autonomo. L'obiettivo è un "cervello" che:
- **Analizza** il mercato in tempo reale (Phase 2-3, COMPLETATA)
- **Decide** quando e come entrare/uscire dalle posizioni (Phase 4, QUESTA)
- **Esegue** gli ordini tramite Alpaca broker
- **Impara** dai risultati per migliorare le decisioni future

La metafora è quella di una **miniera (mine)**: il sistema "scava" opportunità di profitto. Ogni operazione attiva è una mine.

---

## 2. Stack e vincoli tecnici

```
Next.js 14 App Router + React 18 + TypeScript + Tailwind CSS
Upstash Redis (HTTP/REST, free tier) — retry wrapper 3x backoff, 8s timeout
Alpaca broker (paper + live, IEX feed stocks, crypto BTC/ETH/SOL)
PM2: nexus-web + nexus-cron (tick ogni 60s su 5 endpoint)
DigitalOcean: 1GB RAM + 2GB swap
NODE_OPTIONS="--max-old-space-size=1536"
Test: Vitest (pnpm test:run)
Build: pnpm build
```

**Vincoli critici:**
- Redis free tier: max ~10k comandi/giorno, tieni payload piccoli
- 1GB RAM: no array enormi in memoria, streaming dove possibile
- Cron tick 60s: tutto il processing per tick deve completare in <50s
- Alpaca paper: rate limit 200 req/min

---

## 3. Contesto esistente — Cosa c'è già

### 3.1 Analytics Pipeline (Phase 2) — Output che userai

Il training pipeline in `src/lib/analytics/asset-analytic.ts` produce per ogni asset:

```typescript
// Chiave Redis: nexus:analytics:{symbol}
interface AnalyticsReport {
  symbol: string;
  trainedAt: string;
  candles: number;
  timeframe: string;
  
  // Phase: analysis
  indicators: {
    trend_short: 'UP' | 'DOWN' | 'NEUTRAL';
    trend_medium: 'UP' | 'DOWN' | 'NEUTRAL';
    trend_long: 'UP' | 'DOWN' | 'NEUTRAL';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    momentum: number; // RSI-like 0-100
    volume_profile: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  };
  
  // Phase: mining — Pattern con Wilson lower bound
  patterns: Array<{
    name: string;
    occurrences: number;
    success_rate: number;
    wilson_lb: number; // Lower bound confidence
    avg_return: number;
    timeframe: string;
  }>;
  
  // Phase: profiling — Reaction zones (support/resistance)
  zones: Array<{
    price: number;
    type: 'support' | 'resistance';
    strength: number; // 1-10
    touches: number;
  }>;
  
  // Phase: finalize — Strategy fit backtesting
  strategies: Array<{
    type: 'reversion' | 'trend' | 'breakout';
    timeframe: '15m' | '1h' | '4h' | '1d';
    trades: number;
    win_rate: number;
    profit_factor: number;
    sharpe: number;
    max_drawdown: number;
    avg_win: number;
    avg_loss: number;
    wilson_lb: number;
  }>;
}
```

### 3.2 Live Observer (Phase 3)

`src/lib/analytics/live-observer.ts` — round-robin 60s su BTC→ETH→SOL

Produce un **live context** per ogni asset:

```typescript
// Chiave Redis: nexus:live:{symbol}
interface LiveContext {
  symbol: string;
  price: number;
  timestamp: string;
  change_1h: number;
  change_24h: number;
  volume_24h: number;
  // Confronto con analytics
  nearest_support: number;
  nearest_resistance: number;
  distance_to_support_pct: number;
  distance_to_resistance_pct: number;
  // Segnali
  trend_alignment: boolean; // short+medium concordano
  at_zone: boolean; // prezzo vicino a una reaction zone
  zone_type: 'support' | 'resistance' | null;
}
```

### 3.3 News & Macro (Phase 3)

```typescript
// nexus:news:{symbol} — top 10 news FIFO
interface NewsItem {
  title: string;
  source: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1
  timestamp: string;
}

// nexus:macro:events — prossimi eventi economici
interface MacroEvent {
  title: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  datetime: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}
```

### 3.4 Redis wrapper

`src/lib/db/redis.ts` — Upstash HTTP wrapper con retry:
- `redisGet(key)`, `redisSet(key, value, ttl?)`, `redisDel(key)`
- `redisLock(key, ttl)`, `redisUnlock(key)`
- Retry 3x con exponential backoff
- Timeout 8s

### 3.5 Cron worker

`src/workers/cron-worker.js` — PM2 tick ogni 60s chiama:
1. `/api/cron/live-observer` — aggiorna live context
2. `/api/cron/news-tick` — aggiorna news
3. `/api/cron/macro-tick` — aggiorna macro events  
4. `/api/cron/training-tick` — retrain orario (gated da lock)
5. (NUOVO) `/api/cron/mine-tick` — **da aggiungere in Phase 4**

### 3.6 Alpaca integration esistente

Cerca nel codebase i file che interagiscono con Alpaca. Probabilmente in `src/lib/broker/` o `src/lib/alpaca/`. I bot legacy (BTC AGGRESSIVO/TRANQUILLO) usavano Alpaca per paper trading. Studia come funziona prima di costruire il nuovo layer.

**Alpaca endpoints chiave:**
- `POST /v2/orders` — piazza ordine
- `GET /v2/positions` — posizioni aperte
- `GET /v2/account` — equity, buying power
- `DELETE /v2/orders/{id}` — cancella ordine
- Crypto: `POST /v1beta3/crypto/{loc}/orders`

### 3.7 Bot legacy (da NON replicare)

I vecchi bot (BTC AGGRESSIVO, BTC TRANQUILLO) sono stati disabilitati. Studia il loro codice per capire cosa facevano, ma il Mine Engine è un sistema completamente nuovo. Non estendere il vecchio sistema bot.

---

## 4. Architettura Phase 4

### 4.1 Concetti chiave

```
┌─────────────────────────────────────────────────────┐
│                    MINE ENGINE                       │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Signal    │──▶│ Decision │──▶│ Execution    │    │
│  │ Detector  │   │ Engine   │   │ Layer        │    │
│  └──────────┘   └──────────┘   └──────────────┘    │
│       ▲              │               │               │
│       │              ▼               ▼               │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Live     │   │ Risk     │   │ Alpaca       │    │
│  │ Context  │   │ Manager  │   │ Broker       │    │
│  └──────────┘   └──────────┘   └──────────────┘    │
│       ▲              │               │               │
│       │              ▼               ▼               │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐    │
│  │ Analytics│   │ Capital  │   │ Feedback     │    │
│  │ Report   │   │ Profiles │   │ Loop         │    │
│  └──────────┘   └──────────┘   └──────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 4.2 Mine — Entità centrale

Una **Mine** è un'operazione di trading con lifecycle completo.

```typescript
// File: src/lib/mine/types.ts

type MineStatus = 'pending' | 'open' | 'monitoring' | 'closing' | 'closed' | 'cancelled';
type MineOutcome = 'tp_hit' | 'sl_hit' | 'timeout' | 'manual' | 'trailing_exit';
type StrategyType = 'reversion' | 'trend' | 'breakout';
type AggressivenessProfile = 'conservative' | 'moderate' | 'aggressive';

interface Mine {
  id: string;               // UUID v4
  symbol: string;           // BTC, ETH, SOL
  status: MineStatus;
  
  // Strategia
  strategy: StrategyType;
  timeframe: '15m' | '1h' | '4h' | '1d';
  direction: 'long' | 'short';
  
  // Entry
  entry_signal: EntrySignal;
  entry_price: number | null;
  entry_time: string | null;
  entry_order_id: string | null;
  
  // Exit targets (derivati da analytics)
  take_profit: number;
  stop_loss: number;
  trailing_stop_pct: number | null;   // opzionale, attivato dopo +X%
  timeout_hours: number;               // max durata mine
  
  // Position sizing
  profile: AggressivenessProfile;
  allocated_capital: number;           // $ allocati
  quantity: number;                    // qty asset
  
  // Monitoring
  unrealized_pnl: number;
  max_unrealized_pnl: number;         // per trailing stop
  ticks_monitored: number;
  last_check: string;
  
  // Exit
  exit_price: number | null;
  exit_time: string | null;
  exit_order_id: string | null;
  outcome: MineOutcome | null;
  realized_pnl: number | null;
  
  // Meta
  created_at: string;
  updated_at: string;
  notes: string[];                    // log di decisioni
}

interface EntrySignal {
  type: 'zone_bounce' | 'trend_continuation' | 'breakout_confirm' | 'pattern_match';
  confidence: number;         // 0-1
  source_pattern?: string;    // nome del pattern da mining
  source_zone?: number;       // prezzo della reaction zone
  news_sentiment?: number;    // sentiment medio news recenti
  macro_clear: boolean;       // nessun evento macro high-impact imminente
}
```

### 4.3 Capital Profiles

```typescript
// File: src/lib/mine/capital-profiles.ts

interface CapitalProfile {
  name: AggressivenessProfile;
  max_portfolio_risk_pct: number;      // % max dell'equity totale a rischio
  max_single_mine_risk_pct: number;    // % max equity per singola mine
  max_concurrent_mines: number;         // mine aperte contemporaneamente (globale)
  max_mines_per_asset: number;          // mine aperte per singolo asset
  sl_multiplier: number;                // moltiplicatore per stop loss
  tp_multiplier: number;                // moltiplicatore per take profit
  min_confidence: number;               // confidenza minima segnale per aprire
  trailing_stop_activation_pct: number; // attiva trailing dopo +X%
  trailing_stop_distance_pct: number;   // distanza trailing dal max
  timeout_hours: number;                // durata massima mine
}

const PROFILES: Record<AggressivenessProfile, CapitalProfile> = {
  conservative: {
    name: 'conservative',
    max_portfolio_risk_pct: 5,        // max 5% equity a rischio
    max_single_mine_risk_pct: 1,      // max 1% per mine
    max_concurrent_mines: 3,
    max_mines_per_asset: 1,
    sl_multiplier: 1.5,               // SL più largo → meno stop out
    tp_multiplier: 2.0,               // TP = 2x il risk
    min_confidence: 0.7,
    trailing_stop_activation_pct: 3,
    trailing_stop_distance_pct: 1.5,
    timeout_hours: 48,
  },
  moderate: {
    name: 'moderate',
    max_portfolio_risk_pct: 10,
    max_single_mine_risk_pct: 2,
    max_concurrent_mines: 5,
    max_mines_per_asset: 2,
    sl_multiplier: 1.2,
    tp_multiplier: 2.5,
    min_confidence: 0.55,
    trailing_stop_activation_pct: 2,
    trailing_stop_distance_pct: 1,
    timeout_hours: 72,
  },
  aggressive: {
    name: 'aggressive',
    max_portfolio_risk_pct: 20,
    max_single_mine_risk_pct: 4,
    max_concurrent_mines: 8,
    max_mines_per_asset: 3,
    sl_multiplier: 1.0,
    tp_multiplier: 3.0,
    min_confidence: 0.4,
    trailing_stop_activation_pct: 1.5,
    trailing_stop_distance_pct: 0.8,
    timeout_hours: 96,
  },
};
```

### 4.4 Signal Detector

Il Signal Detector gira ad ogni mine-tick (60s) e produce segnali di entry.

```typescript
// File: src/lib/mine/signal-detector.ts

interface SignalDetectorInput {
  symbol: string;
  live: LiveContext;
  analytics: AnalyticsReport;
  news: NewsItem[];
  macro: MacroEvent[];
  active_mines: Mine[];  // mine già aperte per questo asset
}

interface DetectedSignal {
  symbol: string;
  signal: EntrySignal;
  suggested_strategy: StrategyType;
  suggested_timeframe: string;
  suggested_direction: 'long' | 'short';
  suggested_tp: number;
  suggested_sl: number;
}

// Logica di detection:
// 1. Controlla se prezzo è vicino a una reaction zone → zone_bounce
// 2. Controlla trend alignment (short+medium UP) + momentum → trend_continuation
// 3. Controlla se prezzo rompe resistance con volume → breakout_confirm
// 4. Controlla pattern match dalle rules del mining → pattern_match
// 5. Filtro macro: se c'è evento high-impact nelle prossime 2h → scarta segnale
// 6. Filtro news: sentiment molto negativo → scarta o riduci confidence
// 7. Filtro conflitto: se mine aperta nello stesso asset con direzione opposta → scarta
```

### 4.5 Decision Engine

Prende i segnali e decide cosa fare. Gate principale del sistema.

```typescript
// File: src/lib/mine/decision-engine.ts

// Input: DetectedSignal + stato corrente portfolio
// Output: MineAction[]

type MineAction = 
  | { type: 'open_mine'; mine: Partial<Mine> }
  | { type: 'close_mine'; mine_id: string; reason: MineOutcome }
  | { type: 'adjust_sl'; mine_id: string; new_sl: number }
  | { type: 'no_action'; reason: string };

// Logica:
// 1. Recupera equity da Alpaca account
// 2. Calcola rischio corrente (somma di tutte le mine aperte)
// 3. Per ogni segnale:
//    a. Confidence >= profile.min_confidence?
//    b. Rischio portfolio < max_portfolio_risk_pct?
//    c. Mine per asset < max_mines_per_asset?
//    d. Non c'è conflitto con mine esistenti?
//    e. Position sizing: quanto capitale allocare?
// 4. Per mine aperte:
//    a. TP raggiunto? → close
//    b. SL raggiunto? → close
//    c. Timeout? → close
//    d. Trailing stop attivo e triggerato? → close
//    e. Trailing stop da attivare? → adjust_sl
```

### 4.6 Execution Layer

Interfaccia con Alpaca. Supporta paper e live con un flag.

```typescript
// File: src/lib/mine/execution.ts

interface ExecutionConfig {
  mode: 'paper' | 'live';
  // Le API keys vengono da env vars:
  // ALPACA_API_KEY_PAPER / ALPACA_API_SECRET_PAPER
  // ALPACA_API_KEY_LIVE / ALPACA_API_SECRET_LIVE
}

interface OrderResult {
  success: boolean;
  order_id: string | null;
  filled_price: number | null;
  filled_qty: number | null;
  error: string | null;
}

// Metodi:
// placeOrder(symbol, side, qty, type, limit_price?) → OrderResult
// cancelOrder(order_id) → boolean
// getPositions() → Position[]
// getAccount() → { equity, buying_power, cash }
// getOrder(order_id) → OrderStatus
```

### 4.7 Redis Keys — Phase 4

```
# Mine attive (hash per mine, TTL 7 giorni)
nexus:mine:{mine_id}                    → JSON Mine object

# Indice mine attive per asset (set)
nexus:mines:active:{symbol}             → Set<mine_id>

# Indice mine per status (set)
nexus:mines:status:{status}             → Set<mine_id>

# Storico mine chiuse (list, FIFO max 100 per asset)
nexus:mines:history:{symbol}            → List<JSON Mine>

# Capital profile attivo
nexus:config:profile                    → AggressivenessProfile string

# Mine Engine state
nexus:mine-engine:enabled               → "true" | "false"
nexus:mine-engine:last-tick             → ISO timestamp
nexus:mine-engine:last-error            → string | null

# Portfolio snapshot (aggiornato ogni tick)
nexus:portfolio:snapshot                → JSON { equity, buying_power, total_allocated, total_unrealized_pnl, mines_count }

# Feedback loop — trade outcomes per retrain
nexus:feedback:{symbol}                 → List<JSON TradeOutcome>
```

### 4.8 API Routes — Phase 4

```
# Mine Engine control
POST /api/mine/engine          → { action: 'start' | 'stop' | 'status' }
GET  /api/mine/engine          → { enabled, last_tick, active_mines_count, ... }

# Mine CRUD
GET  /api/mine/list             → Mine[] (con filtri ?status=open&symbol=BTC)
GET  /api/mine/[id]             → Mine
POST /api/mine/[id]/close       → { reason: 'manual' } → chiude mine
POST /api/mine/manual           → { symbol, direction, strategy, ... } → apre mine manuale

# Portfolio
GET  /api/portfolio/snapshot    → PortfolioSnapshot
GET  /api/portfolio/history     → PortfolioHistory (equity curve)

# Capital profiles
GET  /api/config/profile        → CapitalProfile corrente
POST /api/config/profile        → { profile: 'conservative' | 'moderate' | 'aggressive' }

# Cron endpoint (chiamato da PM2)
POST /api/cron/mine-tick        → Esegue un ciclo del Mine Engine

# Feedback
GET  /api/feedback/[symbol]     → TradeOutcome[]
```

### 4.9 UI Pages — Phase 4

```
# Dashboard — aggiornare con:
- Card "Mine Engine" (on/off, mines attive, PnL oggi)
- Mini equity curve

# Nuova pagina: /mines
- Lista mine attive con status, PnL, TP/SL visivi
- Bottone "Chiudi" per close manuale
- Bottone "Apri Mine Manuale"
- Storico mine chiuse con outcome

# Nuova pagina: /portfolio
- Equity curve
- Allocazione corrente per asset
- Risk gauge (quanto del max risk è usato)

# Pagina /impostazioni — aggiungere:
- Selector profilo aggressività
- Toggle Mine Engine on/off
- Toggle paper/live mode (con conferma DOPPIA per live)
```

---

## 5. Mine Tick — Flusso completo (ogni 60s)

```
mine-tick START
│
├─ 1. Mine Engine abilitato? Se no → exit
│
├─ 2. Recupera stato corrente:
│    ├─ Account Alpaca (equity, buying power)
│    ├─ Mine attive da Redis
│    └─ Profile attivo
│
├─ 3. MONITOR mine aperte (per ogni mine attiva):
│    ├─ Prezzo corrente (da live context)
│    ├─ Calcola unrealized PnL
│    ├─ TP raggiunto? → CLOSE con tp_hit
│    ├─ SL raggiunto? → CLOSE con sl_hit
│    ├─ Timeout? → CLOSE con timeout
│    ├─ Trailing stop attivo? → aggiorna SL
│    └─ Trailing stop da attivare? → attiva
│
├─ 4. DETECT nuovi segnali (per ogni asset):
│    ├─ Leggi live context + analytics + news + macro
│    └─ Signal Detector → DetectedSignal[]
│
├─ 5. DECIDE (per ogni segnale):
│    ├─ Risk check → capitale disponibile?
│    ├─ Confidence check → sopra soglia profilo?
│    ├─ Conflitto check → mine opposta attiva?
│    └─ Se OK → OPEN nuova mine
│
├─ 6. EXECUTE azioni:
│    ├─ Per ogni CLOSE → piazza ordine di chiusura su Alpaca
│    ├─ Per ogni OPEN → piazza ordine di apertura su Alpaca
│    └─ Per ogni ADJUST → aggiorna mine in Redis
│
├─ 7. UPDATE stato:
│    ├─ Aggiorna mine in Redis
│    ├─ Aggiorna portfolio snapshot
│    ├─ Se mine chiusa → salva in history + feedback
│    └─ Aggiorna last-tick timestamp
│
└─ mine-tick END (target: <10s)
```

---

## 6. TP/SL — Come derivarli dall'analytics

Per ogni segnale di entry, TP e SL derivano dal report analitico:

```typescript
function computeTPSL(
  signal: DetectedSignal,
  analytics: AnalyticsReport,
  profile: CapitalProfile,
  currentPrice: number
): { tp: number; sl: number } {
  
  // 1. Trova la strategia che matcha nel report
  const strategyFit = analytics.strategies.find(
    s => s.type === signal.suggested_strategy && s.timeframe === signal.suggested_timeframe
  );
  
  if (!strategyFit) {
    // Fallback: usa avg_win/avg_loss dal report generale
    // o reaction zones come target
  }
  
  // 2. SL basato su:
  //    - avg_loss della strategia × sl_multiplier del profilo
  //    - distanza dalla reaction zone più vicina (support per long, resistance per short)
  //    - max_drawdown storico della strategia come cap
  
  // 3. TP basato su:
  //    - avg_win della strategia × tp_multiplier del profilo
  //    - reaction zone target (resistance per long, support per short)
  //    - profit_factor storico per calibrare aspettativa
  
  // 4. Validate:
  //    - TP/SL ratio >= 1.5 (altrimenti skip)
  //    - SL non più del max_single_mine_risk_pct dell'equity
  
  return { tp, sl };
}
```

---

## 7. Feedback Loop

Quando una mine si chiude, il suo outcome alimenta il retrain:

```typescript
// File: src/lib/mine/feedback.ts

interface TradeOutcome {
  mine_id: string;
  symbol: string;
  strategy: StrategyType;
  timeframe: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  outcome: MineOutcome;
  duration_hours: number;
  entry_signal: EntrySignal;
  closed_at: string;
}

// Salva in nexus:feedback:{symbol}
// Il training-tick (Phase 3) legge i feedback e li incorpora nel prossimo retrain
// Metriche: win rate per strategia, profit factor rolling, drawdown trend
```

---

## 8. Piano operativo — Step by Step

### Step 1: Fondamenta — Types + Utils
**Branch**: `phase-4-mine-engine` (da `main`)
**File da creare**:
- `src/lib/mine/types.ts` — Tutti i tipi/interfacce definiti sopra
- `src/lib/mine/constants.ts` — Capital profiles, default config
- `src/lib/mine/utils.ts` — Helpers (generateMineId, formatPnl, etc.)
- `src/lib/mine/__tests__/types.test.ts` — Test di validazione tipi

**Criterio di completamento**: Types importabili, test verde, build verde.

---

### Step 2: Mine Store — Redis CRUD
**File da creare**:
- `src/lib/mine/mine-store.ts` — CRUD mines in Redis
  - `createMine(mine)`, `getMine(id)`, `updateMine(id, partial)`
  - `getActiveMines(symbol?)`, `closeMine(id, outcome, exit_price)`
  - `getMineHistory(symbol, limit)`, `getPortfolioSnapshot()`
- `src/lib/mine/__tests__/mine-store.test.ts`

**Dipende da**: Step 1 + `src/lib/db/redis.ts` esistente
**Criterio**: CRUD funzionante con mock Redis, test verde.

---

### Step 3: Execution Layer — Alpaca wrapper
**File da creare**:
- `src/lib/mine/execution.ts` — Wrapper Alpaca per ordini
  - `placeMarketOrder(symbol, side, qty)`
  - `placeLimitOrder(symbol, side, qty, price)`
  - `cancelOrder(orderId)`
  - `getPositions()`, `getAccount()`
  - Supporta `mode: paper | live` da env config
- `src/lib/mine/__tests__/execution.test.ts`

**Dipende da**: Step 1, studia il codice Alpaca esistente nel progetto
**Criterio**: Mock test verdi per paper mode. Build verde.

---

### Step 4: Signal Detector
**File da creare**:
- `src/lib/mine/signal-detector.ts` — Genera segnali da live context + analytics
- `src/lib/mine/__tests__/signal-detector.test.ts`

**Dipende da**: Step 1, capire bene output di analytics + live observer
**Criterio**: Dati mock → segnali corretti. Test per ogni tipo di segnale.

---

### Step 5: Decision Engine
**File da creare**:
- `src/lib/mine/decision-engine.ts` — Prende segnali → produce azioni
- `src/lib/mine/risk-manager.ts` — Calcoli di rischio e position sizing
- `src/lib/mine/__tests__/decision-engine.test.ts`
- `src/lib/mine/__tests__/risk-manager.test.ts`

**Dipende da**: Step 1-4
**Criterio**: Test completi per: apertura mine, rifiuto per rischio, close per TP/SL/timeout, trailing stop.

---

### Step 6: Mine Tick — Orchestratore
**File da creare**:
- `src/lib/mine/mine-tick.ts` — Funzione principale chiamata ogni 60s
- `src/lib/mine/__tests__/mine-tick.test.ts`

**Dipende da**: Step 1-5
**Criterio**: Test end-to-end con mock completi. Il tick completa in <2s con mock.

---

### Step 7: API Routes
**File da creare**:
- `src/app/api/mine/engine/route.ts`
- `src/app/api/mine/list/route.ts`
- `src/app/api/mine/[id]/route.ts`
- `src/app/api/mine/[id]/close/route.ts`
- `src/app/api/mine/manual/route.ts`
- `src/app/api/cron/mine-tick/route.ts`
- `src/app/api/portfolio/snapshot/route.ts`
- `src/app/api/config/profile/route.ts`

**Dipende da**: Step 1-6
**Criterio**: API funzionanti, build verde. Cron mine-tick endpoint risponde a POST.

---

### Step 8: Cron Integration
**File da modificare**:
- `src/workers/cron-worker.js` — Aggiungere mine-tick al round-robin

**Criterio**: mine-tick viene chiamato ogni 60s dal cron worker. Build verde.

---

### Step 9: Feedback Loop
**File da creare**:
- `src/lib/mine/feedback.ts` — Salva outcomes, calcola metriche rolling
- `src/lib/mine/__tests__/feedback.test.ts`

**Dipende da**: Step 2, 6
**Criterio**: Outcomes salvati correttamente. Metriche calcolate. Test verde.

---

### Step 10: UI — Mine Dashboard
**File da creare/modificare**:
- `src/app/(dashboard)/mines/page.tsx` — Pagina mine
- `src/components/mine/MineCard.tsx` — Card singola mine
- `src/components/mine/MineList.tsx` — Lista mine
- `src/components/mine/MineActions.tsx` — Azioni (close, open manual)
- `src/components/mine/PortfolioGauge.tsx` — Risk gauge
- Aggiornare layout/navigation per aggiungere "Mines" al menu

**Criterio**: Pagina renderizza, mostra mine mock, build verde.

---

### Step 11: UI — Portfolio & Settings
**File da creare/modificare**:
- Aggiornare `/portfolio` con equity curve e allocazione
- Aggiornare `/impostazioni` con profilo + engine toggle
- `src/components/mine/EquityCurve.tsx`
- `src/components/mine/ProfileSelector.tsx`

**Criterio**: Tutto renderizza, build verde.

---

### Step 12: Integration Test + Polish
- Test end-to-end completo con dati reali da Redis
- Verifica che mine-tick gira sotto i 10s
- Verifica memory usage accettabile
- Fix qualsiasi issue emerso
- `pnpm test:run` tutto verde
- `pnpm build` verde

---

### Step 13: Deploy
- Merge in `main`
- Push su GitHub
- Deploy su droplet (vedi comandi in PROJECT-STATUS.md)
- Verifica log PM2 puliti
- Mine Engine parte in stato OFF — Riccardo lo accende manualmente

---

## 9. Checklist di sicurezza

- [ ] Mine Engine parte SEMPRE in stato `disabled` dopo deploy
- [ ] Mode è SEMPRE `paper` di default, `live` richiede env var esplicita
- [ ] Nessun ordine live viene piazzato senza che `NEXUS_BROKER_MODE=live` sia settato
- [ ] TP/SL sono SEMPRE impostati — nessuna mine senza stop loss
- [ ] Max concurrent mines è rispettato — hard cap
- [ ] Ogni errore Alpaca viene loggato e la mine va in stato `cancelled`, non `open`
- [ ] Il cron mine-tick ha un try/catch globale — non può crashare il PM2 process

---

## 10. Metriche di successo Phase 4

1. Mine Engine gira autonomamente in paper mode
2. Apre mine basandosi su segnali reali dall'analytics
3. TP/SL derivano dal report, non sono hardcoded
4. Chiude mine correttamente (TP, SL, trailing, timeout)
5. Portfolio snapshot aggiornato ogni tick
6. Feedback loop salva outcomes per il retrain
7. UI mostra tutto in tempo reale
8. Zero crash in 24h di funzionamento
9. Memory usage stabile (no leak)
10. Tutti i test verdi, build verde
