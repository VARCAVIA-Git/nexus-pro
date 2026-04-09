# Nexus Pro — Istruzioni per Claude Code

## Progetto
Nexus Pro è un sistema di trading algoritmico intelligente con analisi AI, live market observation, e execution automatica via Alpaca broker. Stack: Next.js 14 App Router, TypeScript, Tailwind, Upstash Redis, Alpaca API.

## Fase corrente: Phase 4 — Strategy V2 + Mine Engine

**LEGGI PRIMA**: `PHASE-4-DEVELOPMENT-KIT.md` — contiene l'architettura completa, tutti i tipi, il piano operativo step-by-step.

**AGGIORNA DOPO OGNI STEP**: `PHASE-4-PROGRESS.md` — tieni traccia di cosa hai completato.

## Regole operative

1. **Branch**: Lavora su `phase-4-mine-engine` (crealo da `main` se non esiste)
2. **Test dopo ogni step**: `pnpm test:run && pnpm build` — DEVE essere verde
3. **Commit dopo ogni step**: messaggi chiari, es. `feat(phase-4): step 1 — types and utils`
4. **Non inventare**: Se un'interfaccia o un comportamento non è chiaro, chiedi a Riccardo
5. **Leggi prima di scrivere**: Prima di modificare un file esistente, leggilo tutto. Capiscilo.
6. **Rispetta la memoria**: 1GB RAM + 2GB swap in produzione. No array enormi. No cache in-memory grandi.
7. **Lingua**: Codice e commenti in inglese. UI in italiano.
8. **Style**: Segui lo stile del codice esistente (Tailwind, componenti React, naming conventions)

## File chiave esistenti

- `src/lib/analytics/asset-analytic.ts` — Pipeline training 5 fasi
- `src/lib/analytics/live-observer.ts` — Live context round-robin
- `src/lib/analytics/news/news-aggregator.ts` — RSS feed + sentiment
- `src/lib/analytics/macro/event-calendar.ts` — ForexFactory parser
- `src/lib/db/redis.ts` — Upstash wrapper con retry
- `src/workers/cron-worker.js` — Cron PM2
- `src/app/(dashboard)/assets/[symbol]/page.tsx` — Pagina asset principale

## Comandi

```bash
pnpm test:run        # Vitest
pnpm build           # Next.js build
pnpm dev             # Dev server locale
```

## Vincoli

- Upstash Redis: free tier, payload piccoli, ~10k cmd/giorno
- Alpaca paper: rate limit 200 req/min
- Crypto assets: BTC, ETH, SOL (via Alpaca crypto endpoint)
- PM2 cron tick: 60s, tutto deve completare in <50s
