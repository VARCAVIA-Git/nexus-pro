# Phase 4.5: AIC Integration — Upgrade Signal Intelligence

**Prerequisito**: Phase 4 completata e deployata (Mine Engine funzionante)
**Obiettivo**: Sostituire il Signal Detector TypeScript con il cervello Python (AIC)

---

## Contesto

Phase 4 è completa con un Signal Detector TypeScript (`src/lib/mine/signal-detector.ts`) che genera segnali basandosi su live context, analytics, news e macro. Funziona.

Phase 4.5 lo **sostituisce** con un client HTTP che interroga l'Asset Intelligence Core (AIC) — un microservizio Python con 80+ indicatori, XGBoost ML, Optuna optimizer, regime detection e research agent. I segnali diventano enormemente più intelligenti senza riscrivere il Mine Engine.

## Cosa cambia

Il Mine Engine resta identico. Solo la sorgente dei segnali cambia:

```
PRIMA:  mine-tick → signal-detector.ts (TypeScript, ~10 indicatori) → decision-engine
DOPO:   mine-tick → aic-client.ts (HTTP call a Python) → decision-engine
```

## File da leggere (in ordine)

1. `PHASE-4-UPDATE-001.md` — Architettura dettagliata dell'integrazione, nuovi tipi, logica decision engine aggiornata, scorecard, mock server per testing
2. `AIC-SETUP.md` — Come deployare AIC (Docker o PM2), multi-asset, requisiti RAM
3. `aic-patches/signal_publisher_v2.py` — AIC con feedback endpoint + scorecard (sostituisce il file originale)
4. `aic-patches/database_v2_additions.py` — Nuove tabelle e metodi DB per AIC

## Piano operativo

### Step 1: AIC Client
Crea `src/lib/mine/aic-client.ts` — wrapper HTTP per comunicare con AIC. Vedi PHASE-4-UPDATE-001.md per l'interfaccia completa. Il signal-detector.ts resta come fallback se AIC è offline.

### Step 2: Aggiorna Decision Engine
Aggiungi regime gate, confluence gate, research gate, scorecard gate. Vedi PHASE-4-UPDATE-001.md sezione "Step 5 AGGIORNATO".

### Step 3: Aggiorna Mine Tick
Il mine-tick ora: (1) check AIC health, (2) se online → usa AIC signals, (3) se offline → usa signal-detector.ts come fallback.

### Step 4: Signal Scorecard
Aggiungi scorecard storage in Redis + aggiorna feedback.ts per tracciare performance reale per setup. Vedi PHASE-4-UPDATE-001.md sezione "Step 9 ESTESO".

### Step 5: Feedback bidirezionale
Quando una mine si chiude, invia outcome ad AIC via POST /feedback. AIC aggiorna la sua scorecard e usa i dati per recalibrare le confidence.

### Step 6: API + UI
Nuovi endpoint proxy per AIC, scorecard API. UI: badge regime, confluence bar, scorecard table in /mines.

### Step 7: Deploy AIC
Segui AIC-SETUP.md. Parti con solo BTC. Applica le patch da aic-patches/.

### Step 8: Test end-to-end
Mock AIC server (script in PHASE-4-UPDATE-001.md) → mine-tick usa segnali AIC → mine si apre → mine si chiude → feedback torna ad AIC → scorecard aggiornata.

## Sicurezza

- Se AIC è offline, il sistema continua a funzionare con il Signal Detector TypeScript
- Nessun ordine viene piazzato basandosi esclusivamente su AIC — il Decision Engine applica comunque tutti i risk check
- Il fallback è automatico e trasparente
