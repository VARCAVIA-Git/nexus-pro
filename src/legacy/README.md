# src/legacy/

Codice archiviato da **Phase 3.5 — Menu Cleanup**.
Feature rimosse dal menu UI ma mantenute per riferimento storico e riutilizzo futuro.

> **NON importare da qui in codice attivo.**
> Se serve qualcosa di questi moduli, prima valuta se è già coperto da
> `src/lib/analytics/` (Phase 2-3) o se vale la pena promuoverlo.

## Pagine archiviate (`pages/`)

| Vecchia route                 | Sostituita da                |
| ----------------------------- | ---------------------------- |
| `/segnali`                    | `/assets/[symbol]` (LiveContext + active rules) |
| `/analysis`                   | `/assets/[symbol]` (Report + Strategy fit)      |
| `/intelligence`               | `/assets/[symbol]` (LiveContext + News Pulse)   |
| `/intelligence/learning`      | Phase 4 — feedback loop (`feedback-tracker.ts`) |
| `/rnd`                        | `/assets/[symbol]` (top rules dal mining)        |
| `/deep-mapping`               | `/assets/[symbol]` (top rules + reaction zones)  |
| `/bollinger-bot`              | `/assets/[symbol]` (indicator reactivity BB)     |

Le route restano raggiungibili come **redirect 302 → `/assets`**, con un toast
informativo che cita la sezione archiviata. Le rispettive **API routes
(`/api/{intelligence,rnd,...}`) restano attive** perché possono essere usate
internamente da script o da future implementazioni.

## Note

- `/backtester` non è stato archiviato (non esiste in questa cartella):
  resta una pagina standalone, ma rimossa dal menu sidebar (verrà
  promossa a tab di `/strategy` in Phase 4).
- Tutti i file sono stati spostati con `git mv` per preservare la history.
- Nessun import attivo punta più a `src/legacy/`. Se ne aggiungi uno, il
  build fallirà di proposito (file non più nell'alias `@/`).

## Cuore attivo (NON in legacy)

I seguenti moduli restano dove sono e sono il cuore di Nexus Pro:

- `src/lib/analytics/` — il cervello (Phase 2-3): orchestratore, queue,
  pipeline, live observer, news, macro, feedback
- `src/lib/research/deep-mapping/` — il pattern miner usato dall'AI Analytic
- `src/lib/research/rnd/` — knowledge base, indicator scanner, strategy lab
- `src/lib/research/backtester/` — backtester engine
- `src/lib/research/bollinger-bot/` — calibratore BB profiles per asset
