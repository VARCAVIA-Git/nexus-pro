# PHASE 2 — MASTER PROMPT + SPEC

> Da leggere ed eseguire da Claude Code in totale autonomia. Phase 2 implementa la logica reale dell'AI Analytic (download, analisi, pattern mining, report) e la wira al cron worker. Al termine, `/assets/[symbol]` mostra un report reale e l'addestramento di BTC/USD parte davvero.

## PREREQUISITI (già soddisfatti dalla Phase 1)

- Branch `main` contiene la nuova struttura `src/lib/{analytics,research,core}/`.
- Esistono stub per: `analytic-queue.ts`, `asset-analytic.ts`, `analytic-loop.ts`, `mine-manager.ts`, `types.ts`.
- Esistono route `/api/analytics/*` con mock data.
- Esiste UI `/assets` e `/assets/[symbol]` con polling job.
- BTC/USD è "stuck" in stato `queued` in Redis da Phase 1 — verrà ripulito da questo lavoro.

---

## PROMPT DA INCOLLARE IN CLAUDE CODE

```
=== NEXUS PRO — PHASE 2: AI ANALYTIC BACKEND REALE ===

Leggi docs/planning/06-PHASE-2-MASTER.md per intero prima di toccare codice. È la tua spec e il tuo piano di esecuzione. Lavora in totale autonomia, senza chiedere conferme. Alla fine riporta in italiano un report conciso con i dati chiave (vedi sezione REPORT FINALE).

REGOLE DI INGAGGIO:
- Branch dedicato: feature/phase-2-analytic-backend da main.
- NON toccare bot legacy, /strategy, o codice non menzionato nello spec.
- NON introdurre dipendenze npm nuove. Zero spese, zero servizi nuovi.
- RAM cap: 5000 candele/timeframe in memoria, 500 backtest max per strategy fit.
- Rate limit: Twelve Data 6 req/min (non 8), Alpaca historical bars come fallback preferito per stocks.
- Se incontri un errore bloccante dopo 3 tentativi di fix, fermati e riporta: cosa facevi, errore, tentativi.
- Mantieni i 100 test esistenti green. Aggiungi almeno 20 nuovi test unitari.
- Build + test + commit + push alla fine. Non aspettare ok.

ORDINE DI ESECUZIONE OBBLIGATORIO (tutti gli step, in ordine):

=== STEP 0: CLEANUP STATO BLOCCATO ===

Scrivi uno script di migrazione una tantum in scripts/migrations/reset-stuck-analytics.ts che:
- Legge nexus:analytic:list (SET Redis).
- Per ogni symbol, legge nexus:analytic:{symbol}.
- Se status ∈ ['queued','training'] E lastTrainedAt è null E createdAt > 2h fa → elimina le chiavi nexus:analytic:{symbol}, nexus:analytic:job:{symbol}, nexus:analytic:dataset:{symbol}, nexus:analytic:report:{symbol}, nexus:analytic:live:{symbol}, nexus:analytic:zones:{symbol}, e rimuove symbol da nexus:analytic:list e da nexus:analytic:queue.
- Stampa quanti record ha ripulito.

Lancialo con: pnpm tsx scripts/migrations/reset-stuck-analytics.ts
(se tsx non c'è, usa npx tsx; se nemmeno quello, trasformalo in uno script node puro compilato)

Questo ripulisce il BTC/USD stuck dalla Phase 1 senza richiedere intervento manuale.

=== STEP 1: ESTENDERE src/lib/db/redis.ts ===

Aggiungi helper Upstash HTTP per comandi LIST e SET (oggi ci sono solo get/set/del):

- redisLPush(key: string, value: string): Promise<number>
- redisRPop(key: string): Promise<string | null>
- redisLRange(key: string, start: number, stop: number): Promise<string[]>
- redisLLen(key: string): Promise<number>
- redisLRem(key: string, count: number, value: string): Promise<number>
- redisSAdd(key: string, member: string): Promise<number>
- redisSRem(key: string, member: string): Promise<number>
- redisSMembers(key: string): Promise<string[]>
- redisSIsMember(key: string, member: string): Promise<boolean>
- redisExists(key: string): Promise<boolean>
- redisExpire(key: string, seconds: number): Promise<number>
- redisIncr(key: string): Promise<number>

Tutti via il fetch Upstash REST API già usato nel file (endpoint /{cmd}/{args}). Scrivi test unitari mock-fetch in tests/unit/db/redis-helpers.test.ts.

=== STEP 2: RISCRIVERE analytic-queue.ts CON CODA REDIS VERA ===

File: src/lib/analytics/analytic-queue.ts

Schema chiavi:
- nexus:analytic:queue          LIST   lista di symbol in coda (ordine FIFO)
- nexus:analytic:lock           STR    lock single-job, TTL 3600s, valore = jobId
- nexus:analytic:job:{symbol}   JSON   JobStatus corrente
- nexus:analytic:list           SET    tutti i symbol con AI Analytic assegnata
- nexus:analytic:{symbol}       JSON   AssetAnalytic state

Funzioni da implementare:

export async function enqueue(symbol: string, assetClass: AssetClass): Promise<{position: number, etaSeconds: number}>
  - Verifica che symbol non sia già in queue (redisLRange + filtro).
  - Se è già in training (lock presente su quel symbol) → ritorna posizione 0.
  - redisLPush('nexus:analytic:queue', symbol).
  - Aggiorna/crea nexus:analytic:{symbol} con status='queued', createdAt=now.
  - Aggiorna nexus:analytic:job:{symbol} con phase='queued', progress=0, message='In coda'.
  - redisSAdd('nexus:analytic:list', symbol).
  - Posizione = redisLLen('nexus:analytic:queue').
  - ETA = posizione × 720s (12 min stima media per asset, tunabile).

export async function processNext(): Promise<boolean>
  - Check lock: redisGet('nexus:analytic:lock'). Se presente e non scaduto → ritorna false.
  - redisRPop('nexus:analytic:queue'). Se vuoto → ritorna false.
  - Genera jobId (uuid o crypto.randomUUID).
  - redisSet('nexus:analytic:lock', jobId, {ex: 3600}).
  - try { await runPipeline(symbol) } catch (e) { markFailed(symbol, e) } finally { redisDel('nexus:analytic:lock') }
  - Ritorna true.

export async function getJobStatus(symbol: string): Promise<JobStatus | null>
  - Ritorna parsed da nexus:analytic:job:{symbol}.

export async function updateJobProgress(symbol: string, phase: JobPhase, progress: number, message: string): Promise<void>
  - Scrive nexus:analytic:job:{symbol}. Usa questa funzione nel pipeline per aggiornare progress.

export async function markFailed(symbol: string, error: Error): Promise<void>
  - Status='failed', failureCount++, salva errore in job.

export async function resetStuck(): Promise<number>
  - Logica identica allo script di migrazione ma invocabile a runtime.

=== STEP 3: IMPLEMENTARE IL PIPELINE REALE IN asset-analytic.ts ===

File: src/lib/analytics/asset-analytic.ts

Classe AssetAnalytic con metodi reali (niente più "Not implemented"):

async train(): Promise<void>
  Pipeline 5 fasi. Ogni fase chiama updateJobProgress() per aggiornare la UI in tempo reale.
  
  Fase 1 — download (0→25%)
    - Riusa src/lib/research/deep-mapping/data-collector.ts downloadCompleteHistory(symbol).
    - Scarica 4 timeframe: 15m, 1h, 4h, 1d. Target: 2 anni (non 4 come nel modulo originale, per stare nei limiti RAM).
    - Per crypto: usa Alpaca crypto endpoint (già nel data-collector).
    - Per stock: usa Alpaca /v2/stocks/{symbol}/bars con feed IEX (free, no rate limit stretto). Fallback Twelve Data solo se Alpaca fallisce.
    - Cap 5000 candele per timeframe.
    - Salva dataset in nexus:analytic:dataset:{symbol} come JSON (compresso via JSON.stringify, nessuna lib di compressione).

  Fase 2 — analysis (25→55%)
    - Riusa src/lib/research/deep-mapping/candle-analyzer.ts analyzeAllCandles(candles).
    - Per ogni candela del timeframe 1h, calcola: indicatori (RSI, MACD, BB, ATR, ADX, Stoch, EMA9/21, SMA50/200), bbPosition, macdSignal, volumeProfile, trendShort/medium/long, regime, ground-truth 1h/4h/24h.
    - Tieni in memoria, non salvare su Redis (troppo grosso).

  Fase 3 — mining (55→75%)
    - Riusa src/lib/research/deep-mapping/pattern-miner.ts minePatterns(analyzed).
    - Random sampling se combo totali > 2000 (non grid puro).
    - Filtra: occorrenze ≥15, |avgReturn| >0.1%, WR >58% o <42%.
    - Top 50 regole per direzione.

  Fase 4 — profiling (75→90%)
    - Estrai reactionZones: clustering di livelli di prezzo dove gli swing low/high si concentrano (usa un semplice bucketing: raggruppa per livelli distanti <0.3% l'uno dall'altro, conta i touch, calcola P(bounce)/P(breakout) dal ground-truth, valida zone con touchCount≥5).
    - Estrai indicatorReactivity: per ogni indicatore principale (RSI, MACD, BB), calcola winRate e avgReturn dei segnali generati isolatamente.
    - Estrai strategyFit: per ogni timeframe e per 3 strategie (Mean Reversion, Trend Following, Breakout, prese da src/lib/analytics/cognition/strategies.ts), fai un mini-backtest su un sample di 500 periodi (NO grid search, solo parametri default). Calcola winRate, profitFactor, sharpe, maxDrawdown, rank.
    - Estrai eventReactivity: usa src/lib/research/rnd/event-analyzer.ts se esiste; altrimenti scrivi un placeholder con array vuoto (non bloccare il pipeline).
    - Determina recommendedOperationMode in base al timeframe migliore secondo strategyFit.

  Fase 5 — finalize (90→100%)
    - Costruisci AnalyticReport completo (schema in src/lib/analytics/types.ts).
    - Salva in nexus:analytic:report:{symbol}.
    - Aggiorna nexus:analytic:{symbol}: status='ready', lastTrainedAt=now, reportVersion++, nextScheduledRefresh=now+7gg.
    - Scrivi reaction zones in nexus:analytic:zones:{symbol}.
    - Imposta job a phase='ready', progress=100, message='Training completato'.
    - Invia notifica in-app + Discord (se webhook configurato) via src/lib/analytics/action/notifications.ts.

async refresh(): Promise<void>
  - Come train() ma status='refreshing' invece di 'training'. Non resetta reportVersion.

async observeLive(): Promise<void>
  - Fetch ultima candela 1h chiusa dall'asset (Alpaca o provider corrente).
  - Append a ring buffer in nexus:analytic:live:{symbol} (max 100 candele).
  - Ricalcola regime corrente, RSI, MACD signal, BB position, MTF alignment (via analytics/perception/mtf-analysis.ts).
  - Salva lastObservedAt=now.
  - Cap di tempo: 200ms. Se supera, logga warning e skip.

async getReport(): Promise<AnalyticReport | null>
  - redisGet(nexus:analytic:report:{symbol}).

async getReactionZones(): Promise<ReactionZone[]>
  - redisGet(nexus:analytic:zones:{symbol}) → parsed.

async getStatus(): Promise<AssetAnalytic>
  - redisGet(nexus:analytic:{symbol}) → parsed.

async remove(): Promise<void>
  - Verifica nessuna Strategy attiva usa questo symbol (safe in Phase 2: Strategy V2 non esiste ancora, quindi solo check placeholder).
  - Elimina tutte le chiavi nexus:analytic:*:{symbol}.
  - redisSRem('nexus:analytic:list', symbol).
  - redisLRem('nexus:analytic:queue', 0, symbol).

Export wrapper runPipeline(symbol: string) usato da processNext() che istanzia AssetAnalytic dal Redis state e chiama train() o refresh() a seconda dello status.

=== STEP 4: ANALYTIC LOOP INTEGRATO NEL CRON ===

File: src/lib/analytics/analytic-loop.ts

export async function tickObservationLoop(): Promise<void>
  - redisSMembers('nexus:analytic:list') → ottieni tutti i symbol.
  - Per ognuno in stato 'ready': istanzia AssetAnalytic e chiama observeLive().
  - Cap totale 30s. Se eccede, skip i rimanenti al prossimo tick.
  - Logga errori ma non fermare il loop.

export async function tickQueueWorker(): Promise<void>
  - Chiama processNext() dalla queue. Una sola volta per tick (mai parallelo).

=== STEP 5: NUOVA ROUTE /api/cron/analytic-tick ===

File: src/app/api/cron/analytic-tick/route.ts

POST (senza auth, perché chiamato dal cron worker locale):
  - Verifica header X-Cron-Secret contro ENV CRON_SECRET (se set, altrimenti skippa check).
  - Esegue tickObservationLoop() e tickQueueWorker() in parallelo con Promise.allSettled.
  - Ritorna {observed: N, processed: boolean, errors: string[]}.

=== STEP 6: AGGIORNARE IL CRON WORKER ===

File: src/workers/cron-worker.js

Aggiungi, accanto al call esistente a /api/cron/tick, un nuovo call a /api/cron/analytic-tick ogni 60s. Usa la stessa fetch pattern. Gestisci errori con log, non crashare.

=== STEP 7: AGGIORNARE /assets/[symbol]/page.tsx ===

File: src/app/(dashboard)/assets/[symbol]/page.tsx

Quando status='ready', invece del placeholder "Report disponibile", renderizza:
  - Header: "Report generato il {lastTrainedAt}, dataset: {X candele 15m, Y candele 1h, Z candele 4h, W candele 1d}"
  - Card "Raccomandazione": recommendedOperationMode + recommendedTimeframe + bestRegimeForLong/Short
  - Tabella "Top 10 regole BUY" (conditions, WR, occurrences, avgReturn, PF) ordinate per confidence
  - Tabella "Top 10 regole SELL"
  - Tabella "Reaction zones": priceLevel, type, strength, bounceProbability, avgBounceMagnitude
  - Tabella "Strategy fit": strategia, timeframe, WR, profit factor, Sharpe, maxDD, rank
  - Tabella "Indicator reactivity": indicatore, signalCount, WR, avgReturn
  - Bottone "Aggiorna ora" → POST /api/analytics/[symbol]/refresh
  - Bottone "Rimuovi" già esistente da Phase 1

Usa i componenti ui esistenti (Card, Table, Badge). Nessun nuovo CSS.

=== STEP 8: TEST ===

Aggiungi almeno 20 nuovi test unitari in tests/unit/:
- analytics/queue.test.ts: enqueue idempotente, processNext rispetta lock, resetStuck cancella correttamente.
- analytics/pipeline.test.ts: ogni fase con mock dataset piccolo (100 candele), verifica AnalyticReport generato ha shape corretto.
- analytics/report-schema.test.ts: zod-like validation manuale della struttura AnalyticReport.
- db/redis-helpers.test.ts: mock fetch per i nuovi helper LIST/SET.
- analytic-loop.test.ts: tickObservationLoop con lista mock di 3 symbol in stato ready.

pnpm test:run deve passare TUTTI i test (100 esistenti + nuovi).

=== STEP 9: TRIGGER AUTOMATICO SU BTC/USD ===

Dopo cleanup e implementazione, esegui una chiamata curl al tuo stesso server locale per fare un dry-run:
  curl -X POST http://localhost:3000/api/analytics/BTC%2FUSD/assign

Aspetta 30 secondi. Poi:
  curl http://localhost:3000/api/analytics/BTC%2FUSD/job

Verifica che il job sia avanzato oltre phase='queued' (può essere 'download', 'analysis', 'mining' o oltre). Se è ancora 'queued' dopo 30s significa che il cron worker locale non sta girando o non chiama processNext — diagnostica e fixa.

=== STEP 10: BUILD + COMMIT + PUSH ===

pnpm build               # deve passare
pnpm test:run            # tutti green
git add -A
git commit -m "feat: phase 2 — real AI Analytic backend (pipeline + queue + live observation)

- Redis LIST/SET helpers for atomic queue operations
- Real analytic-queue.ts with single-job lock
- Real asset-analytic.ts pipeline: download → analysis → mining → profiling → finalize
- Cron worker wired to /api/cron/analytic-tick (processNext + observe loop)
- /assets/[symbol] renders real AnalyticReport when ready
- Migration script to clean stuck Phase 1 state
- 20+ new unit tests"
git push -u origin feature/phase-2-analytic-backend

=== REPORT FINALE ===

Alla fine, riporta in italiano:
1. Migrazione cleanup: quante chiavi ripulite?
2. Build: OK? Dimensione bundle?
3. Test: quanti passati / quanti totali?
4. Commit hash.
5. Branch pushato.
6. File nuovi/modificati (lista sintetica).
7. Dry-run BTC/USD: phase raggiunta dopo 30s? Errori?
8. Deviazioni dal piano (se ci sono) e motivazioni.

VAI.
=== FINE PROMPT ===
```

---

## ISTRUZIONI UTENTE — COME ESEGUIRE

### 1. Porta il file su WSL

Scarica questo file dal workspace Cowork, poi:

```bash
cp /mnt/c/Users/varcavia-dev/Downloads/06-PHASE-2-MASTER.md ~/nexus-pro/docs/planning/
```

### 2. Sincronizza il locale su main (sanity check)

```bash
cd ~/nexus-pro && git checkout main && git pull origin main && git status
```

Deve essere clean e su `main`.

### 3. Rispondi alla sessione Claude Code esistente

Nella sessione Claude Code che sta aspettando la scelta tra 1/2/3, incolla esattamente:

```
Opzione 3. Leggi docs/planning/06-PHASE-2-MASTER.md e segui il prompt contenuto tra === NEXUS PRO — PHASE 2 e === FINE PROMPT === in totale autonomia. Crea il branch feature/phase-2-analytic-backend da main prima di iniziare.
```

### 4. Aspetta

Stima: 4-8 ore di lavoro Claude Code. Poi il training reale di BTC/USD sul tuo droplet richiederà altri 5-30 minuti quando avvii l'assign.

### 5. Quando Claude Code termina

- Mergia `feature/phase-2-analytic-backend` in `main` via PR su GitHub.
- Deploy sul server:
  ```bash
  ssh root@167.172.229.159 "su - nexus -c 'cd nexus-pro && git pull && pnpm build && pm2 restart all'"
  ```
- Apri `http://167.172.229.159:3000/assets` → seleziona BTC/USD → "Assegna AI Analytic" → guarda la progress bar avanzare per davvero.
- Riporta qui il report finale di Claude Code.

### 6. Dopo Phase 2

Se tutto verde, Phase 3 implementa Strategy V2 + mine. Se qualcosa fallisce, incolla qui l'errore.
