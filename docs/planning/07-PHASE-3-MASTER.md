# NEXUS PRO — PHASE 3: LIVING BRAIN

Obiettivo: trasformare l'AI Analytic da fotografia statica a organismo vivente che riallena sé stesso, osserva il presente in tempo reale, integra news/eventi macro, e si auto-corregge dal feedback del live trading.

Prerequisiti: Phase 2 completata e deployata (branch `main` su droplet, `pm2 logs` pulito, `/assets/BTC%2FUSD` mostra report reale).

=== NEXUS PRO — PHASE 3 ===

Sei su `~/nexus-pro`. Crea il branch `feature/phase-3-living-brain` da `main` aggiornato. Lavora in totale autonomia, non chiedere conferme, prendi tutte le decisioni coerenti con la vision (AI Analytic per-asset persistente che migliora nel tempo). A fine lavoro: commit, push, report finale.

## VINCOLI HARD
- Deve girare su DigitalOcean 1GB RAM senza OOM.
- Zero costi aggiuntivi: solo API gratuite, Upstash Redis free tier, Alpaca free.
- Sequenziale: massimo 1 job heavy alla volta (retrain o news fetch o event fetch).
- Non rompere Phase 2: i test esistenti devono passare tutti.
- Retrocompatibile: vecchi `AnalyticReport` devono continuare a renderizzare (aggiungere campi opzionali, mai rimuovere).

## STEP 0 — Fix socket hang up cron

Nei log di prod abbiamo visto "Tick error: socket hang up" ripetuti. Probabile timeout Upstash. Fix:
- In `src/lib/db/redis.ts` aggiungi retry automatico (max 3) con backoff 200/500/1000 ms sui metodi `fetch` verso Upstash quando l'errore è `UND_ERR_SOCKET` o `ECONNRESET` o `socket hang up`.
- Timeout fetch a 8000ms (`AbortController`).
- Log solo al terzo retry fallito.

## STEP 1 — Estensione schema AnalyticReport

In `src/lib/analytics/types.ts` aggiungi (tutti opzionali per retrocompat):

```ts
export interface LiveContext {
  updatedAt: number;
  price: number;
  regime: string;
  activeRules: Array<{ ruleId: string; matched: boolean; directionBias: 'long'|'short'|'neutral'; confidence: number }>;
  nearestZones: Array<{ level: number; type: 'support'|'resistance'; distancePct: number; pBounce: number }>;
  momentumScore: number; // -1..+1
  volatilityPercentile: number; // 0..100
}

export interface NewsItem {
  id: string;
  source: string;
  publishedAt: number;
  title: string;
  url: string;
  sentiment: number; // -1..+1
  relevance: number; // 0..1
  keywords: string[];
}

export interface NewsDigest {
  symbol: string;
  window: '24h';
  updatedAt: number;
  count: number;
  avgSentiment: number;
  topItems: NewsItem[]; // max 10
  sentimentDelta24h: number; // delta vs previous window
}

export interface MacroEvent {
  id: string;
  name: string;
  country: string;
  scheduledAt: number;
  importance: 'low'|'medium'|'high';
  actual: number|null;
  forecast: number|null;
  previous: number|null;
}

export interface EventImpactStat {
  eventName: string;
  direction: 'up'|'down'|'mixed';
  avgReturn24h: number;
  winRate: number;
  sampleSize: number;
}

export interface FeedbackStats {
  totalTrades: number;
  wins: number;
  losses: number;
  ruleScores: Record<string, { weight: number; trades: number; wr: number }>; // peso 0.5..2.0
  lastUpdated: number;
}

// Estensione AnalyticReport
export interface AnalyticReport {
  // ... campi esistenti
  liveContext?: LiveContext;
  newsDigest?: NewsDigest;
  eventImpacts?: EventImpactStat[];
  feedback?: FeedbackStats;
  trainingHistory?: Array<{ timestamp: number; version: number; mode: 'full'|'incremental'; candlesAdded: number; rulesChanged: number }>;
}
```

Aggiungi anche a `AssetAnalytic`:
```ts
lastIncrementalTrainAt: number | null;
lastLiveContextAt: number | null;
lastNewsFetchAt: number | null;
currentRegime: string | null;
regimeChangedAt: number | null;
```

## STEP 2 — Retraining incrementale

Crea `src/lib/analytics/incremental-trainer.ts`:

- `runIncrementalTrain(symbol)`:
  1. Load report esistente
  2. Scarica solo candele nuove dal `report.datasetCoverage.lastCandleTimestamp`
  3. Se candele nuove < 50 sul timeframe principale, skip
  4. Ri-esegue SOLO pattern-miner e reaction-zone-detector sulle finestre [ultime 1000 candele vecchie + nuove]
  5. Merge incrementale: le vecchie regole mantengono il loro score, le nuove vengono aggiunte, quelle non più matchate vengono decadute (weight × 0.9)
  6. Log in `trainingHistory` con mode='incremental'
  7. Rispetta budget max 90s, altrimenti abort e schedule full retrain

- `scheduleAutoRetrain()` (chiamata dal cron worker):
  - Per ogni analytic ready in `nexus:analytic:list`:
    - Se `lastTrainedAt` > 7 giorni → enqueue full retrain
    - Se `lastIncrementalTrainAt` > 24h → enqueue incremental
    - Se `currentRegime` è cambiato da ≥2h → enqueue incremental (retrain anticipato)
  - Max 1 enqueue per tick per non saturare la coda

## STEP 3 — Live Observer potenziato

Riscrivi `src/lib/analytics/live-observer.ts` (o estendi `analytic-loop.ts::tickObservationLoop`):

`computeLiveContext(symbol): Promise<LiveContext>`:
1. Fetch ultime 100 candele 15m + 50 candele 1h da Alpaca/CoinGecko (riusa `research/deep-mapping/data-collector.ts`)
2. Calcola indicatori correnti (RSI, MACD, BB, ADX, Stoch) su ultima candela
3. Classifica regime corrente con `regime-classifier`
4. Itera `report.topRules` → marca quali sono matchate dallo stato attuale
5. Trova le 3 zone più vicine al prezzo corrente (±3%)
6. Momentum score: media pesata di (RSI normalizzato, MACD histogram sign, price vs EMA20)
7. Volatility percentile: ATR corrente vs ATR storico 1000 candele
8. Salva in `nexus:analytic:live:{symbol}` (TTL 10 min)
9. Aggiorna `AssetAnalytic.lastLiveContextAt` e `currentRegime`
10. Se `currentRegime` cambiato, setta `regimeChangedAt = now`

Budget: 15s max. Se Alpaca fallisce usa ultimo live context valido.

Il cron worker deve chiamare questo ogni 5 min per ogni asset ready, sequenzialmente.

## STEP 4 — News layer (zero costo)

Crea `src/lib/analytics/news/` con:

- `rss-sources.ts`: lista feed RSS gratuiti
  - CoinDesk, CoinTelegraph, Decrypt per crypto
  - Reuters Business, MarketWatch, Seeking Alpha (RSS free) per stocks
  - SEC EDGAR RSS per filings

- `rss-fetcher.ts`: parse con `fast-xml-parser` (già in deps o aggiungilo), max 50 item per feed, dedup per GUID
- `sentiment-analyzer.ts`: dizionario-based lightweight (NO LLM, NO librerie pesanti). Positive/negative word list ~200 termini finance. Score = (pos-neg)/(pos+neg+1). Salva `sentiment-dict.json` in `src/lib/analytics/news/dict/`.
- `news-matcher.ts`: match keyword symbol + sinonimi (BTC/USD → ["bitcoin","btc","BTC"]). Rilevanza = # match / len(title).
- `news-aggregator.ts`: `fetchNewsForSymbol(symbol): Promise<NewsDigest>` — orchestratore, max 30s total.

Cron: `scheduleNewsFetch()` ogni 30 min, 1 symbol per tick (round-robin).

Salva in `nexus:analytic:news:{symbol}` TTL 2h. Popola `report.newsDigest` al prossimo save del report.

## STEP 5 — Macro events layer

Crea `src/lib/analytics/macro/`:

- `event-calendar.ts`: fonte gratuita. Usa **ForexFactory XML calendar** (`https://nfs.faireconomy.media/ff_calendar_thisweek.xml`) — gratuito, nessuna key. Fallback: investing.com scraping disabilitato (TOS). Fetcha settimanale, parse, salva in `nexus:macro:calendar` TTL 7d.
- `event-impact-analyzer.ts`: per ogni symbol ready, cerca nella history del report gli eventi passati dello stesso tipo (es. "FOMC Rate Decision"), misura il movimento ±24h post-evento, produce `EventImpactStat[]`.
- Scheduling: `scheduleEventAnalysis()` ogni domenica notte.

Il cron worker deve anche esporre `getUpcomingEvents(hoursAhead: 24)` → lista eventi high-impact prossimi 24h. Questo servirà in Phase 4 per sospendere mine.

## STEP 6 — Feedback loop (stub per ora, scrittura reale in Phase 4)

Crea `src/lib/analytics/feedback/feedback-tracker.ts`:

- `recordTradeOutcome(symbol, ruleId, pnlPct, win: boolean)`:
  - Incrementa `nexus:analytic:feedback:{symbol}` (HASH Redis con: totalTrades, wins, losses, rules:{ruleId}:trades, rules:{ruleId}:wins)
  - Ricalcola peso: `weight = max(0.5, min(2.0, wr_observed / wr_expected))` dove `wr_expected` = WR del mining
- `applyFeedbackWeights(report)`: ritorna copy con topRules riordinate per `score × feedbackWeight`

Hook: per ora NON chiamato da nessuno (in Phase 4 verrà chiamato quando mine chiudono). Solo struttura + test.

## STEP 7 — Cron worker orchestration

In `src/workers/cron-worker.js` aggiungi chiamate sequenziali ogni tick (60s):
1. `/api/cron/tick` (legacy, esistente)
2. `/api/cron/analytic-tick` (Phase 2, queue worker)
3. **NUOVO** `/api/cron/live-observer-tick` → per ogni asset ready, ricalcola LiveContext (1 per tick, round-robin via `nexus:analytic:live-cursor`)
4. **NUOVO** `/api/cron/news-tick` → ogni 30 min (`now % 1800 < 60`), fetcha news per 1 symbol round-robin
5. **NUOVO** `/api/cron/auto-retrain-tick` → ogni 1h (`now % 3600 < 60`), esegue `scheduleAutoRetrain()`

Ogni route: timeout proprio, logging isolato, skip se queue worker sta già girando un full retrain (check lock).

## STEP 8 — UI updates

In `src/app/(dashboard)/assets/[symbol]/page.tsx`:
- Sezione "Live Context" in alto: regime corrente, momentum, volatility percentile, active rules count, prossime zone (badge colorati)
- Sezione "News Pulse": ultimi 5 news item, sentiment gauge, delta 24h
- Sezione "Macro Events": prossimi eventi high-impact 7 giorni
- Badge "Last train: X ago · Next: in Y" sull'header
- Refresh automatico pagina via SWR ogni 30s

Crea componenti in `src/components/analytics/`:
- `LiveContextCard.tsx`
- `NewsPulseCard.tsx`
- `MacroEventsCard.tsx`

## STEP 9 — Test

Aggiungi in `tests/unit/analytics/`:
- `incremental-trainer.test.ts` — 5 test: no new candles → skip, merge logic, decay rules, budget abort
- `live-observer.test.ts` — 4 test: compute context, regime change detection, stale fallback
- `news-sentiment.test.ts` — 6 test: dict scoring, keyword match, dedup GUID
- `event-impact.test.ts` — 3 test: aggregazione, filtro importance
- `feedback-tracker.test.ts` — 4 test: weight calc, bounds, apply reorder
- `redis-retry.test.ts` — 3 test: retry on socket error, timeout, success after retry

Target: almeno 25 nuovi test. Tutti verdi + tutti i 138 esistenti verdi.

## STEP 10 — Migrazione + smoke test

- Script `scripts/migrations/phase3-init-fields.ts`: per ogni analytic ready, inizializza nuovi campi a null/0 senza toccare il report.
- Script `scripts/migrations/smoke-phase3.ts`: esegue manualmente live-observer su BTC/USD ed ETH/USD, stampa LiveContext JSON. Verifica che `activeRules` abbia almeno 1 match.

## STEP 11 — Build, commit, push

```
pnpm test
pnpm build
git add -A
git commit -m "Phase 3: Living Brain — incremental retrain, live observer, news, macro events, feedback stub"
git push origin feature/phase-3-living-brain
```

## REPORT FINALE

Produci report con: file nuovi/modificati, numero test totali, output smoke test (LiveContext reale di BTC), eventuali deviazioni dal piano e motivazioni, tempo stimato di occupazione CPU/RAM del nuovo loop.

=== FINE PROMPT ===
