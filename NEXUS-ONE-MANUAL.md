# NexusOne — Manuale completo di ricostruzione

## 1. Obiettivo reale

NexusOne non deve essere una piattaforma che prova continuamente a inventare strategie nuove.
Deve diventare un sistema di trading disciplinato con questa gerarchia:

1. infrastruttura stabile
2. un solo motore segnali realmente validato
3. execution controllata
4. paper trading continuo
5. live solo dopo verifica dura

Il principio base è semplice:
**prima si dimostra l'edge, poi si costruisce l'automazione attorno.**

NexusOne nasce quindi come evoluzione pragmatica di Nexus Pro:
- meno discovery automatica
- meno complessità decisionale
- più rigore quantitativo
- più controllo operativo
- più verificabilità

## 2. Decisione architetturale

### Cosa tenere dal progetto attuale

Mantieni:
- frontend Next.js
- dashboard
- status page
- bot/monitor UI
- integrazione broker e paper/live mode
- logica di cron/worker
- Redis per stato runtime
- Supabase/Postgres per persistenza storica e utenti
- PM2 e deploy su droplet
- struttura di test esistente
- logging e scripts di health/deploy

### Cosa spegnere o congelare

Disattiva come fonte decisionale principale:
- discovery automatica di migliaia di combinazioni indicatori
- ranking AI basato su storico senza vera falsificazione forte
- meta-learning che modifica pesi di trading live in autonomia
- motore multi-strategy concorrente
- auto-retrain che cambia il cervello del sistema senza revisione
- fallback a strategie scoperte offline non validate live

### Cosa introdurre

NexusOne deve avere tre layer netti:

1. **Signal Layer** — contiene solo strategie approvate, all'inizio una sola: S1
2. **Execution Layer** — decide come entrare, non se inventare una strategia. Ordini maker-first, timeout, fill handling, stop/exit
3. **Evaluation Layer** — misura in tempo reale se il comportamento live coincide con quello del research. Produce GO / NO-GO

## 3. Nuova filosofia del prodotto

Nexus Pro oggi è una piattaforma di analytics/trading AI molto larga.
NexusOne deve diventare una piattaforma di questo tipo:

**Definizione**: NexusOne è un execution and validation platform per strategie quantitative rare, falsificate e controllate.

Non promette:
- AI che trova automaticamente soldi
- auto-adattamento magico
- continui retrain profittevoli

Promette invece:
- una strategia per volta
- metriche vere
- drift detection
- execution misurabile
- spegnimento automatico se il vantaggio scompare

## 4. Architettura target

### 4.1 Vista d'insieme

```
Frontend (Next.js)
 ├─ Dashboard
 ├─ Strategy page
 ├─ Paper/live monitor
 ├─ Execution panel
 ├─ Risk panel
 └─ Audit / Reports

API + Workers
 ├─ Market Data Ingestion
 ├─ Signal Evaluation Engine
 ├─ Order Simulation / Execution
 ├─ Portfolio & Risk Engine
 ├─ Live Metrics Collector
 └─ Reporting / Alerting

Storage
 ├─ Redis -> stato runtime, cache, locks, queues
 └─ Postgres/Supabase -> trades, fills, signals, reports, snapshots

External
 ├─ OKX market data
 ├─ broker execution layer
 ├─ optional news/sentiment only as passive context
 └─ no paid premium dependencies in critical path initially
```

### 4.2 Moduli definitivi

#### A. Market Data Layer

Responsabilità:
- scaricare dati OHLCV e derivati utili
- funding
- open interest, se disponibile in modo affidabile
- price series uniformate
- timestamp consistenti
- monitoraggio freshness
- detection di gap e anomalie

Output:
- barre normalizzate
- contesto regime
- snapshot per strategie

#### B. Strategy Registry

Responsabilità:
- catalogo strategie approvate
- ogni strategia ha: id, versione, logica formale, metriche research, limiti operativi, cost assumptions, stato attivo/non attivo

All'inizio: **S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1**

#### C. Signal Engine

Responsabilità:
- calcolare solo i segnali delle strategie autorizzate
- nessun mining automatico live
- nessuna combinazione improvvisata

Per ogni tick/bar:
- riceve dati
- calcola feature richieste dalla strategia
- verifica condizione di trigger
- genera evento segnale con payload completo

#### D. Execution Engine

Responsabilità:
- tradurre il segnale in ordine
- scegliere maker-first o fallback
- loggare tutto
- gestire entry timeout
- gestire stop, target, time exit

#### E. Risk Engine

Responsabilità:
- size per trade
- max exposure
- blocco in caso di drawdown
- blocco in caso di fill quality scarsa
- blocco se il segnale devia dai parametri del research

#### F. Evaluation Engine

Responsabilità:
- confrontare research vs paper vs live
- edge drift
- fill drift
- slippage drift
- event count drift
- regime drift
- auto disable

#### G. Audit & Report Engine

Responsabilità:
- report giornaliero
- report settimanale
- report GO/NO-GO
- evidence trail completo

## 5. Strategia iniziale: S1

### 5.1 Posizionamento

S1 non è una strategia universale. È una strategia singola, rara, da trattare come esperimento controllato.

**Tesi operativa**: Quando il funding è alto e il mercato mostra struttura trending locale, i long diventano crowded e sovrappagano il carry. In certi casi questo crea un reversal short tradabile.

**Regole base** (versione iniziale da congelare):
- trigger funding z-score > soglia definita
- trigger autocorrelazione locale > soglia definita
- direzione: SHORT
- entry: maker-first
- exit: orizzonte temporale e/o target-stop predefiniti

**Regole importanti**:
- non cambiare parametri ogni giorno
- ogni modifica produce una nuova versione della strategia
- nessuna strategia entra live senza paper validation separata

### 5.2 Specifica da formalizzare in codice

```typescript
export const strategyS1 = {
  id: 'S1_FUNDING_HIGH_AC_TRENDING_SHORT_V1',
  symbol: 'BTC-USD',
  timeframe: '5m',
  direction: 'short',
  inputs: ['close', 'funding_rate'],
  features: {
    funding_zscore_window: 30,
    ac_lag_window: 48,
  },
  trigger: {
    funding_zscore_gt: 2.0,
    ac1_gt: 0.15,
  },
  execution: {
    mode: 'maker_first',
    max_entry_wait_bars: 2,
    hold_bars: 6,
  },
  risk: {
    risk_per_trade_bps: null,
    max_open_positions: 1,
    cooldown_bars: 6,
  },
}
```

## 6. Cosa eliminare dal cervello decisionale

### Da togliere subito dalla decisione live

- predictive discovery come sorgente automatica di ordini
- top rules mining come generatore live
- Kelly dinamico basato su output non ancora stabilizzati
- confluence arbitraria di molti indicatori
- fallback a ranking strategici da backtest storico
- auto-retrain che cambia criterio di entrata in produzione

### Da tenere solo per laboratorio offline

- research sandbox
- backtester esplorativo
- deep mapping
- discovery di nuove ipotesi

Questi moduli devono vivere separati dal motore operativo.

## 7. Ricostruzione dei dati

### 7.1 Principio

La ricerca e il live devono usare gli stessi concetti di dato.
Se il live usa OKX, anche il research di S1 deve basarsi su pipeline coerente con OKX.

**Data stack target**

Fase 1 minima:
- OHLCV 5m
- funding
- last/mark se disponibile
- metadata di freshness

Fase 2 opzionale:
- open interest affidabile
- order book snapshot leggero
- trade aggressor imbalance se ottenibile stabilmente

**Regole dati**:
- timezone unica UTC
- timestamp monotoni
- bar close semantics chiare
- no forward leakage
- no mix di provider non allineati senza reconciliation
- ogni dataset ha data quality report

### 7.2 Tabelle dati raccomandate

**market_bars**: id, venue, symbol, timeframe, ts_open, ts_close, open, high, low, close, volume, source, created_at

**market_funding**: id, venue, symbol, funding_ts, funding_rate, mark_price, source, created_at

**signal_events**: id, strategy_id, symbol, ts_signal, regime_snapshot_json, feature_snapshot_json, trigger_snapshot_json, expected_edge_bps, expected_hold_minutes, status

**order_attempts**: id, signal_event_id, order_type, side, intended_price, actual_price, quantity, fee_bps, spread_bps, slippage_bps, fill_status, latency_ms, created_at

**trade_results**: id, signal_event_id, entry_ts, exit_ts, entry_price, exit_price, gross_bps, net_bps, reason_exit, max_adverse_excursion_bps, max_favorable_excursion_bps, created_at

**strategy_reports**: id, strategy_id, window_start, window_end, trades, gross_bps_mean, net_bps_mean, win_rate, t_stat, fill_rate, slippage_mean_bps, status, notes

## 8. Frontend da ricostruire

### 8.1 Pagine essenziali

**1. /dashboard** — stato sistema, strategia attiva, paper/live mode, PnL netto cumulato, numero segnali, fill rate, slippage medio, drift flags

**2. /strategies** — elenco strategie approvate con: nome, versione, stato, venue, symbol, timeframe, edge research, edge paper, edge live, drawdown, note operative

**3. /strategies/[id]** — pagina tecnica completa: tesi, parametri congelati, research metrics, OOS metrics, walk-forward, bootstrap, paper results, live results, drift alerts, decisione GO/NO-GO

**4. /execution** — segnali in coda, ordini pending, ordini fillati, ordini scaduti, order type distribution, maker/taker breakdown

**5. /reports** — report giornalieri e settimanali esportabili

**6. /settings** — mode: disabled/paper/live, broker creds, venue creds, max daily loss, max open trades, emergency stop

## 9. Backend da ricostruire

### 9.1 API minime

Strategy APIs: GET /api/strategies, GET /api/strategies/:id, POST enable-paper, POST enable-live, POST disable

Data APIs: GET /api/data/health, GET /api/data/latest/:symbol, GET /api/data/funding/:symbol

Execution APIs: GET /api/execution/status, GET /api/execution/orders, GET /api/execution/trades, POST /api/execution/emergency-stop

Reports APIs: GET /api/reports/daily, GET /api/reports/weekly, GET /api/reports/strategy/:id

### 9.2 Worker model

**Worker 1 — Market Ingestion** (5s/30s/1m): pull dati, valida, salva, aggiorna Redis runtime snapshot

**Worker 2 — Signal Evaluation** (ogni chiusura bar 5m): prende ultime barre, calcola features S1, decide trigger, crea signal event

**Worker 3 — Execution** (event-driven o polling rapido): legge segnali nuovi, prova ordine maker-first, gestisce fill/expiry, apre trade, monitora exit

**Worker 4 — Evaluation & Drift** (ogni 15m/1h): aggiorna metriche reali, compara con research baseline, alza alert, può disabilitare strategia

**Worker 5 — Reporting** (giornaliera/settimanale): genera report, snapshot, esportazione

## 10. Risk management reale

### 10.1 Regole dure

- una posizione per asset
- rischio fisso basso
- daily loss limit
- consecutive losses kill-switch
- max exposure limit
- no pyramiding
- no averaging down

Esempio prudente:
- size iniziale: 0.25%–0.50% del capitale per trade come rischio effettivo
- max open positions: 1
- max daily loss: 1R o 1.5R
- max weekly loss: 3R
- se fill rate maker scende sotto soglia → stop
- se slippage supera soglia → stop
- se edge rolling 20 trade < 0 → stop

### 10.2 Kill-switch obbligatori

**Operativi**: broker non risponde, dati stale, funding mancante, orologio fuori sync, ordini rejected, ordine duplicato

**Quantitativi**: rolling 20 trade net negative, fill rate troppo basso, costi reali > costi research + buffer, numero segnali fuori range atteso, drift forte delle feature rispetto a research

## 11. Roadmap di ricostruzione

**Fase A** — Audit e congelamento (2-4 giorni)
**Fase B** — Data pipeline nuova (4-7 giorni)
**Fase C** — Strategy registry + Signal Engine (3-5 giorni)
**Fase D** — Execution engine vero (5-8 giorni)
**Fase E** — Evaluation engine (4-6 giorni)
**Fase F** — Frontend semplificato (4-6 giorni)
**Fase G** — Paper validation (14-30 giorni)
**Fase H** — Live micro capital (solo se passa) (14-30 giorni)

## 12. Criteri di profittevolezza vera

**Livello 1 — Research**: OOS positivo, walk-forward positivo, bootstrap sano, non dominato da outlier

**Livello 2 — Paper execution**: fill rate coerente, slippage coerente, net edge positivo, nessun errore operativo critico

**Livello 3 — Live micro capital**: comportamento simile al paper, costi reali sostenibili, drawdown controllato

**Livello 4 — Scalabilità prudente**: edge non collassa con size maggiore, no dipendenza da condizioni irripetibili

## 13. Definizione di done

NexusOne è veramente ricostruito solo quando:
1. la piattaforma gira stabilmente
2. discovery automatica non decide il live
3. S1 è l'unica strategia attiva iniziale
4. i dati sono affidabili e monitorati
5. gli ordini paper sono tracciati end-to-end
6. i report confrontano research vs paper
7. esistono kill-switch reali
8. esiste un GO/NO-GO basato su metriche e non su impressioni

## 14. Verità finale

NexusOne non sarà profittevole perché ha più AI.
Sarà profittevole solo se:
- usa pochi segnali veri
- evita overfitting
- misura bene i costi
- esegue bene gli ordini
- si spegne quando perde edge

La trasformazione vera non è tecnica ma filosofica:
**da piattaforma che scopre storie convincenti a macchina che accetta solo evidenza dura.**
