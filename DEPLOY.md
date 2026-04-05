# Nexus Pro — Deploy su Vercel

## Prerequisiti
- Account GitHub (repo privato)
- Account Vercel (free o Pro per cron jobs)
- Account Alpaca Markets (paper trading)
- Account Upstash Redis
- Account Twelve Data (free tier)

## Step 1: Push su GitHub

```bash
# Se non hai ancora un repo remoto:
gh repo create nexus-pro --private --source=. --push

# Oppure manualmente:
git remote add origin git@github.com:TUOUSER/nexus-pro.git
git push -u origin main
```

## Step 2: Importa su Vercel

1. Vai su [vercel.com/new](https://vercel.com/new)
2. Clicca "Import Git Repository"
3. Seleziona il repo `nexus-pro`
4. Framework preset: **Next.js** (auto-detected)
5. Root directory: `.` (default)
6. Build command: `pnpm build` (default)
7. Output directory: `.next` (default)

## Step 3: Environment Variables

In Vercel Dashboard → Settings → Environment Variables, aggiungi:

| Variable | Valore | Note |
|---|---|---|
| `ALPACA_API_KEY` | `PKTEAC2T...` | Paper trading API key |
| `ALPACA_API_SECRET` | `CoGMfFVF...` | Paper trading secret |
| `ALPACA_PAPER` | `true` | |
| `ALPACA_BASE_URL` | `https://paper-api.alpaca.markets` | |
| `TWELVE_DATA_API_KEY` | `88dcefb7...` | |
| `UPSTASH_REDIS_REST_URL` | `https://quality-gorilla-91902.upstash.io` | |
| `UPSTASH_REDIS_REST_TOKEN` | `gQAAAAA...` | |
| `COINGECKO_API_KEY` | *(vuoto, opzionale)* | |
| `DISCORD_WEBHOOK_URL` | *(vuoto, opzionale)* | |
| `CRON_SECRET` | *(genera un token random)* | Protegge il cron endpoint |

Per le live keys (quando pronto):
| `ALPACA_LIVE_API_KEY` | | Alpaca live account |
| `ALPACA_LIVE_SECRET_KEY` | | Alpaca live secret |

## Step 4: Deploy

Clicca **Deploy**. Vercel builderà e deployerà automaticamente.

Il sito sarà live su: `https://nexus-pro-xxx.vercel.app`

## Step 5: Vercel Cron

Il file `vercel.json` configura un cron job che chiama `/api/cron/tick` ogni minuto.

Su Vercel **Hobby** (free): cron job giornaliero.
Su Vercel **Pro**: cron ogni minuto (necessario per trading live).

Per verificare: vai su Vercel Dashboard → Logs → cerca `GET /api/cron/tick`.

## Architettura Serverless

- **Nessun setInterval**: tutto lo stato è in Upstash Redis
- **Cron tick**: ogni minuto, Vercel chiama `/api/cron/tick` che:
  1. Carica bot configs da Redis
  2. Per ogni bot running: fetch dati, genera segnali, check pre-trade, piazza ordini
  3. Salva stato aggiornato in Redis
- **API routes**: tutte serverless, stateless, leggono/scrivono solo Redis
- **Cold start**: ~2-3 secondi, poi il tick completa in ~10-30 secondi

## Comandi Utili

```bash
# Build locale
pnpm build

# Dev server
pnpm dev

# Test
pnpm test

# Test connessioni
npx tsx src/lib/test-connections.ts
```
