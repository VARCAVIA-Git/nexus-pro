# Contesto Progetto Nexus Pro

## Descrizione
Piattaforma di trading analytics con AI Analytic persistente e strategie operative configurabili.

## Stack
- Next.js 14 + React 18 + TypeScript
- Supabase/Postgres + Upstash Redis
- Alpaca (broker) + Twelve Data/Binance (dati)

## Struttura
- `src/lib/analytics/`: cervello (perception/cognition/action/learning)
- `src/lib/research/`: tool offline (deep-mapping, backtester)
- `src/app/(dashboard)/assets/`: UI AI Analytic

## Priorità
1. Implementare AssetAnalytic core
2. Configurare broker data pipeline
3. Sviluppare strategie base (Bollinger, RSI)

## Docs Critiche
- [docs/planning/02-SPEC-AI-ANALYTIC.md](docs/planning/02-SPEC-AI-ANALYTIC.md)
- [docs/planning/03-SPEC-STRATEGY-V2.md](docs/planning/03-SPEC-STRATEGY-V2.md)