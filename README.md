# Nexus Pro

Trading analytics platform in cui ogni asset è studiato e operato da una propria **AI Analytic** persistente al servizio di **Strategy** operative configurabili dall'utente.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** + **lucide-react**
- **Upstash Redis** (HTTP, free tier) per stato e cache runtime
- **Supabase / Postgres** per persistenza utenti e snapshot
- **Alpaca Markets** (paper + live) come broker
- **Twelve Data** (stocks) e **Binance/CoinGecko** (crypto) come data provider
- **PM2** (`nexus-web`, `nexus-cron`) — droplet DigitalOcean 1GB
- **Vitest** per i test unitari

## Quick start

```bash
# 1. Clona e installa
pnpm install

# 2. Variabili d'ambiente
cp .env.local.example .env.local
# (compila Upstash, Supabase, Alpaca, ecc.)

# 3. Dev server
pnpm dev

# 4. Build di produzione
pnpm build && pnpm start

# 5. Test
pnpm test:run
```

## Mappa cartelle (sintetica)

```
nexus-pro/
├── docs/                       documentazione (vision, architecture, audits, planning)
├── scripts/                    setup, deploy, monitoring, backup
├── logs/                       runtime logs (gitignored)
├── supabase/                   migrations + edge functions
├── tests/                      vitest unit + integration
├── src/
│   ├── app/                    Next.js routes (auth, dashboard, api)
│   │   ├── (dashboard)/assets/      pagina AI Analytic (Phase 1)
│   │   └── api/analytics/           API REST AI Analytic
│   ├── components/             UI condivisa
│   ├── lib/
│   │   ├── analytics/          ⭐ il cervello: AssetAnalytic + perception/cognition/action/learning
│   │   ├── research/           tool offline: deep-mapping, rnd, backtester, bollinger-bot
│   │   ├── core/               primitive condivise: indicators, patterns, data-generator
│   │   ├── broker/             alpaca, binance, paper
│   │   ├── data/providers/     market data adapters
│   │   ├── db/                 redis + supabase clients
│   │   └── utils/, config/, store/
│   ├── stores/, types/, workers/, middleware.ts
└── docker/, agents/, public/, .github/
```

## Documentazione di riferimento

- **[docs/planning/01-NEXUS-PRO-VISION.md](docs/planning/01-NEXUS-PRO-VISION.md)** — visione del prodotto (LEGGI PRIMA DI MODIFICARE CODICE)
- [docs/planning/02-SPEC-AI-ANALYTIC.md](docs/planning/02-SPEC-AI-ANALYTIC.md) — spec tecnica AssetAnalytic
- [docs/planning/03-SPEC-STRATEGY-V2.md](docs/planning/03-SPEC-STRATEGY-V2.md) — spec tecnica Strategy V2 + Mine
- [docs/planning/04-REORG-PLAN.md](docs/planning/04-REORG-PLAN.md) — piano riorganizzazione struttura
- [docs/architecture/redis-keys.md](docs/architecture/redis-keys.md) — convenzioni chiavi Redis
- [docs/deploy.md](docs/deploy.md) — istruzioni di deploy
