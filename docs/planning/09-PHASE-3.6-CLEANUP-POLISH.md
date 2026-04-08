# NEXUS PRO — PHASE 3.6: CLEANUP & POLISH

Obiettivo: rimuovere gli ultimi bug post-Phase 3 e affinare l'output dell'AI Analytic per renderlo actionable dal prezzo corrente.

Prerequisiti: Phase 3.5 + hotfix deployati su main. Branch `feature/phase-3-6-cleanup` da main aggiornato.

=== NEXUS PRO — PHASE 3.6 ===

Crea branch `feature/phase-3-6-cleanup` da main aggiornato. Esegui in autonomia, commit + push a fine.

## VINCOLI
- Non rompere test esistenti (174 test devono passare).
- Retrocompatibile: report vecchi devono continuare a renderizzare.
- Budget: ~20 min, fix chirurgici.

## BUG 1 — `observeLive: o.push is not a function`

Errore spammato nei log prod:
```
[analytic] observeLive BTC/USD: o.push is not a function
[analytic] observeLive ETH/USD: o.push is not a function
[analytic] observeLive SOL/USD: o.push is not a function
```

Indagine:
- Leggi `src/lib/analytics/live-observer.ts` (o dove risiede `observeLive`)
- Trova ogni `.push(` e verifica che il target sia inizializzato come array
- Probabile causa: un campo `AssetAnalytic` letto da Redis è stato serializzato come oggetto vuoto `{}` invece di array `[]`, oppure il fallback del hotfix ha cambiato il tipo
- Fix: normalizza con `Array.isArray(x) ? x : []` prima di ogni push
- Copri anche il path di scrittura per evitare che in futuro si salvi la shape sbagliata

## BUG 2 — `/api/cron/tick` restituisce 405

L'hotfix precedente aveva aggiunto `export async function POST` che delega a `GET`, ma il log cron mostra ancora:
```
[2026-04-08 21:37:30] tick: 405
```

Indagine:
- Conferma che il file `src/app/api/cron/tick/route.ts` esporti sia GET che POST
- Leggi `src/workers/cron-worker.js` e verifica quale URL/verbo usa per quella chiamata specifica (potrebbe essere `/api/cron/tick` con trailing slash o header diversi)
- Verifica che non ci siano redirect 301/302 di Next.js che perdono il body/metodo
- Se tutto sembra corretto ma fallisce ancora, aggiungi log verbose temporaneo nella POST handler per capire cosa arriva
- Fix definitivo + rimuovi log verbose alla fine

## BUG 3 — Reaction zones stantie

La pagina `/assets/BTC%2FUSD` mostra zone a $16k-28k mentre BTC è a $74k. Dataset copre 4 anni e include livelli storici irrilevanti per il trading attuale.

Fix in `src/app/(dashboard)/assets/[symbol]/page.tsx`:
- Nella sezione "Reaction zones", filtra mostrando solo zone con `|level - currentPrice| / currentPrice <= 0.15` (±15%)
- Se `currentPrice` non disponibile dal `liveContext.price`, usa l'ultima candela del dataset (`report.datasetCoverage.lastClose` se esiste, altrimenti fallback: mostra tutte)
- Sort per vicinanza al prezzo (più vicine in alto)
- Aggiungi header "Zone vicine al prezzo corrente (±15%)" invece di "Reaction zones"
- Se nessuna zona entro ±15%, mostra messaggio "Nessuna zona di reazione storica vicina al prezzo corrente" (indica breakout su territorio vergine)

## POLISH 1 — Filtro strategy fit con N minimo

Nella sezione "Strategy fit" di `page.tsx`:
- Nascondi le righe con `trades < 10` (sample size troppo piccolo, rumore statistico)
- Oppure evidenziale in grigio con badge "low sample" ma non le usare per il ranking
- Ordinamento: `PF × min(1, N/30)` invece di `PF` puro (penalizza sample size)

## POLISH 2 — Card "Eventi rilevanti per questo asset"

Nuovo componente `src/components/analytics/RelevantEventsCard.tsx`:
- Input: `macroEvents` globali + `report.eventImpacts` specifici dell'asset
- Output: lista di max 3 eventi high-impact prossimi 7 giorni CHE HANNO HISTORICAL IMPACT noto su questo asset (cioè presenti anche in `eventImpacts`)
- Se `eventImpacts` vuoto (comune per crypto), mostra gli eventi high-impact USD (rilevanti per tutto il mercato)
- Formato: "⚠️ FOMC Meeting Minutes — mer 08 apr 19:00 UTC · storicamente BTC ±1.2% 24h su N=5"
- Se evento è <2h di distanza, badge rosso "IMMINENTE"

Renderizzala nella pagina asset sopra alla sezione Top Rules.

## POLISH 3 — Badge live zones attive

Nel `LiveContextCard.tsx`, sostituisci la sezione "Nearest reaction zones (±3%)":
- Mostra le 3 zone più vicine con distanza esplicita in %
- Colora verde se support + bounce% >= 70, rosso se resistance + bounce% >= 70, grigio altrimenti
- Se nessuna entro ±3%, mostra le 2 più vicine fuori range con badge "+X.X%"

## STEP TEST

Aggiungi `tests/unit/analytics/zone-filter.test.ts` con 3 test:
- Filtro ±15% funzionante
- Sort per distanza
- Fallback quando currentPrice undefined

Aggiorna eventuali test che potrebbero rompersi con i nuovi filtri.

## STEP BUILD + COMMIT

```
pnpm test
pnpm build
git add -A
git commit -m "Phase 3.6: cleanup & polish — fix observeLive bug, tick 405, filtered zones, strategy N-gate, relevant events card"
git push origin feature/phase-3-6-cleanup
```

## REPORT FINALE

Lista: bug risolti con commit hash del file rilevante, polish applicati, test aggiunti, output build, eventuali deviazioni.

=== FINE PROMPT ===
