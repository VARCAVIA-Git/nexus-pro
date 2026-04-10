# Nexus Pro — Istruzioni per Claude Code

## Progetto

Nexus Pro è un sistema di trading algoritmico intelligente con analisi AI, live market observation, e execution automatica via Alpaca broker. Stack: Next.js 14 App Router, TypeScript, Tailwind, Upstash Redis, Alpaca API.

Il sistema è composto da due parti che lavorano insieme:
- **Nexus Pro** (TypeScript/Next.js) — UI, analytics pipeline, Mine Engine, cron worker
- **AIC** (Python) — Asset Intelligence Core: data fetching, indicator engine, backtester, signal publisher

## Stato attuale (aggiornato 2026-04-09)

### Phase 4 + 4.5: COMPLETATE e DEPLOYATE

Tutto il lavoro di Phase 4 (Mine Engine) e Phase 4.5 (AIC Integration) è stato completato, merged in `main`, e deployato sulla droplet di produzione. I reference doc sono:
- `PHASE-4-DEVELOPMENT-KIT.md` — architettura originale
- `PHASE-4-PROGRESS.md` — tracker completamento (12/12 step)
- `PHASE-4.5-AIC-UPGRADE.md` — upgrade per integrazione AIC

### Infrastruttura produzione

**Droplet**: `167.172.229.159` (DigitalOcean, SSH come `root`, user app: `nexus`)

| Processo PM2 | Cosa fa | Porta | RAM |
|---|---|---|---|
| `nexus-web` | Next.js production server | 3000 | ~150MB |
| `nexus-cron` | Cron worker (tick 60s) | — | ~60MB |
| `aic-btc` | AIC per BTC/USDT (Kraken) | 8080 | ~370MB |
| `aic-eth` | AIC per ETH/USDT (Kraken) | 8081 | ~370MB |
| `aic-sol` | AIC per SOL/USDT (Kraken) | 8082 | ~370MB |

**RAM totale**: ~1.3GB usata / 3.8GB disponibile. Swap 2GB quasi intatto.

### AIC — Dettagli operativi

I file AIC vivono sulla droplet in `/home/nexus/aic/` (NON nel repo git Nexus Pro). Le patch locali sono in `~/nexus-pro/aic-patches/`.

**Config**: Ogni asset ha il suo `config-{btc,eth,sol}.yaml`. `main.py` legge `CONFIG_FILE` da env var (default: `config.yaml` = BTC). Exchange: **Kraken** (Binance e Bybit sono geo-bloccati dalla droplet US).

**API endpoints AIC** (per ogni istanza):
- `GET /status` — price, regime, confluence, active_tfs
- `GET /signals` — segnali attivi generati dal backtester
- `GET /confluence` — bias multi-TF, key levels (S/R, pivots, FVG, order blocks)
- `GET /report/json` — snapshot completo JSON

**Timeframes attivi**: 15m, 1h, 4h, 1d (Kraken non supporta 1w/1M)

**Nexus Pro .env.local** include:
```
AIC_BTC_URL=http://localhost:8080
AIC_ETH_URL=http://localhost:8081
AIC_SOL_URL=http://localhost:8082
AIC_SECRET_TOKEN=
```

## Architettura Nexus Pro (TypeScript)

### Analytics pipeline (`src/lib/analytics/`)

- `asset-analytic.ts` — Pipeline training 5 fasi: candle context, reaction zones, indicator reactivity, decision rules, strategy fit
- `live-observer.ts` — Live context round-robin (regime, nearest zones, active rules, news, macro)
- `zone-filter.ts` — Filtro prossimità per reaction zones (±15% dal prezzo)
- `news/news-aggregator.ts` — RSS feed + sentiment analysis
- `macro/event-calendar.ts` — ForexFactory parser per eventi macro

### Mine Engine (`src/lib/mine/`)

- `types.ts` + `constants.ts` + `utils.ts` — Tipi, costanti, utility
- `mine-store.ts` — CRUD Redis per mines
- `signal-detector.ts` — Genera segnali entry da live context + AIC
- `decision-engine.ts` — Filtra segnali con risk checks, macro blackout, sample size
- `risk-manager.ts` — Validazione TP/SL, position sizing, drawdown limits
- `execution.ts` — Interfaccia broker (Alpaca paper)
- `mine-tick.ts` — Orchestratore principale (chiamato dal cron ogni 60s)
- `feedback.ts` — Feedback loop: mine chiuse → scorecard
- `aic-client.ts` — Client HTTP per comunicare con le istanze AIC

### UI (`src/app/(dashboard)/`)

- `assets/[symbol]/page.tsx` — Pagina asset principale
- `mines/page.tsx` — Dashboard mines
- `settings/page.tsx` — Settings (mine engine ON/OFF, risk params)

### Infra

- `src/lib/db/redis.ts` — Upstash wrapper con retry
- `src/workers/cron-worker.js` — PM2 cron (60s tick)

## Bug noti e decisioni architetturali

### Fix applicati (2026-04-09)

1. **Reaction zones stale**: Zone a -60% dal prezzo classificate come "resistance". Fix: filtro ±15% in `computeReactionZones()` + fallback limitato a ±20% in `findNearestZones()` + lookback limitato a 200 candele e filtro ±15% in AIC `indicator_engine.py`
2. **AIC indicator_engine.py**: `ta.tsi()` ritornava DataFrame (fix: `.iloc[-1, 0]`), safety net per convertire Series/ndarray residui a scalari
3. **AIC backtester.py**: SuperTrend + pandas 3.0 incompatibilità (fix: keyword args `length=int()`, `multiplier=float()`)
4. **AIC report_generator.py**: `{{}}` in f-string Python 3.12 causava "unhashable type: dict" (fix: variabile estratta pre-f-string)

### Insight dai dati (da considerare nello sviluppo)

- **RSI inverso su BTC**: RSI_oversold ha return negativo, RSI_overbought ha return positivo. BTC è momentum-driven — evitare strategie contrarian RSI
- **Bias long strutturale**: Le regole SELL sono debolissime (WR 30%). Il sistema è correttamente più cauto sugli short
- **Sample size**: Regole con <30 osservazioni non devono influenzare decisioni reali. Il backtester ha `min_trades: 30`, ma la training pipeline Nexus Pro (`asset-analytic.ts`) potrebbe non avere lo stesso filtro
- **Regime vs Confluence**: Sono metriche diverse e complementari. Regime = trend strutturale macro. Confluence = allineamento indicatori su TF. Possono divergere legittimamente (es. BULL macro + BEARISH short-term = ranging/pullback)

## Regole operative

1. **Branch**: Per nuove feature, crea branch da `main`. Il branch `phase-4-mine-engine` è già merged
2. **Test dopo ogni step**: `pnpm test:run && pnpm build` — DEVE essere verde
3. **Non inventare**: Se un'interfaccia o un comportamento non è chiaro, chiedi a Riccardo
4. **Leggi prima di scrivere**: Prima di modificare un file esistente, leggilo tutto. Capiscilo
5. **Rispetta la memoria**: 3.8GB RAM totale, ~2.5GB libera. No array enormi. No cache in-memory grandi. Ogni istanza AIC usa ~370MB
6. **Lingua**: Codice e commenti in inglese. UI in italiano
7. **Style**: Segui lo stile del codice esistente (Tailwind, componenti React, naming conventions)
8. **AIC su droplet**: I file Python AIC vivono SOLO sulla droplet (`/home/nexus/aic/`). Per modificarli usa SSH. Le patch locali vanno in `aic-patches/`
9. **Exchange**: Usare **Kraken** (Binance e Bybit sono geo-bloccati dalla droplet). Kraken non supporta TF > 1d

## Comandi

```bash
# Nexus Pro (locale)
pnpm test:run        # Vitest (344 tests)
pnpm build           # Next.js build
pnpm dev             # Dev server locale

# Droplet
ssh root@167.172.229.159 "su - nexus -c 'pm2 status'"
ssh root@167.172.229.159 "su - nexus -c 'pm2 logs aic-btc --lines 30 --nostream'"
ssh root@167.172.229.159 "su - nexus -c 'curl -s http://localhost:8080/status'"
ssh root@167.172.229.159 "su - nexus -c 'curl -s http://localhost:8080/confluence'"
ssh root@167.172.229.159 "free -h"
```

## Vincoli

- Upstash Redis: free tier, payload piccoli, ~10k cmd/giorno
- Alpaca paper: rate limit 200 req/min
- Crypto assets: BTC, ETH, SOL
- PM2 cron tick: 60s, tutto deve completare in <50s
- Droplet: 3.8GB RAM, 2GB swap — AIC usa ~370MB per istanza
- Kraken: no TF > 1d, no geo-blocking da US
- PyTorch non installato su droplet (LSTM disabled, non critico)
- TA-Lib non installato su droplet (candlestick patterns non disponibili, non critico)
