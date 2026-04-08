# MASTER PROMPT — DA INCOLLARE IN CLAUDE CODE

> Questo è il prompt da incollare in Claude Code sul WSL. Contiene tutto. Claude Code lavora in modo completamente autonomo, senza chiedere conferme.

---

## ISTRUZIONI PER L'UTENTE (Riccardo)

1. Scarica i 6 file da questa cartella sul tuo computer.
2. Sul WSL, vai in `~/nexus-pro` e crea la cartella `docs/planning/`:
   ```bash
   cd ~/nexus-pro
   mkdir -p docs/planning
   ```
3. Copia i 6 file dentro `docs/planning/`:
   - `00-CLAUDE-CODE-MASTER-PROMPT.md`
   - `01-NEXUS-PRO-VISION.md`
   - `02-SPEC-AI-ANALYTIC.md`
   - `03-SPEC-STRATEGY-V2.md`
   - `04-REORG-PLAN.md`
   - `05-reorganize.sh`
4. Avvia Claude Code:
   ```bash
   cd ~/nexus-pro && claude --dangerously-skip-permissions
   ```
5. Incolla **esattamente** il prompt qui sotto (tutto il blocco tra i `===`).

---

## PROMPT DA INCOLLARE

```
=== NEXUS PRO — PHASE 1: REORGANIZATION + SCAFFOLDING ===

Sei lo sviluppatore principale di Nexus Pro. Ho preparato in `docs/planning/` 5 file di specifiche che descrivono la nuova architettura del progetto. Il tuo compito è eseguire la **Phase 1** in totale autonomia, senza chiedermi conferme.

ORDINE DI LETTURA OBBLIGATORIO (leggi tutti questi file PRIMA di toccare codice):
1. docs/planning/01-NEXUS-PRO-VISION.md
2. docs/planning/02-SPEC-AI-ANALYTIC.md
3. docs/planning/03-SPEC-STRATEGY-V2.md
4. docs/planning/04-REORG-PLAN.md
5. docs/planning/05-reorganize.sh

SCOPE DELLA PHASE 1 (non fare di più, non fare di meno):

A) RIORGANIZZAZIONE STRUTTURALE
   1. Crea il branch `chore/reorg-analytics` da main.
   2. Esegui `bash docs/planning/05-reorganize.sh`.
   3. Lo script muove i file di src/lib/engine/ nella nuova struttura analytics/research/core, sposta documentazione in docs/, log in logs/, e aggiorna tutti gli import paths.
   4. Lancia `pnpm build` — deve passare senza errori. Se fallisce, fixa gli import residui finché non passa.
   5. Lancia `pnpm test` — i 100 test esistenti devono passare. Se ne fallisce qualcuno per via dei path, fixa.

B) SCAFFOLDING DELL'ENTITÀ AI ANALYTIC (solo interfacce e stub, nessuna logica vera)
   1. Crea `src/lib/analytics/types.ts` con TUTTE le interfacce TypeScript definite in 02-SPEC-AI-ANALYTIC.md sezione 2 e in 03-SPEC-STRATEGY-V2.md sezione 2:
      - AssetAnalytic, AnalyticStatus, AssetClass
      - AnalyticReport, MinedRule, ReactionZone, IndicatorReactivity, StrategyFit, EventReactivity
      - StrategyV2, StrategyStatus, AggressivenessLevel
      - Mine
   2. Crea `src/lib/analytics/asset-analytic.ts` come classe stub con i metodi documentati ma corpo `throw new Error('Not implemented in Phase 1')`. I metodi minimi:
      - constructor(symbol, assetClass)
      - async train(): Promise<void>
      - async refresh(): Promise<void>
      - async observeLive(): Promise<void>
      - async getReport(): Promise<AnalyticReport | null>
      - async getReactionZones(): Promise<ReactionZone[]>
      - async getStatus(): Promise<AssetAnalytic>
   3. Crea `src/lib/analytics/analytic-registry.ts` come modulo singleton con funzioni stub:
      - getAnalytic(symbol): Promise<AssetAnalytic | null>
      - listAnalytics(): Promise<AssetAnalytic[]>
      - spawnAnalytic(symbol, assetClass): Promise<AssetAnalytic>
      - removeAnalytic(symbol): Promise<void>
   4. Crea `src/lib/analytics/analytic-queue.ts` come stub:
      - enqueue(symbol): Promise<{position: number, etaSeconds: number}>
      - processNext(): Promise<void>
      - getJobStatus(symbol): Promise<JobStatus | null>
   5. Crea `src/lib/analytics/analytic-loop.ts` come stub:
      - export async function tickObservationLoop(): Promise<void>
   6. Crea `src/lib/analytics/action/mine-manager.ts` come stub con:
      - createMine(strategyId, candidate): Promise<Mine>
      - cancelExpiredMines(): Promise<number>
      - syncMineState(mine): Promise<Mine>

C) NUOVE API ROUTES (stub funzionanti che leggono/scrivono Redis ma usano logica fake)
   Crea queste route Next.js. Ogni route deve:
   - Verificare auth con il middleware esistente.
   - Leggere/scrivere chiavi Redis come da spec (sezione 8 di 02-SPEC).
   - Ritornare JSON valido coerente con i tipi.
   - In Phase 1 può usare mock data se la logica vera non è ancora implementata.
   
   Routes:
   - GET    src/app/api/analytics/route.ts                       → listAnalytics()
   - GET    src/app/api/analytics/[symbol]/route.ts              → getAnalytic
   - POST   src/app/api/analytics/[symbol]/assign/route.ts       → spawnAnalytic + enqueue
   - POST   src/app/api/analytics/[symbol]/refresh/route.ts      → enqueue refresh
   - DELETE src/app/api/analytics/[symbol]/route.ts              → removeAnalytic
   - GET    src/app/api/analytics/[symbol]/job/route.ts          → getJobStatus
   - GET    src/app/api/analytics/[symbol]/zones/route.ts        → mock []

D) NUOVA PAGINA /assets (Phase 1: UI funzionante con dati da API)
   1. Crea `src/app/(dashboard)/assets/page.tsx`:
      - Tab per categoria: "Crypto", "US Stocks", "ETF" (filtro client-side)
      - Lista asset disponibili (lista hardcoded in `src/lib/config/assets.ts` che già esiste)
      - Per ogni asset: badge stato AI Analytic (unassigned/queued/training/ready), bottone "Assegna AI Analytic" se unassigned, link "Apri" se ready
      - Header con count "X asset, Y AI Analytic attive"
   2. Crea `src/app/(dashboard)/assets/[symbol]/page.tsx`:
      - Header con symbol, stato AI Analytic, ultimo refresh
      - Se status='training': progress bar con polling /api/analytics/[symbol]/job ogni 3s
      - Se status='ready': mostra placeholder "Report disponibile (verrà popolato in Phase 2)"
      - Bottone "Aggiorna ora" (refresh manuale)
      - Bottone "Rimuovi AI Analytic" (con conferma)
   3. Aggiorna `src/components/sidebar.tsx` aggiungendo voce "Assets" nella sezione PRINCIPALE, sopra "Strategy". Usa un'icona Lucide adeguata (Database o Boxes).

E) AGGIORNAMENTO PAGINA /strategy (preparazione Phase 2, non rifare tutta)
   1. In cima alla pagina `/strategy` aggiungi un banner informativo: "Strategy V2 in arrivo: ogni Strategy userà le AI Analytic dei tuoi asset. Vai su /assets per assegnarle."
   2. NON toccare la logica esistente dei bot. Solo aggiungi il banner.

F) DOCUMENTAZIONE
   1. Crea `README.md` alla root del progetto con:
      - Descrizione one-liner del progetto
      - Stack
      - Quick start (env, install, dev, build)
      - Mappa delle cartelle (versione sintetica della struttura target)
      - Link a docs/planning/01-NEXUS-PRO-VISION.md
   2. Crea `AGENTS.md` alla root con istruzioni per future sessioni AI:
      - "Leggi sempre docs/planning/01-NEXUS-PRO-VISION.md prima di qualsiasi modifica"
      - "Le tre entità: AI Analytic, Strategy V2, Mine"
      - "Mai toccare src/lib/engine/ — non esiste più, usa src/lib/analytics/, src/lib/research/, src/lib/core/"
      - "Vincoli infra: 1GB RAM, free tier ovunque"

G) BUILD, TEST, COMMIT, PUSH
   1. `pnpm build` — deve passare.
   2. `pnpm test` — deve passare.
   3. Se entrambi passano:
      ```
      git add -A
      git commit -m "chore: phase 1 — reorganize codebase, scaffold AI Analytic, add /assets page

      - Move src/lib/engine/* → analytics/, research/, core/
      - Add AssetAnalytic, AnalyticReport, StrategyV2, Mine TypeScript interfaces
      - Add /api/analytics/* stub routes (Redis-backed)
      - Add /assets and /assets/[symbol] pages
      - Add sidebar entry, banner on /strategy
      - Add README.md, AGENTS.md, docs/planning/* reference files
      - Move docs to docs/, scripts to scripts/setup/, logs to logs/
      - Remove empty scaffolding folders"
      git push -u origin chore/reorg-analytics
      ```

REGOLE DI INGAGGIO:
- NON chiedere conferme. NON aspettare il mio ok. Esegui tutto in autonomia.
- NON implementare la logica vera dell'AI Analytic, del pattern mining, delle mine reali. È Phase 2-3.
- NON cancellare codice esistente che non è esplicitamente menzionato nel piano.
- Se incontri un errore di build/test che non sai risolvere in 3 tentativi, FERMATI e riportami: (a) cosa stavi facendo, (b) l'errore esatto, (c) cosa hai provato.
- Se uno script o un import path nel piano non corrisponde alla realtà del codice (file rinominato, funzione cambiata firma), adatta intelligentemente e annota l'adattamento nel commit message.
- Mantieni green i 100 test esistenti.
- Mantieni le 48 route esistenti funzionanti (eccezione: /strategy ottiene il banner in più, ma resta funzionante).

ALLA FINE, riportami in italiano:
1. Lo script reorganize.sh è andato a buon fine? Quanti file mossi?
2. Build OK?
3. Test OK? Quanti passati?
4. Commit hash?
5. Branch pushato?
6. Lista file nuovi creati in Phase 1.
7. Eventuali deviazioni dal piano e perché.

VAI.
=== FINE PROMPT ===
```

---

## DOPO CHE CLAUDE CODE HA FINITO

Quando Claude Code ti riporta che ha finito:

1. **Verifica visiva su GitHub**: vai su `github.com/VARCAVIA-Git/nexus-pro/tree/chore/reorg-analytics` e controlla che la struttura sia quella attesa.

2. **Test in locale**:
   ```bash
   cd ~/nexus-pro
   pnpm dev
   # apri http://localhost:3000/assets — deve caricare la nuova pagina
   ```

3. **Deploy su droplet (solo dopo merge in main)**:
   ```bash
   # In locale
   git checkout main
   git merge chore/reorg-analytics
   git push
   
   # Sul server
   ssh root@167.172.229.159 "su - nexus -c 'cd nexus-pro && git pull && pnpm build && pm2 restart all'"
   ```

4. **Inizia Phase 2**: torna in questa chat e dimmi "Phase 1 fatta, partiamo con Phase 2". Ti preparo il prompt per implementare la logica vera dell'AI Analytic (download storico, pattern mining, generazione AnalyticReport reale).

## ROADMAP COMPLETA (per riferimento)

| Phase | Cosa fa | Tempo stimato Claude Code |
|---|---|---|
| **Phase 1** (questo prompt) | Reorganize + scaffolding + UI stub | 1-3 ore |
| **Phase 2** | AI Analytic backend reale: download, training, report generation, queue worker | 1-2 giorni |
| **Phase 3** | Strategy V2 + Mine: tick loop, mine placement, TP/SL adattivi, lifecycle | 1-2 giorni |
| **Phase 4** | UI polish: report viewer ricco su /assets/[symbol], wizard /strategy V2 | 1 giorno |
| **Phase 5** | Migrazione bot legacy + deprecazione vecchio MultiBotConfig | 0.5 giorno |
| **Phase 6** | LLM-in-the-loop opzionale: ogni mina prima di scattare consulta Claude | 2-3 giorni |
