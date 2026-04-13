# Phase 6 — AI Analytic Continua + Mine Programmate

## Obiettivo

Trasformare l'AI Analytic da "job una-tantum" a **processo continuo** che:
- Analizza ogni asset ogni 30 secondi
- Mantiene memoria a breve termine (30s) e lungo termine (storico completo)
- Cerca costantemente la strategia ottimale per massimizzare profitto
- Piazza mine (ordini programmati) con target price, TP, SL, e timer di scadenza

## Architettura Target

```
AI ANALYTIC (cervello continuo per ogni asset)
│
├── Memoria a breve termine (30s)
│   - Prezzo live, regime, indicatori, momentum
│   - Aggiornata ogni 30s dal live observer
│
├── Memoria a lungo termine (storico)
│   - Pattern mining, backtest, GA optimizer
│   - Aggiornata incrementalmente (non full retrain)
│
├── Strategy Engine (continuo)
│   - Testa combinazioni indicatori in tempo reale
│   - Confronta strategie attive con performance live
│   - Ottimizza TP/SL basandosi sui risultati recenti
│
└── Signal Generator (continuo)
    - Identifica opportunità di profitto
    - Calcola target entry, TP, SL, timeout
    - Pubblica mine programmate
         │
         ▼
    MINE (ordini programmati)
    - Entry: ordine LIMIT al target price (non market)
    - TP: Take Profit pre-impostato
    - SL: Stop Loss pre-impostato
    - Timer: annulla se non triggered entro X minuti/ore
    - Stato: waiting → triggered → open → closed
         │
         ▼
    BOT (esecutore)
    - Monitora mine waiting → piazza ordini su Alpaca
    - Monitora mine open → gestisce TP/SL/trailing
    - Chiude mine scadute (timer expired)
```

## Modifiche Backend Necessarie

### 1. Live Observer → 30s cycle (era 60s)
- `cron-worker.js`: ridurre intervallo a 30s per live observer
- `live-observer.ts`: calcolare più indicatori nel tick (inclusi i nuovi 8)
- Salvare snapshot indicatori in Redis con TTL 60s

### 2. Continuous Strategy Evaluator (NUOVO)
File: `src/lib/analytics/continuous-evaluator.ts`
- Gira ogni 30s come parte del live observer
- Legge gli ultimi 100 candele + indicatori correnti
- Evalua le top 5 strategie (dal GA + backtest) contro le condizioni attuali
- Produce: { shouldTrade: bool, direction, confidence, suggestedEntry, tp, sl, timeout }
- Salva in Redis `nexus:strategy:live:{symbol}` con TTL 60s

### 3. Mine con ordini LIMIT (modifica mine-tick)
- Invece di `placeMarketOrder()`, usa `placeLimitOrder()`
- Entry price = il target calcolato dallo strategy evaluator
- Se il prezzo non raggiunge il target entro `timeoutMinutes`, cancella l'ordine
- Stato mine: `waiting` (ordine limit piazzato) → `triggered` (filled) → `open` (monitorata)

### 4. Incremental Learning (potenziamento)
- Dopo ogni mine chiusa, aggiorna:
  - Win rate per strategia (rolling window 50 trades)
  - TP/SL ottimali (media mobile delle ultime 20 mine)
  - Confidence adjustment (se la strategia perde troppo, abbassa confidence)
- Salva feedback in Redis `nexus:learning:{symbol}`

### 5. Asset Memory (NUOVO)
File: `src/lib/analytics/asset-memory.ts`
- Per ogni asset, mantieni in Redis:
  - Ultime 1000 decisioni (signal + outcome)
  - Performance per strategia (WR, PF, avg duration)
  - Regime history (quanto tempo in ogni regime)
  - Best performing conditions (quando l'asset fa soldi)
- Aggiornato incrementalmente ad ogni tick

## Modifiche Frontend Necessarie

### 1. Mine card → mostra stato completo
- Stato: WAITING (ordine limit) / OPEN (posizione attiva) / EXPIRED
- Target entry price (diverso dal prezzo attuale)
- Timer countdown ("scade tra 2h 15m")
- TP/SL con distanza % dal prezzo

### 2. Pagina Asset → sezione "AI Strategy Live"
- Mostra la strategia attualmente attiva
- Performance live della strategia (ultimi 24h, 7d, 30d)
- Prossime mine programmate (waiting)
- Storico mine chiuse (con P&L)

## Priorità Implementazione

1. Continuous evaluator (cuore del sistema)
2. Mine con ordini limit + timer
3. Live observer 30s
4. Asset memory + learning
5. Frontend updates

## Stato Attuale (per riferimento)

- 209 file sorgente, 29k righe di codice
- 34 file test, 391 test passati
- Mine Engine operativo (3 mine attive su paper: 2 BTC SHORT +$77, 1 ETH LONG -$155)
- AIC online (3 istanze: BTC, ETH, SOL)
- GA Optimizer integrato nella pipeline
- 23 indicatori tecnici disponibili
- Dashboard live collegata ad Alpaca ($1000 live, $103k paper)
