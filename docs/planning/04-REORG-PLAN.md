# PIANO DI RIORGANIZZAZIONE DEL REPO

> Riorganizza la struttura attuale di `~/nexus-pro` allineandola alla visione AI Analytic + Strategy. Tutti i movimenti sono fatti con `git mv` per preservare la history.

## Struttura target

```
nexus-pro/
├── README.md                       ← rigenerato con mappa progetto
├── package.json, pnpm-lock.yaml, tsconfig.json
├── next.config.mjs, next-env.d.ts
├── tailwind.config.ts, postcss.config.mjs
├── vitest.config.ts, .prettierrc
├── .env.local, .env.local.example, .gitignore
├── ecosystem.config.js
│
├── docs/
│   ├── README.md                   ← indice dei documenti
│   ├── vision.md                   ← copia di NEXUS-PRO-VISION.md
│   ├── context.md                  ← era CONTEXT.md
│   ├── deploy.md                   ← era DEPLOY.md
│   ├── architecture/
│   │   ├── redis-keys.md           ← era REDIS-KEYS.md
│   │   ├── ai-analytic.md          ← copia di SPEC-AI-ANALYTIC.md
│   │   └── strategy-v2.md          ← copia di SPEC-STRATEGY-V2.md
│   ├── audits/
│   │   ├── audit-report.md         ← era AUDIT-REPORT.md
│   │   └── deep-audit.md           ← era DEEP-AUDIT.md
│   └── api/, runbooks/             ← già esistono
│
├── scripts/
│   ├── README.md                   ← spiega ogni script
│   ├── setup/
│   │   ├── nexus-master-build.sh
│   │   ├── nexus-pro-init.sh
│   │   └── nexus-fix.sh
│   ├── dev-start.sh, start-bot.sh, start-production.sh, stop.sh, setup-tunnel.sh
│   ├── backup/, deploy/, monitoring/   ← invariati
│   └── reorganize.sh               ← lo script di questa riorganizzazione (per audit)
│
├── logs/                           ← gitignored
│   ├── .gitkeep
│   ├── nexus-bot.log
│   └── setup.log
│
├── src/
│   ├── app/                        ← invariato (route già organizzate per route group)
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   │   ├── ... (esistenti)
│   │   │   └── assets/             ← NUOVO (stub Phase 1)
│   │   │       ├── page.tsx
│   │   │       └── [symbol]/page.tsx
│   │   └── api/
│   │       ├── ... (esistenti)
│   │       └── analytics/          ← NUOVO (route stub Phase 1)
│   │           ├── route.ts
│   │           └── [symbol]/
│   │               ├── route.ts
│   │               ├── assign/route.ts
│   │               ├── refresh/route.ts
│   │               ├── job/route.ts
│   │               └── zones/route.ts
│   │
│   ├── components/                 ← invariato
│   │
│   ├── lib/
│   │   ├── analytics/              ← ⭐ NUOVO — il cervello unificato
│   │   │   ├── README.md
│   │   │   ├── types.ts            ← AssetAnalytic, AnalyticReport, Mine, StrategyV2
│   │   │   ├── asset-analytic.ts   ← orchestratore di un'AI Analytic (stub Phase 1)
│   │   │   ├── analytic-registry.ts← getAnalytic, listAnalytics, spawn (stub)
│   │   │   ├── analytic-loop.ts    ← osservazione live nel cron tick (stub)
│   │   │   ├── analytic-queue.ts   ← coda Redis sequenziale (stub)
│   │   │   ├── perception/
│   │   │   │   ├── mtf-analysis.ts        ← era engine/mtf-analysis.ts
│   │   │   │   ├── mtf-data.ts            ← era engine/mtf-data.ts
│   │   │   │   ├── news-sentiment.ts      ← era engine/news-sentiment.ts
│   │   │   │   ├── economic-calendar.ts   ← era engine/economic-calendar.ts
│   │   │   │   └── regime-classifier.ts   ← era engine/regime-classifier.ts
│   │   │   ├── cognition/
│   │   │   │   ├── master-signal.ts       ← era engine/master-signal.ts
│   │   │   │   ├── strategies.ts          ← era engine/strategies.ts
│   │   │   │   ├── signals.ts             ← era engine/signals.ts
│   │   │   │   ├── smart-timing.ts        ← era engine/smart-timing.ts
│   │   │   │   └── trap-detector.ts       ← era engine/trap-detector.ts
│   │   │   ├── action/
│   │   │   │   ├── risk.ts                ← era engine/risk.ts
│   │   │   │   ├── position-manager.ts    ← era engine/position-manager.ts
│   │   │   │   ├── live-runner.ts         ← era engine/live-runner.ts
│   │   │   │   ├── notifications.ts       ← era engine/notifications.ts
│   │   │   │   └── mine-manager.ts        ← NUOVO (stub Phase 1)
│   │   │   └── learning/                  ← era engine/learning/ intero
│   │   │
│   │   ├── research/               ← R&D Lab + offline tools
│   │   │   ├── README.md
│   │   │   ├── deep-mapping/       ← era engine/deep-mapping/
│   │   │   ├── rnd/                ← era engine/rnd/
│   │   │   ├── backtester/         ← era engine/backtester/
│   │   │   ├── bollinger-bot/      ← era engine/bollinger-bot/
│   │   │   └── backtest.ts         ← era engine/backtest.ts
│   │   │
│   │   ├── core/                   ← primitive condivise
│   │   │   ├── indicators.ts       ← era engine/indicators.ts
│   │   │   ├── patterns.ts         ← era engine/patterns.ts
│   │   │   └── data-generator.ts   ← era engine/data-generator.ts
│   │   │
│   │   ├── broker/                 ← invariato
│   │   ├── data/                   ← invariato
│   │   ├── db/                     ← invariato
│   │   ├── config/                 ← invariato
│   │   ├── utils/                  ← invariato
│   │   ├── store/                  ← invariato
│   │   ├── mock-data.ts            ← invariato
│   │   └── test-connections.ts     ← invariato
│   │
│   ├── stores/, types/, workers/, middleware.ts   ← invariati
│
├── supabase/, tests/, docker/, agents/, public/, .github/   ← invariati
```

## Cartelle eliminate (vuote nella vecchia struttura)

```
src/lib/backtest/        (vuota)
src/lib/indicators/      (vuota)
src/lib/market-data/     (vuota)
src/lib/patterns/        (vuota)
src/lib/strategies/      (vuota)
src/lib/validators/      (vuota)
src/lib/engine/          (rimossa dopo aver spostato tutto il contenuto)
```

## Tabella mapping completa import paths

Lo script `reorganize.sh` esegue queste sostituzioni con `sed -i` su tutti i file `.ts` e `.tsx` in `src/`. **L'ordine è importante**: pattern più lunghi prima dei più corti.

| OLD | NEW |
|---|---|
| `@/lib/engine/learning` | `@/lib/analytics/learning` |
| `@/lib/engine/deep-mapping` | `@/lib/research/deep-mapping` |
| `@/lib/engine/backtester` | `@/lib/research/backtester` |
| `@/lib/engine/bollinger-bot` | `@/lib/research/bollinger-bot` |
| `@/lib/engine/rnd` | `@/lib/research/rnd` |
| `@/lib/engine/master-signal` | `@/lib/analytics/cognition/master-signal` |
| `@/lib/engine/mtf-analysis` | `@/lib/analytics/perception/mtf-analysis` |
| `@/lib/engine/mtf-data` | `@/lib/analytics/perception/mtf-data` |
| `@/lib/engine/news-sentiment` | `@/lib/analytics/perception/news-sentiment` |
| `@/lib/engine/economic-calendar` | `@/lib/analytics/perception/economic-calendar` |
| `@/lib/engine/regime-classifier` | `@/lib/analytics/perception/regime-classifier` |
| `@/lib/engine/strategies` | `@/lib/analytics/cognition/strategies` |
| `@/lib/engine/smart-timing` | `@/lib/analytics/cognition/smart-timing` |
| `@/lib/engine/trap-detector` | `@/lib/analytics/cognition/trap-detector` |
| `@/lib/engine/signals` | `@/lib/analytics/cognition/signals` |
| `@/lib/engine/position-manager` | `@/lib/analytics/action/position-manager` |
| `@/lib/engine/live-runner` | `@/lib/analytics/action/live-runner` |
| `@/lib/engine/notifications` | `@/lib/analytics/action/notifications` |
| `@/lib/engine/risk` | `@/lib/analytics/action/risk` |
| `@/lib/engine/backtest` | `@/lib/research/backtest` |
| `@/lib/engine/indicators` | `@/lib/core/indicators` |
| `@/lib/engine/patterns` | `@/lib/core/patterns` |
| `@/lib/engine/data-generator` | `@/lib/core/data-generator` |

**Critico**: `engine/backtester` deve essere sostituito **prima** di `engine/backtest`, altrimenti `backtester` diventerebbe `research/backtest` per via del prefisso. Lo script gestisce l'ordine correttamente.

## Verifiche post-reorganizzazione

1. `pnpm build` deve completare senza errori TypeScript.
2. `pnpm test` deve passare tutti i 100 test esistenti.
3. `git status` deve mostrare i file come `renamed:` (non `deleted:` + `added:`), confermando che la history è preservata.
4. `find src/lib -type d -empty` deve essere vuoto (nessuna cartella vuota residua).
5. `grep -r "@/lib/engine" src/` deve restituire **zero risultati**.

## Reversibilità

- Branch dedicato: `chore/reorg-analytics`. Il merge in `main` avviene solo dopo build verde + test verdi.
- Rollback: `git reset --hard HEAD~1` sul branch annulla tutto in un colpo.
- Lo script salva un log in `logs/reorganize-{timestamp}.log` con tutti i mv eseguiti.
