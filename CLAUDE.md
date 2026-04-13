# Nexus Pro — Istruzioni per Claude Code

## Progetto

Nexus Pro è un **centro di comando autonomo per trading algoritmico** con AI multi-asset, backtesting avanzato con simulazione realistica, e execution automatica via Alpaca broker.

**Stack**: Next.js 14, TypeScript, Tailwind, Upstash Redis, Alpaca API, CoinMarketCap, Finnhub, FMP.

**Architettura completa**: vedi `NEXUS-PRO-BLUEPRINT.md`

## Stato attuale (aggiornato 2026-04-13)

### Phase 5: IN CORSO

Completate Phase 4 (Mine Engine), 4.5 (AIC Integration), 4.6 (Full Backtester + AI-calibrated bots). In corso: integrazione migliorie da NeuralTrade (Genetic Optimizer, indicatori avanzati, Kelly Criterion).

### Infrastruttura produzione

**Droplet**: `167.172.229.159` (DigitalOcean, SSH come `root`, user app: `nexus`)

| Processo PM2 | Cosa fa | Porta | RAM |
|---|---|---|---|
| `nexus-web` | Next.js production server | 3000 | ~150MB |
| `nexus-cron` | Cron worker (tick 60s) | — | ~60MB |
| `aic-btc` | AIC per BTC/USDT (Kraken) | 8080 | ~370MB |
| `aic-eth` | AIC per ETH/USDT (Kraken) | 8081 | ~370MB |
| `aic-sol` | AIC per SOL/USDT (Kraken) | 8082 | ~370MB |

### Cosa funziona oggi

- **Dashboard live**: portfolio da Alpaca, posizioni, ordini, badge LIVE/PAPER
- **AI Analytics**: training 5 fasi su 4 anni di storico, 5 TF (5m-1d), 64+ combo testate
- **Full Backtester**: simulazione realistica con commissioni, slippage, trailing stop
- **Mine Rule Executor**: regole AI convertite in strategie eseguibili
- **Bot Manager**: creazione da classifica AI (multi-strategy), config calibrata
- **Live Observer**: regime + context per tutti gli asset ogni 60s in parallelo
- **Asset Intelligence**: CMC metadata, Finnhub fundamentals, news aggregated
- **Ticker auto**: top 15 movers (crypto + stocks via Alpaca Data API)
- **Settings**: Collega/Disconnetti broker con password, API keys cifrate

### Connessioni broker

- **Paper**: Alpaca Paper ($103k simulati) — usato dal cron/bot
- **Live**: Alpaca Live ($1k reali) — configurabile da UI
- Le keys live sono salvate in Redis (senza cifatura per ora, fix ENCRYPTION_KEY pendente)

### AIC — Asset Intelligence Core

I file AIC vivono sulla droplet in `/home/nexus/aic/` (NON nel repo git).

**API endpoints** (per istanza):
- `GET /status` — price, regime, confluence, active_tfs
- `GET /signals` — segnali attivi
- `GET /confluence` — bias multi-TF, key levels
- `GET /report/json` — snapshot completo

**Config env**:
```
AIC_BTC_URL=http://localhost:8080
AIC_ETH_URL=http://localhost:8081
AIC_SOL_URL=http://localhost:8082
```

## Architettura — Riassunto Rapido

### Cron Worker (ogni 60s)

```
1. /api/cron/tick              → Legacy bot tick
2. /api/cron/analytic-tick     → Queue worker (training)
3. /api/cron/live-observer-tick → TUTTI gli asset in parallelo
4. /api/cron/news-tick         → 1 asset round-robin
5. /api/cron/mine-tick         → Mine Engine
6. /api/cron/auto-retrain-tick → Ogni 1h
```

### Signal Chain (per bot)

```
AIC signal (crypto, online?) → Mined Rule match? → TS strategies fallback
  ↓ Live Context enrichment (regime gate, zone boost)
  ↓ TP/SL: calibrated (backtest) > Bollinger > ATR default
  ↓ Order placement: Alpaca market order + bracket TP/SL
```

### Redis Keys

```
nexus:analytic:{symbol}         → state (status, lastTrained)
nexus:analytic:report:{symbol}  → AnalyticReport
nexus:analytic:backtest:{symbol}→ BacktestReport (slim, no equity curves)
nexus:analytic:live:{symbol}    → LiveContext (10min TTL)
nexus:bot:config                → MultiBotConfig[]
nexus:broker:keys               → API keys (from UI)
nexus:mine-engine:enabled       → "true"/"false"
nexus:global:ticker_assets      → ticker selection (deprecated, now auto)
```

## Regole operative

1. **Test**: `pnpm test:run && pnpm build` — DEVE essere verde prima di ogni commit
2. **Non inventare**: Se non è chiaro, chiedi a Riccardo
3. **Leggi prima di scrivere**: Prima di modificare un file, leggilo tutto
4. **RAM**: 3.8GB totale. No array enormi, no equity curves in Redis
5. **Lingua**: Codice in inglese, UI in italiano
6. **Style**: Segui lo stile esistente (Tailwind, React, naming)
7. **AIC**: File Python SOLO sulla droplet. Per modificarli usa SSH
8. **Exchange**: Kraken (Binance e Bybit geo-bloccati dalla droplet US)
9. **Deploy**: `git push` → SSH droplet → `git pull && pnpm build && pm2 restart`

## Comandi

```bash
# Locale
pnpm test:run        # 374 tests
pnpm build           # Next.js production build
pnpm dev             # Dev server

# Droplet
ssh root@167.172.229.159 "su - nexus -c 'pm2 status'"
ssh root@167.172.229.159 "su - nexus -c 'pm2 logs nexus-web --lines 30 --nostream'"
ssh root@167.172.229.159 "free -h"
```

## Vincoli

- Upstash Redis: free tier, ~10k cmd/giorno, payload max ~1MB
- Alpaca: rate limit 200 req/min
- CoinGecko: rate limit ~10 req/min (free tier)
- CoinMarketCap: 333 req/giorno (free tier)
- Droplet: 3.8GB RAM, 2GB swap
- PM2 cron tick: 60s, tutto deve completare in <50s

## Prossimi step (Phase 5)

1. Genetic Optimizer per scoperta automatica strategie
2. 10 nuovi indicatori (Ichimoku, PSAR, CCI, Keltner...)
3. Kelly Criterion position sizing
4. Walk-forward validation k-fold
5. Calendario macro funzionante
6. Multi-lingua (i18n)
