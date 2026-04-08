# SPEC TECNICA — AI ANALYTIC

> Spec di riferimento per l'implementazione dell'entità `AssetAnalytic`. Tutti i dettagli sono vincolanti salvo diversa indicazione esplicita dell'utente.

## 1. Identità

Un'`AssetAnalytic` è identificata univocamente da un `symbol` (es. `"BTC"`, `"AAPL"`). Una sola AI Analytic per asset. La persistenza primaria è su Redis; Postgres/Supabase può essere usato per snapshot storici dei report (opzionale, fase 2).

## 2. Interfaccia TypeScript

```ts
// src/lib/analytics/types.ts

export type AnalyticStatus =
  | 'unassigned'    // mai creata
  | 'queued'        // in coda di training
  | 'training'      // training in corso
  | 'ready'         // pronta all'uso
  | 'refreshing'    // refresh settimanale in corso, ma utilizzabile
  | 'failed';       // ultimo training fallito

export type AssetClass = 'crypto' | 'us_stock' | 'us_etf' | 'forex';

export interface AssetAnalytic {
  symbol: string;
  assetClass: AssetClass;
  status: AnalyticStatus;
  createdAt: number;
  lastTrainedAt: number | null;
  lastObservedAt: number | null;     // ultimo tick di osservazione live
  nextScheduledRefresh: number | null;
  trainingJobId: string | null;
  failureCount: number;
  reportVersion: number;             // incrementa ad ogni refresh
}

export interface AnalyticReport {
  symbol: string;
  generatedAt: number;
  datasetCoverage: {
    timeframes: Array<'15m' | '1h' | '4h' | '1d'>;
    candleCounts: Record<string, number>;
    rangeStart: number;
    rangeEnd: number;
  };
  // Statistiche globali
  globalStats: {
    avgReturnPerCandle: Record<string, number>;
    volatility: Record<string, number>;
    maxGainObserved: number;
    maxLossObserved: number;
    bestRegimeForLong: string;
    bestRegimeForShort: string;
  };
  // Pattern mining: top regole con edge significativo
  topRules: MinedRule[];
  // Reaction zones: livelli dove l'asset reagisce
  reactionZones: ReactionZone[];
  // Profilo di reattività agli indicatori
  indicatorReactivity: Record<string, IndicatorReactivity>;
  // Profilo strategie: quale strategia rende meglio per questo asset
  strategyFit: StrategyFit[];
  // Best operation mode per questo asset
  recommendedOperationMode: 'scalp' | 'intraday' | 'daily' | 'swing';
  recommendedTimeframe: '15m' | '1h' | '4h' | '1d';
  // Calendario reattività eventi (FOMC, CPI, NFP, earnings)
  eventReactivity: EventReactivity[];
}

export interface MinedRule {
  id: string;
  conditions: string[];               // es. ['RSI<30', 'BB=BELOW_LOWER', 'TREND_SHORT=DOWN']
  direction: 'long' | 'short';
  occurrences: number;
  winRate: number;
  avgReturn: number;                  // in % o in punti
  avgWin: number;
  avgLoss: number;
  expectedHoldingMinutes: number;
  confidenceScore: number;            // 0-100, combina WR, occorrenze, edge
}

export interface ReactionZone {
  priceLevel: number;
  type: 'support' | 'resistance';
  strength: number;                   // 0-100
  touchCount: number;
  bounceProbability: number;          // 0-1
  breakoutProbability: number;
  avgBounceMagnitude: number;         // in punti
  avgBreakoutMagnitude: number;
  validUntil: number;                 // timestamp di scadenza zona
}

export interface IndicatorReactivity {
  indicatorName: string;
  signalCount: number;
  winRate: number;
  avgReturn: number;
  bestParams: Record<string, number>;
}

export interface StrategyFit {
  strategyName: string;
  timeframe: string;
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  rank: number;                       // ranking per questo asset
}

export interface EventReactivity {
  eventType: 'FOMC' | 'CPI' | 'NFP' | 'EARNINGS' | 'OTHER';
  observations: number;
  avgMoveBefore: number;
  avgMoveAfter: number;
  bestPlaybook: 'long_before' | 'short_before' | 'long_after' | 'short_after' | 'avoid';
}
```

## 3. Ciclo di vita

```
unassigned → queued → training → ready
                          ↓ (errore)
                        failed → queued (retry max 2)
                          
ready → refreshing → ready  (ogni 7 giorni o on-demand)
```

Lo stato vive in `nexus:analytic:{symbol}` (JSON serializzato).

## 4. Pipeline di training

L'esecuzione è un job in background gestito da `analytic-queue.ts`. Pipeline in 5 fasi con progress tracking:

| Fase | % | Cosa fa | Output Redis |
|---|---|---|---|
| 1. download | 0-25 | Scarica storico 4 anni × 4 timeframe da Alpaca/Binance/Twelve Data | `nexus:analytic:dataset:{symbol}` |
| 2. analysis | 25-55 | Calcola indicatori, contesto, ground-truth per ogni candela (cap 5000/timeframe) | in-memory durante il job |
| 3. mining | 55-75 | Pattern mining su combo di 2-3 condizioni, filtro edge | parte di `report.topRules` |
| 4. profiling | 75-90 | Reaction zones + indicator reactivity + strategy fit + event reactivity | resto di `report` |
| 5. finalize | 90-100 | Salva report, schedula prossimo refresh, notifica | `nexus:analytic:report:{symbol}` |

Aggiornamento progress in `nexus:analytic:job:{symbol}`:
```json
{
  "jobId": "uuid",
  "phase": "mining",
  "progress": 62,
  "message": "Mining 3-condition rules: 1840/4060",
  "startedAt": 1712511234,
  "etaSeconds": 280
}
```

## 5. Scheduling e coda

**Una sola AI Analytic in training alla volta sul droplet.** La coda è gestita così:

- Lista Redis: `nexus:analytic:queue` (LPUSH per accodare, RPOP per processare).
- Lock: `nexus:analytic:lock` con TTL 60 minuti (auto-rilascio in caso di crash).
- Worker: il `nexus-cron` esistente, ad ogni tick verifica `if (!locked && queue.length > 0) processNext()`.
- Refresh settimanali schedulati per la domenica 03:00 UTC.

## 6. Osservazione live (lavoro leggero)

Distinta dal training pesante. Ogni 60s, per ogni AI Analytic in stato `ready`:

1. Fetch ultima candela chiusa per il timeframe principale (1h default).
2. Append al dataset live in Redis (`nexus:analytic:live:{symbol}` — ring buffer ultime 100 candele).
3. Aggiorna `currentContext`: regime, RSI, MACD signal, BB position, MTF alignment, news sentiment.
4. Aggiorna `recentStats`: winrate ultime 24h, momentum, volatilità realizzata.
5. Salva timestamp `lastObservedAt`.

Cap di tempo per asset: 200ms. Se il cron tick eccede 30s totali, le AI Analytic non processate aspettano il tick successivo.

## 7. API HTTP

Tutte sotto `/api/analytics/`:

| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET | `/api/analytics` | Lista tutte le AI Analytic dell'utente con stato e ultimo report sintetico |
| GET | `/api/analytics/[symbol]` | Dettaglio completo (stato + report) |
| POST | `/api/analytics/[symbol]/assign` | Crea AI Analytic e accoda training |
| POST | `/api/analytics/[symbol]/refresh` | Forza refresh manuale |
| DELETE | `/api/analytics/[symbol]` | Rimuove AI Analytic (vieta se Strategy attive la usano) |
| GET | `/api/analytics/[symbol]/job` | Stato job di training corrente (per polling UI) |
| GET | `/api/analytics/[symbol]/zones` | Reaction zones live (consumato dalle Strategy) |

## 8. Schema chiavi Redis

```
nexus:analytic:{symbol}                JSON  AssetAnalytic state
nexus:analytic:report:{symbol}         JSON  AnalyticReport completo
nexus:analytic:dataset:{symbol}        JSON  Dataset compresso (chunked)
nexus:analytic:live:{symbol}           JSON  Ring buffer 100 candele live
nexus:analytic:zones:{symbol}          JSON  Reaction zones aggiornate
nexus:analytic:job:{symbol}            JSON  Stato job training corrente
nexus:analytic:queue                   LIST  Coda di training (symbol values)
nexus:analytic:lock                    STR   Lock single-job (TTL 3600s)
nexus:analytic:list                    SET   Set di tutti i symbol con AI Analytic
```

## 9. Vincoli di risorsa

- **RAM**: cap 5000 candele per timeframe in memoria durante l'analisi (allineato al limite documentato in `deep-mapping/`).
- **CPU**: pattern mining cap a 4060 combo (3-cond), random sampling se overflow.
- **Strategy fit**: max 500 backtest per asset/timeframe. Random search invece di grid search puro.
- **Rate limit Twelve Data**: 8 req/min → throttle a 6 req/min con sleep 10s tra batch.
- **Storage Redis**: report compresso JSON ~80KB per asset. Cap 100 asset → ~8MB totali. Trivial.

## 10. Strategia di costruzione (riuso codice esistente)

L'AI Analytic **non riscrive da zero** — orchestra moduli che già esistono. Mappatura:

| Funzionalità AI Analytic | Modulo esistente da riusare |
|---|---|
| Download storico | `research/deep-mapping/data-collector.ts` + `research/rnd/history-loader.ts` |
| Analisi candele | `research/deep-mapping/candle-analyzer.ts` |
| Pattern mining | `research/deep-mapping/pattern-miner.ts` |
| Reaction zones | NUOVO (estratto da `pattern-miner` + clustering livelli prezzo) |
| Indicator scanning | `research/rnd/indicator-scanner.ts` |
| Strategy fit | `research/rnd/strategy-trainer.ts` (con cap su iperparametri) |
| Event reactivity | `research/rnd/event-analyzer.ts` |
| MTF live | `analytics/perception/mtf-analysis.ts` |
| News + Calendar | `analytics/perception/news-sentiment.ts` + `economic-calendar.ts` |
| Knowledge persistence | NUOVO `analytics/asset-analytic.ts` orchestratore |

## 11. Test minimi richiesti

- `tests/unit/analytics/asset-analytic.test.ts` — creazione, transizioni di stato, idempotenza assign.
- `tests/unit/analytics/queue.test.ts` — concorrenza coda, lock, retry su failure.
- `tests/unit/analytics/report.test.ts` — schema validation di `AnalyticReport`.
