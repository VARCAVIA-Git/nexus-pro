# NexusOne Audit — 2026-04-15

## FASE 1 — GIT

| Check | Risultato |
|---|---|
| Branch | `main` |
| Status | PULITO — 0 file pendenti |
| Allineamento origin | Sincronizzato (0 commit non pushati) |
| Ultimo commit | `8857224` — feat: NexusOne core (15 apr 00:04) |
| Commit 48h | **43 commit** tra il 13 e il 15 aprile |
| Branch nuovi | Nessuno creato nelle ultime 48h |

### Timeline commit 13-15 aprile (cronologico)

```
13 apr 13:53  docs: complete project blueprint v5.0
13 apr 14:07  feat: Phase 5 — Genetic Optimizer, 10 new indicators, Kelly Criterion
13 apr 14:13  perf: reduce GA params for droplet
13 apr 14:17  feat: integrate Genetic Optimizer into training pipeline
13 apr 15:25  fix: fire-and-forget training to prevent HTTP timeout
13 apr 17:04  feat: live broker everywhere, encryption, complete Operazioni + Portfolio
13 apr 17:36  feat: AI Analytics redesign — search assets, freshness bar, live data
13 apr 17:41  feat: redesign Bot page — Trading Center with live equity
13 apr 17:51  docs: update CLAUDE.md stats
13 apr 18:06  feat: rewrite Mine Engine signal detector — much more aggressive
13 apr 18:10  fix: mine engine uses ALL signal sources
13 apr 18:14  debug: mine-tick logging
13 apr 18:17  fix: mine-tick loadReport wrong Redis key
13 apr 18:20  fix: cap position size at 20% equity
13 apr 18:21  test: update calcPositionSize test
13 apr 18:25  fix: cap position at 5% equity
13 apr 18:28  fix: position cap 1% equity
13 apr 18:34  fix: check buying power before placing mine order
13 apr 18:38  fix: hard cap mine orders at $500 notional
13 apr 18:46  fix: prevent duplicate mines
13 apr 19:01  fix: validate AIC TP/SL direction
13 apr 19:14  docs: Phase 6 plan — Continuous AI + Programmed Mines
13 apr 21:01  feat: Phase 6 — Continuous AI + Predictive Discovery + Limit Orders   ← ANTI-NEXUSONE
13 apr 21:24  fix: use Alpaca for live crypto prices
13 apr 21:28  fix: lower predictive discovery thresholds
13 apr 22:40  fix: redesign backtester for realistic profit
13 apr 23:03  feat: V2.0 Trading Intelligence System
13 apr 23:23  refactor: redesign analysis page for V2 distribution-based insights
13 apr 23:29  fix: distribution forecaster ratio conversion
13 apr 23:33  improve: analisi page shows mine count
14 apr 00:01  redesign: analisi hub page
14 apr 00:08  cleanup: remove obsolete sections
14 apr 00:17  feat: strategy cards with annual profit projection
14 apr 23:15  docs: add NEXUS-PRO-V2.md
15 apr 00:04  feat: NexusOne core — strategy registry, signal engine, execution, risk, evaluation   ← NEXUSONE
```

### Interpretazione

Due fasi di sviluppo contrastanti nello stesso arco temporale:

1. **13 apr (giorno)**: Phase 5-6 — Genetic Optimizer, Predictive Discovery, Mine Engine aggressivo. **Questa e la logica discovery-driven che NexusOne doveva sostituire.**

2. **15 apr (notte)**: NexusOne core implementato. Strategy registry, S1, signal engine, execution, risk, evaluation. **Questa e la logica corretta.**

Il commit NexusOne e stato aggiunto **sopra** il codice Phase 5-6 senza rimuoverlo.

---

## FASE 2 — Pattern anti-NexusOne ancora presenti

### CRITICO: Codice vecchio NON rimosso

| Pattern | File | Stato |
|---|---|---|
| Predictive Discovery | `src/lib/analytics/predictive-discovery.ts` | **PRESENTE** (intero modulo) |
| Genetic Optimizer | `src/lib/analytics/optimizer/` (4 file) | **PRESENTE** |
| Auto-retrain | `src/lib/analytics/incremental-trainer.ts` | **PRESENTE** |
| Live Observer (discovery) | `src/lib/analytics/live-observer.ts` | **PRESENTE** |
| Continuous Evaluator (ranking) | `src/lib/analytics/continuous-evaluator.ts` | **PRESENTE** |
| Mine Engine (decision engine) | `src/lib/mine/decision-engine.ts` | **PRESENTE** |
| Signal Detector (multi-source) | `src/lib/mine/signal-detector.ts` | **PRESENTE** |
| Mine Tick (vecchio loop) | `src/lib/mine/mine-tick.ts` | **PRESENTE** |
| V2 Trade Brain | `src/lib/analytics/v2/trade-brain.ts` | **PRESENTE** |
| Dynamic Kelly | `src/lib/analytics/v2/dynamic-kelly.ts` | **PRESENTE** |
| Distribution Forecaster | `src/lib/analytics/v2/distribution-forecaster.ts` | **PRESENTE** |

### Dimensione del problema

| Modulo | File | Stato |
|---|---|---|
| `src/lib/nexusone/` | **8 file** | NUOVO — NexusOne corretto |
| `src/lib/analytics/` | **59 file** | VECCHIO — discovery-driven, NON rimosso |
| `src/lib/mine/` | **11 file** | VECCHIO — mine engine, NON rimosso |
| `src/lib/research/` | **29 file** | VECCHIO — research, NON rimosso |

**99 file del vecchio sistema coesistono con 8 file del nuovo.** NexusOne e stato aggiunto, non ha sostituito nulla.

### Cron Worker

Il cron worker e stato **parzialmente aggiornato**:
- `nexusone/tick` → ATTIVATO (30s fast tick) 
- `analytic-tick` → DISABILITATO (commentato)
- `auto-retrain-tick` → DISABILITATO (commentato)
- `mine-tick` → **Non chiamato direttamente** ma il route e ancora presente
- `live-observer-tick` → **ANCORA ATTIVO** (60s slow tick)
- `news-tick` → ANCORA ATTIVO (60s slow tick)
- `tick` (vecchio bot tick) → **ANCORA ATTIVO** (60s slow tick)

---

## FASE 3 — S1 / NexusOne

### Cosa e stato implementato CORRETTAMENTE

| Componente | File | Qualita |
|---|---|---|
| Strategy Registry | `strategy-registry.ts` | **BUONO** — one active at a time, versioned, frozen |
| S1 Manifest | `strategies/s1.ts` | **BUONO** — parametri frozen, funding z-score + autocorrelation |
| Signal Engine | `signal-engine.ts` | **BUONO** — valuta solo strategia attiva, no discovery |
| Execution Engine | `execution-engine.ts` | **BUONO** — maker-first, fill monitoring, lifecycle |
| Risk Engine | `risk-engine.ts` | **BUONO** — kill switch, daily loss, consecutive losses |
| Evaluation Engine | `evaluation-engine.ts` | **BUONO** — drift detection, GO/NO-GO |
| Worker Tick | `worker-tick.ts` | **BUONO** — orchestratore pulito, sostituisce mine-tick |
| Types | `types.ts` | **BUONO** — completo, coerente col manuale |

### Cosa MANCA

1. **Data adapter**: `worker-tick.ts` usa un fetcher Alpaca provvisorio per i bars. Non c'e un adapter OKX per funding rates reali.
2. **Research module**: nessun modulo dedicato per validazione OOS, walk-forward, bootstrap. La sezione `research_metrics` in S1 e vuota (tutti zeri).
3. **UI NexusOne**: nessuna pagina dedicata NexusOne. L'UI mostra ancora il vecchio sistema (analytics, mines, bot page discovery-driven).

---

## FASE 4 — Mappa file

### File NexusOne (coerenti)
```
src/lib/nexusone/types.ts                    NUOVO — coerente
src/lib/nexusone/strategy-registry.ts        NUOVO — coerente
src/lib/nexusone/strategies/s1.ts            NUOVO — coerente
src/lib/nexusone/signal-engine.ts            NUOVO — coerente
src/lib/nexusone/execution-engine.ts         NUOVO — coerente
src/lib/nexusone/risk-engine.ts              NUOVO — coerente
src/lib/nexusone/evaluation-engine.ts        NUOVO — coerente
src/lib/nexusone/worker-tick.ts              NUOVO — coerente
src/app/api/nexusone/tick/route.ts           NUOVO — coerente
src/app/api/nexusone/status/route.ts         NUOVO — coerente
src/app/api/nexusone/emergency-stop/route.ts NUOVO — coerente
docs/nexusone/ARCHITECTURE.md               NUOVO — coerente
docs/nexusone/RISK_RULES.md                 NUOVO — coerente
docs/nexusone/STRATEGY_REGISTRY.md          NUOVO — coerente
NEXUS-ONE-MANUAL.md                         NUOVO — coerente
```

### File incoerenti con NexusOne (vecchio sistema mai rimosso)
```
src/lib/analytics/                    59 file — intero sistema discovery
src/lib/mine/                         11 file — mine engine vecchio
src/lib/research/                     29 file — backtester/research vecchio
src/app/api/cron/mine-tick/           route ancora presente
src/app/api/cron/analytic-tick/       route presente (disabilitata nel cron)
src/app/api/cron/auto-retrain-tick/   route presente (disabilitata nel cron)
src/app/api/cron/live-observer-tick/  route ATTIVA nel cron
src/app/api/cron/tick/                route ATTIVA nel cron (vecchio bot)
```

### File ambigui (Phase 5-6 aggiunti il 13 aprile)
```
src/lib/analytics/optimizer/          Genetic optimizer — non NexusOne
src/lib/analytics/v2/                 Trade brain, dynamic kelly — non NexusOne
src/lib/analytics/predictive-discovery.ts   Predictive discovery — anti-NexusOne
PHASE-6-PLAN.md                       Piano Phase 6 — contiene Continuous AI + Discovery
```

---

## FASE 5 — VERDETTO

### 1. Cosa e stato rotto

**Nulla e stato rotto in senso stretto.** NexusOne e stato aggiunto come modulo nuovo (`src/lib/nexusone/`) senza toccare il codice esistente. Il problema e che il vecchio sistema **non e stato disattivato ne rimosso**.

Il risultato e un **sistema ibrido** dove:
- NexusOne esiste e funziona (in teoria) via `/api/nexusone/tick`
- Ma il cron worker chiama **anche** il vecchio `tick`, `live-observer-tick`, `news-tick`
- Le route del vecchio mine engine sono ancora presenti e raggiungibili
- L'UI mostra il vecchio sistema, non NexusOne
- 99 file del vecchio sistema coesistono con 8 del nuovo

### 2. Cosa e ancora sano

- **NexusOne core e pulito e ben implementato**: 8 file, architettura corretta, S1 definita, signal engine che valuta solo strategie registrate, risk engine con kill switch
- **Git e pulito**: main sincronizzato con origin, 0 file pendenti
- **S1 e correttamente frozen**: parametri non dinamici, versioned

### 3. Cosa va ripristinato / corretto

Non serve ripristinare. Serve **completare la transizione**:

1. **Disattivare nel cron worker** i tick del vecchio sistema (`tick`, `live-observer-tick`)
2. **Rimuovere o archiviare** i 99 file del vecchio sistema (analytics/, mine/, research/)
3. **Aggiornare l'UI** per mostrare NexusOne (stato S1, segnali, trades, drift report)
4. **Completare S1**: aggiungere data adapter per funding rates reali
5. **Popolare research_metrics**: validazione OOS prima di andare in paper trading

### 4. Percorso minimo per tornare al design corretto

```
STEP 1: Disabilitare vecchi tick nel cron-worker
         → commentare/rimuovere callTick per tick, live-observer-tick
         → lasciare solo nexusone/tick + news-tick

STEP 2: Creare pagina UI NexusOne
         → stato sistema (mode, strategia attiva, kill switch)
         → ultimi segnali e trades
         → drift report

STEP 3: Data adapter
         → proxy funding rates (OKX o Binance) per S1

STEP 4: Research validation
         → popolare research_metrics con backtest OOS reale

STEP 5 (non urgente): Pulizia vecchio codice
         → spostare analytics/, mine/, research/ in _archive/ o rimuovere
         → rimuovere route API inutilizzate
```

---

*Report generato in modalita audit — nessun file modificato.*
