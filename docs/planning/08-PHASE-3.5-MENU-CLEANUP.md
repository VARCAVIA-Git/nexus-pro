# NEXUS PRO — PHASE 3.5: MENU CLEANUP

Obiettivo: ridurre il menu da 15 voci a 8, archiviare feature legacy, eliminare confusione UX. Zero regressioni sul brain/pipeline Phase 2-3.

Prerequisiti: Phase 3 merged su main. Partire da main aggiornato.

=== NEXUS PRO — PHASE 3.5 ===

Crea branch `feature/phase-3-5-menu-cleanup` da `main` aggiornato. Esegui in autonomia, commit + push a fine.

## VINCOLI HARD
- Non rompere test esistenti (Phase 2 + Phase 3 suite must pass).
- Non cancellare codice: **archiviare** in `src/legacy/`.
- Pagine rimosse = redirect 302 a `/assets` con toast "Questa sezione è stata archiviata. L'AI Analytic la sostituisce."
- API routes delle feature rimosse: mantenere attive (possono essere usate internamente), solo rimuovere dal menu UI.

## NUOVA STRUTTURA MENU

```
Principale
├─ Dashboard      → /dashboard
├─ Assets         → /assets
├─ Strategy       → /strategy
├─ Operazioni     → /operazioni
└─ Portfolio      → /portfolio

Sistema
├─ Impostazioni   → /impostazioni
├─ Connessioni    → /connections
└─ Status         → /status
```

## VOCI DA RIMUOVERE DAL MENU

1. **Segnali** (`/segnali`)
2. **Analisi** (`/analysis`)
3. **Intelligence** (`/intelligence`, `/intelligence/learning`)
4. **R&D Lab** (`/rnd`)
5. **Deep Mapping** (`/deep-mapping`)
6. **Bollinger Bot** (`/bollinger-bot`)
7. **Backtester** (`/backtester`) → integra come tab dentro `/strategy`

## STEP 1 — Individua file sidebar

Trova il componente sidebar/menu (cerca `'Principale'` o `'Strumenti'` o `'Sistema'` nel codebase). Probabilmente in `src/components/layout/` o `src/app/(dashboard)/layout.tsx`.

## STEP 2 — Riscrivi sidebar

Rimuovi sezione "Strumenti" completa. Nella "Principale" tieni solo: Dashboard, Assets, Strategy, Operazioni, Portfolio. Ordine esatto come sopra.

Icone suggerite (lucide-react, già in deps):
- Dashboard: `LayoutDashboard`
- Assets: `Brain`
- Strategy: `Target`
- Operazioni: `Activity`
- Portfolio: `Wallet`
- Impostazioni: `Settings`
- Connessioni: `Plug`
- Status: `HeartPulse`

## STEP 3 — Redirect pagine archiviate

Per ciascuna delle 7 pagine da rimuovere, sostituisci il contenuto `page.tsx` con:

```tsx
import { redirect } from 'next/navigation';

export default function ArchivedPage() {
  redirect('/assets');
}
```

Ma PRIMA, sposta il file originale in `src/legacy/pages/[nome]/page.tsx` (crea struttura se non esiste). Usa `git mv` per preservare history.

## STEP 4 — Backtester come tab di Strategy

- Crea `src/app/(dashboard)/strategy/page.tsx` con 2 tab: "Strategie" (contenuto attuale) + "Backtester" (contenuto di `/backtester`)
- OPPURE più semplice: lascia `/backtester` come pagina standalone ma rimuovila SOLO dal menu sidebar. La pagina resta raggiungibile, il link sparisce.

Scegli la via semplice (solo rimuovi dal menu) se Strategy è già strutturato diversamente. Decidi tu.

## STEP 5 — Archivia codice legacy

Sposta in `src/legacy/`:
- `src/components/bollinger-bot/` (se esiste)
- `src/components/deep-mapping/` (se esiste)
- `src/components/intelligence/` (se esiste)
- `src/components/rnd/` (se esiste)

**NON** spostare:
- `src/lib/analytics/` (è Phase 2-3, cuore attivo)
- `src/lib/research/deep-mapping/` (è il miner usato dall'AI Analytic, rimane dov'è)
- API routes (restano attive)

Aggiungi `src/legacy/README.md` che spiega:
> Codice archiviato da Phase 3.5 menu cleanup. Feature rimosse dal menu UI ma mantenute per riferimento storico e riutilizzo futuro. NON importare da qui in codice attivo.

## STEP 6 — Aggiorna test

Se qualche test punta a `/segnali` o `/analysis` o simili, aggiorna per puntare a `/assets` (redirect) o rimuovilo se testava solo la pagina legacy.

## STEP 7 — Smoke test manuale

Dopo il build:
1. `pnpm build` deve passare senza errori
2. Verifica che tutte le 8 route del nuovo menu siano nel bundle list
3. Verifica che `/segnali`, `/analysis`, `/intelligence` facciano redirect a `/assets` (basta che il codice sia corretto, non serve avviare il server)

## STEP 8 — Commit & push

```
git add -A
git commit -m "Phase 3.5: Menu cleanup — da 15 a 8 voci, archivia feature legacy"
git push origin feature/phase-3-5-menu-cleanup
```

## REPORT FINALE

Elenca: file sidebar modificato, file spostati in legacy (list), pagine redirect create, output `pnpm build`, test results, eventuali deviazioni.

=== FINE PROMPT ===
