# Nexus Pro V2.0 — Sistema di Trading AI Autonomo

## Cos'è Nexus Pro

Nexus Pro è un centro di comando per trading algoritmico che usa l'intelligenza artificiale per analizzare asset finanziari (crypto e azioni), scoprire opportunità di profitto, e piazzare operazioni automaticamente.

L'utente aggiunge un asset → l'AI studia 4 anni di storico → scopre quali combinazioni di indicatori predicono movimenti profittevoli → il sistema opera 24/7 in automatico piazzando mine (operazioni) con TP/SL calibrati dalla distribuzione statistica.

---

## Architettura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NEXUS PRO V2.0                              │
│                                                                     │
│  FRONTEND (Next.js 14)                                              │
│  ├── /analisi          → Centro Analisi AI (hub asset)              │
│  ├── /analisi/[symbol] → Scheda tecnica asset + proiezioni          │
│  ├── /dashboard        → Portfolio, posizioni, ordini               │
│  ├── /bot              → Gestione bot + Mine Engine                 │
│  ├── /mines            → Operazioni attive + scorecard              │
│  ├── /impostazioni     → Broker, profilo rischio, engine            │
│  └── /status           → Salute servizi                             │
│                                                                     │
│  BACKEND (API Routes + Workers)                                     │
│  ├── Cron Worker (dual speed)                                       │
│  │   ├── Fast tick (30s): Live Observer + Mine Engine               │
│  │   └── Slow tick (60s): Bot, Analytic, News, Auto-retrain        │
│  ├── AI Engine                                                      │
│  │   ├── Training Pipeline (5 fasi)                                 │
│  │   ├── V2 Trade Brain (regime + distribuzione + Kelly)            │
│  │   ├── Continuous Evaluator (30s)                                 │
│  │   └── Asset Memory + Meta-Learning                               │
│  └── Execution Layer                                                │
│      ├── Mine Engine (market + limit orders)                        │
│      ├── Risk Manager (Kelly + drawdown control)                    │
│      └── Alpaca Broker (paper + live)                               │
│                                                                     │
│  EXTERNAL                                                           │
│  ├── AIC Python (BTC/ETH/SOL su Kraken) — 3 istanze                │
│  ├── Alpaca Markets — broker paper + live                           │
│  ├── CoinMarketCap, Finnhub, FMP — dati fondamentali               │
│  └── Upstash Redis — stato, cache, config                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Come funziona — Flusso completo

### Fase 1: L'utente aggiunge un asset

Dalla pagina `/analisi`, l'utente cerca "BTC" e clicca "Analizza". Il sistema lo mette in coda.

### Fase 2: Training AI (5 fasi, ~5 minuti)

```
Download (0→25%)     Scarica 4 anni di storico da Alpaca (15m, 1h, 4h, 1d)
Analysis (25→55%)    Analizza ogni candela 1h: indicatori + ground truth futuro
Mining (55→75%)      Testa 4.495 combinazioni di condizioni → top 50 regole
Profiling (75→90%)   Backtest realistico + V2 Distribution + Predictive Discovery
Finalize (90→100%)   Salva report in Redis, schedula prossimo refresh (7 giorni)
```

### Fase 3: V2 Intelligence (durante il training)

**Regime Detector** — Per ogni candela dello storico, calcola la probabilità di 4 regimi:
- TRENDING (mercato in tendenza)
- RANGING (mercato laterale)
- VOLATILE (alta volatilità)
- ACCUMULATING (bassa volatilità, accumulo)

**Distribution Forecaster** — Per ogni combinazione di 2 indicatori in ogni regime, calcola la distribuzione dei rendimenti futuri (quantili p10, p30, p50, p70, p90). Non predice "il prezzo salirà" ma "nel 70% dei casi il prezzo si muoverà tra -0.8% e +2.3% nelle prossime 4 ore".

**Trade Setup Discovery** — Cerca setup dove la distribuzione è asimmetrica: il guadagno potenziale supera la perdita di almeno 1.3x. Da qui derivano TP e SL ottimali.

### Fase 4: Operatività continua (ogni 30 secondi)

```
Ogni 30 secondi il sistema:
1. Rileva il regime attuale (es. TRENDING 72%)
2. Controlla se le condizioni attuali matchano un setup V2
3. Se sì: calcola il position sizing (Dynamic Kelly)
4. Se Kelly è positivo: piazza una mine (ordine market o limit)
5. Monitora mine aperte: chiude a TP, SL, o trailing stop
6. Dopo ogni chiusura: aggiorna meta-learning
```

### Fase 5: L'utente monitora

Dalla pagina `/mines` vede le operazioni attive con P&L in tempo reale. Dalla pagina `/analisi/BTC%2FUSD` vede le opportunità scoperte dall'AI e le proiezioni di profitto.

---

## Moduli del Sistema

### 1. Training Pipeline (`src/lib/analytics/asset-analytic.ts`)

La pipeline a 5 fasi che trasforma dati storici grezzi in intelligence operativa.

| Fase | Output |
|------|--------|
| Download | 4 anni di candele OHLCV su 4 timeframe (15m, 1h, 4h, 1d) |
| Analysis | CandleContext per ogni candela: 15+ indicatori + rendimenti futuri reali |
| Mining | 50 regole predittive (combinazioni di 2-3 condizioni) validate con Wilson score |
| Profiling | Backtest realistico ($1k, 3% per trade, TP/SL da ATR) + V2 Distribution + Predictive Discovery |
| Finalize | Report completo salvato in Redis, auto-refresh ogni 7 giorni |

### 2. V2 Trade Brain (`src/lib/analytics/v2/`)

Il cervello del sistema. 4 moduli:

**Regime Detector** (`regime-detector.ts`)
- Input: ultime 60+ candele
- Output: probabilità per ogni regime (es. trending 72%, ranging 15%, volatile 8%, accumulating 5%)
- Usa fuzzy logic con softmax: ADX, EMA alignment, BB width, ATR ratio
- Opera solo se il regime dominante > 65% di confidenza

**Distribution Forecaster** (`distribution-forecaster.ts`)
- Input: 4 anni di CandleContext
- Output: per ogni regime + coppia di condizioni, distribuzione quantile dei rendimenti futuri a 1h/4h/24h
- Calcola: skewness (asimmetria), R:R ottimale, TP/SL dalla distribuzione
- Solo setup con R:R > 1.3 vengono considerati

**Dynamic Kelly** (`dynamic-kelly.ts`)
- Input: setup + regime + stato portfolio
- Output: % di capitale da rischiare
- Formula: Kelly frazionario (25%) con aggiustamenti per drawdown e volatilità
- Se drawdown > 10% → riduce del 50%. Se > 20% → riduce del 75%. Se > 30% → stop totale
- Cap massimo: 8% del capitale per singola operazione

**Trade Brain** (`trade-brain.ts`)
- Combina regime + distribution + Kelly + meta-learning
- Decide: tradare o non tradare, direzione, size, TP/SL, tipo ordine
- Meta-learning: tiene traccia di quali setup hanno funzionato negli ultimi 90 giorni
- Solo se TUTTO converge → piazza la mine

### 3. Continuous Evaluator (`src/lib/analytics/continuous-evaluator.ts`)

Gira ogni 30 secondi nel mine-tick. Ordine di priorità:
1. **V2 Brain** — cerca setup asimmetrici nel regime corrente
2. **Predictive Profile** — combinazioni predittive per tier di rischio
3. **Backtest Rankings** — fallback alle strategie dal backtest classico

Decide anche il tipo di ordine:
- Momentum forte (>0.35) → ordine market (non perdere il movimento)
- Alta volatilità + basso momentum → ordine limit (prezzo migliore)
- Vicino a una zona S/R → ordine limit (attendi il rimbalzo)

### 4. Mine Engine (`src/lib/mine/`)

Il motore di esecuzione delle operazioni.

**Lifecycle di una mine:**
```
WAITING (limit order piazzato, in attesa di fill)
  → PENDING (ordine in elaborazione)
    → OPEN (posizione attiva, monitorata ogni 30s)
      → CLOSED (chiusa a TP, SL, trailing, o timeout)
  → EXPIRED (limit order non fillato entro il timeout)
```

**Componenti:**
- `mine-tick.ts` — orchestratore principale (ogni 30s)
- `signal-detector.ts` — rileva segnali da 4 fonti (AIC, regole, trend, zone)
- `decision-engine.ts` — risk gates + AIC gates + ordine market/limit
- `risk-manager.ts` — position sizing, Kelly, limiti portfolio
- `execution.ts` — piazza ordini su Alpaca (market + limit)
- `feedback.ts` — salva outcome per meta-learning

**Regole di sicurezza:**
- Max 3% del capitale per operazione
- No posizioni opposte sullo stesso asset (no LONG+SHORT)
- TP 1.8×ATR, SL 1×ATR (R:R = 1.8)
- Trailing stop a 1.2% dal picco
- Timeout: 48-96 ore (per profilo rischio)

### 5. Asset Memory (`src/lib/analytics/asset-memory.ts`)

Memoria a lungo termine per ogni asset:
- Performance per strategia (WR, PF, PnL medio, durata media)
- Storico regimi (quanto tempo in ogni regime)
- Ultime 200 decisioni (segnale + esito)
- Migliori condizioni (quali combinazioni hanno generato profitto)
- Aggiornata ad ogni mine chiusa e ad ogni tick

### 6. AIC — Asset Intelligence Core (`/home/nexus/aic/` sulla droplet)

3 istanze Python indipendenti (BTC, ETH, SOL) su Kraken che forniscono:
- Regime detection in tempo reale
- Confluence multi-timeframe (15m, 1h, 4h, 1d)
- Segnali di trading con entry/TP/SL
- Research: funding rate, fear & greed, open interest, news sentiment

### 7. Predictive Discovery (`src/lib/analytics/predictive-discovery.ts`)

Analizza lo storico per scoprire combinazioni predittive, classificate in 3 livelli:
- **Prudente** — WR > 55%, PF > 1.0, movimenti > 1%
- **Moderato** — WR > 48%, PF > 0.8, movimenti > 0.5%
- **Aggressivo** — WR > 40%, PF > 0.5, movimenti > 0.2%

Per ogni combinazione simula $1.000 (3% per trade, commissioni 0.2%).

---

## Frontend — Pagine

### `/analisi` — Centro Analisi AI

Hub principale. Mostra:
- Riepilogo: asset attivi, operazioni aperte, profitto totale
- Card per ogni asset: prezzo, regime (In salita/In discesa/Laterale), mine attive, P&L
- Barra di ricerca per aggiungere nuovi asset

### `/analisi/[symbol]` — Scheda Tecnica Asset

Pagina completa con tutte le informazioni su un asset:
- **AI pronta** — anni analizzati, opportunità trovate, stile consigliato
- **Live Monitor** — prezzo, regime, momentum, segnali attivi (aggiornato ogni 10s)
- **Market Intelligence** — confluence multi-TF, Fear & Greed, news, dati CoinMarketCap
- **Opportunità V2.0** — setup asimmetrici raggruppati per regime con distribuzione quantile
- **Raccomandazioni** — quando comprare, quando vendere, TF migliore
- **Zone S/R** — supporti e resistenze con probabilità di rimbalzo
- **Strategie con proiezione** — card con previsione annuale ("+10.3%/anno, ~0.9%/mese") e pulsante "Attiva questa strategia"

### `/dashboard` — Portfolio

Panoramica del conto: equity, posizioni aperte, ordini recenti, badge LIVE/PAPER.

### `/bot` — Bot Manager

Gestione bot attivi. Creazione bot da classifica AI con parametri calibrati (TP/SL dal backtest). Toggle Mine Engine.

### `/mines` — Operazioni

Mine attive (OPEN/WAITING/PENDING) con P&L in tempo reale. Storico chiusure. Scorecard per setup AIC.

### `/impostazioni` — Impostazioni

Connessione broker Alpaca (paper + live). Profilo rischio (Prudente/Moderato/Aggressivo). Mine Engine toggle.

---

## Infrastruttura

### Droplet DigitalOcean

| Processo | Funzione | RAM |
|----------|----------|-----|
| nexus-web | Next.js production server | ~150MB |
| nexus-cron | Worker dual speed (30s/60s) | ~60MB |
| aic-btc | AIC Python BTC (Kraken) | ~370MB |
| aic-eth | AIC Python ETH (Kraken) | ~370MB |
| aic-sol | AIC Python SOL (Kraken) | ~370MB |

IP: `167.172.229.159`, porta 3000, user: nexus, PM2.

### Cron Worker (dual speed)

```
Fast tick (ogni 30 secondi):
  /api/cron/live-observer-tick    → aggiorna indicatori per tutti gli asset
  /api/cron/mine-tick             → evaluator continuo + mine engine + limit orders

Slow tick (ogni 60 secondi):
  /api/cron/tick                  → bot legacy
  /api/cron/analytic-tick         → processa coda training
  /api/cron/news-tick             → aggiorna news (1 asset per tick)
  /api/cron/auto-retrain-tick     → ogni 1h, schedula retrain automatici
```

### Redis (Upstash)

Chiavi principali:
```
nexus:analytic:{symbol}              → stato asset (status, regime, training)
nexus:analytic:report:{symbol}       → report completo (backtest, V2, regole)
nexus:analytic:live:{symbol}         → contesto live (prezzo, indicatori, 10min TTL)
nexus:strategy:live:{symbol}         → valutazione continua (60s TTL)
nexus:memory:{symbol}                → asset memory (30d TTL)
nexus:mine:{id}                      → singola mine (7d TTL)
nexus:mines:status:{status}          → indice mine per stato
nexus:portfolio:snapshot             → snapshot portfolio
nexus:mine-engine:enabled            → toggle engine
nexus:config:profile                 → profilo rischio attivo
```

### Stack tecnologico

| Componente | Tecnologia |
|-----------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Backend | Next.js API Routes, TypeScript |
| AI Engine | TypeScript (training, backtest, V2 brain) |
| AIC | Python 3.12 (Kraken data, segnali) |
| Database | Upstash Redis (REST) |
| Broker | Alpaca Markets (paper + live) |
| Data | CoinGecko, CoinMarketCap, Finnhub, FMP |
| Hosting | DigitalOcean Droplet (3.8GB RAM) |
| Process Manager | PM2 |

---

## Backtest — Come funziona

Il backtester simula operazioni realistiche sullo storico:

| Parametro | Valore |
|-----------|--------|
| Capitale iniziale | $1.000 |
| Size per trade | $30 (3% del capitale) |
| Commissioni | 0.1% per lato (0.2% round trip) |
| Slippage | 0.03% per lato |
| Max posizioni | 3 contemporanee |
| TP | 1.8 × ATR |
| SL | 1.0 × ATR (R:R = 1.8) |
| Trailing stop | 1.2% dal picco |
| Timeout entry | 8 barre |
| Timeframe testati | 15m, 1h, 4h (no 5m) |

Testa 6 strategie coded + top 10 regole AI + 3 genomi GA = ~50 combinazioni.

---

## Profili di Rischio

| | Prudente | Moderato | Aggressivo |
|---|---------|----------|------------|
| Rischio portfolio max | 10% | 15% | 25% |
| Rischio per trade | 2% | 3% | 5% |
| Mine contemporanee | 5 | 8 | 12 |
| Mine per asset | 2 | 3 | 4 |
| Confidenza minima | 45% | 35% | 25% |
| Timeout mine | 48h | 72h | 96h |

---

## Come generare profitto — Il piano

### Step 1: Analisi (fatto)
L'AI analizza 4 anni di storico e scopre setup asimmetrici per regime.

### Step 2: Paper Trading (da fare)
Il Mine Engine gira su paper Alpaca ($103k) per 2-4 settimane. L'AI piazza mine ogni 30s seguendo i setup V2. Si accumulano dati reali.

### Step 3: Validazione
Dopo 30+ mine chiuse, confrontare:
- WR reale vs WR backtest
- PF reale vs PF backtest
- Se gap < 30% → il sistema è affidabile

### Step 4: Meta-Learning
Il sistema impara dai risultati reali: quali setup funzionano in live, quali no. Pesa di conseguenza. Dopo 90 giorni ha un dataset significativo.

### Step 5: Live (solo dopo validazione)
Con risultati paper positivi, si attiva il trading live con capitale reale. Si inizia piccolo (1-2% del capitale) e si aumenta man mano che il track record cresce.

---

## Test

37 file di test, 441 test unitari (Vitest). Copertura:

| Area | File | Test |
|------|------|------|
| Analytics | 7 | ~80 |
| V2 (regime, distribution, evaluator) | 3 | ~50 |
| Mine Engine | 8 | ~140 |
| Backtester | 2 | ~20 |
| Indicators | 2 | ~30 |
| Broker | 1 | 6 |
| Database | 3 | ~19 |
| Other | 11 | ~96 |

Comando: `pnpm test:run` (deve passare prima di ogni deploy).

---

## Comandi

```bash
# Locale
pnpm dev              # Dev server
pnpm test:run         # 441 test
pnpm build            # Build production

# Deploy
git push origin main
ssh root@167.172.229.159 "su - nexus -c 'cd nexus-pro && git pull origin main && pnpm build && pm2 restart nexus-web nexus-cron'"

# Droplet
ssh root@167.172.229.159 "su - nexus -c 'pm2 status'"
ssh root@167.172.229.159 "su - nexus -c 'pm2 logs nexus-web --lines 30 --nostream'"

# Scripts
node scripts/health-check.mjs     # Verifica salute sistema
node scripts/retrain.mjs BTC/USD  # Forza retrain asset
node scripts/cleanup-mines.mjs    # Pulisci mine orfane
```

---

## Vincoli

- Upstash Redis: free tier, ~10k cmd/giorno
- Alpaca: rate limit 200 req/min
- CoinGecko: rate limit ~10 req/min (fallback, Alpaca è primario)
- CoinMarketCap: 333 req/giorno
- Droplet: 3.8GB RAM, 2GB swap
- Cron fast tick: 30s, tutto deve completare in <25s
