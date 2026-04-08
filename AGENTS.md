# AGENTS.md — Istruzioni per sessioni AI su Nexus Pro

## Lettura obbligatoria prima di qualsiasi modifica

**Leggi sempre [docs/planning/01-NEXUS-PRO-VISION.md](docs/planning/01-NEXUS-PRO-VISION.md)** prima di toccare codice. Definisce identità, modello mentale e vincoli del prodotto.

Per modifiche al cervello o alle strategie consulta anche:
- [docs/planning/02-SPEC-AI-ANALYTIC.md](docs/planning/02-SPEC-AI-ANALYTIC.md)
- [docs/planning/03-SPEC-STRATEGY-V2.md](docs/planning/03-SPEC-STRATEGY-V2.md)

## Le tre entità del sistema

1. **AI Analytic** — una per asset, persistente. Conosce il suo asset (storico, pattern, reaction zones, indicatori, strategy fit). **Non opera mai sul mercato.** Produce un `AnalyticReport`.
2. **Strategy V2** — contratto operativo dell'utente. Ne puoi avere quante vuoi. Una Strategy chiede tutto all'AI Analytic e non sa nulla di mercato per conto suo. TP/SL **non sono configurabili**: derivano dalle statistiche storiche dell'asset.
3. **Mine** — limit order condizionale piazzato in anticipo dalle Strategy sulle reaction zones, con TTL. Hard cap: max 5 mine pending per Strategy.

## Convenzioni di codice

- **Mai toccare `src/lib/engine/`** — non esiste più. Usa:
  - `src/lib/analytics/` (perception, cognition, action, learning) per il runtime live
  - `src/lib/research/` (deep-mapping, rnd, backtester, bollinger-bot) per i tool offline
  - `src/lib/core/` (indicators, patterns, data-generator) per le primitive condivise
- I path alias seguono la nuova struttura: `@/lib/analytics/...`, `@/lib/research/...`, `@/lib/core/...`.
- I test stanno in `tests/unit/` (vitest). Tieni i 100 test esistenti verdi.
- Le route API sotto `src/app/api/` verificano la sessione tramite cookie `nexus-session` letto da Redis (`nexus:session:{id}`).

## Vincoli infrastrutturali (immutabili)

- **Droplet 1GB RAM** — un solo training di AI Analytic alla volta, coda Redis sequenziale.
- **Free tier ovunque**: Upstash Redis, Supabase, Alpaca paper, Twelve Data 8 req/min, CoinGecko 30 req/min. **Zero spese aggiuntive.**
- PM2: `nexus-web` + `nexus-cron` (tick ogni 60s).
- Cap candle in memoria: 5000 per timeframe.

## Cosa NON fare

- Non riscrivere da zero moduli che già esistono in `research/` — l'AI Analytic li **orchestra** (vedi tabella in 02-SPEC sezione 10).
- Non offrire trading manuale "compra ora al market". Tutto passa per Strategy → Mine.
- Non creare nuove dipendenze pesanti. Ogni feature deve girare sull'infra esistente.
- Non bypassare il middleware di auth nelle nuove route.
- Non aggiungere copy mock dove serve dato reale: usare Redis o segnalarlo come Phase successiva.
