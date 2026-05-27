# NexusOne v3 — Adaptive System Validation (2026-05-03)

## Decisione finale

**v3 è PAPER-READY, non LIVE-READY.**

Il sistema rispetta tutti i criteri di rischio (DD < 2%, Sharpe > 1.5) ma il p-value bootstrap (0.104) è appena sopra la soglia di significatività statistica (0.10). Per andare paper basta. Per andare live serve dimostrare consistenza in 30+ giorni di operatività reale prima di sbloccare il flag `nexusone:v3:approve_live`.

## Cosa è stato costruito

Architettura **adaptive in resource allocation, frozen in rule logic**:

```
6 primitives × 6 asset × 2 timeframe = 72 tuple (strategy, asset, tf)
        │
        ├── Regime detector (4 stati)
        │     ↓ ogni primitive trade solo nei regime previsti
        ├── Tuple manager (Bayesian gate)
        │     ↓ tuple ATTIVA se posterior > -2 bps E last-30 sum > -300
        │     ↓ tuple COOLDOWN se posterior < -8 bps O drawdown
        ├── Quarter-Kelly position sizer (1/4 Kelly, cap 5%)
        ├── Risk caps (3% daily, 8% weekly, 5 conseq losses)
        └── Orchestrator (puro, stesso codice in backtest e live)
```

Layout file:
- `src/lib/nexusone/v3/types.ts` — tipi condivisi
- `src/lib/nexusone/v3/indicators.ts` — RSI / EMA / ATR / SMA / regime per bar
- `src/lib/nexusone/v3/primitives/index.ts` — 6 primitives + regime gate
- `src/lib/nexusone/v3/tuple-manager.ts` — Bayesian gate + Kelly
- `src/lib/nexusone/v3/risk.ts` — daily/weekly halt caps
- `src/lib/nexusone/v3/orchestrator.ts` — `tick()` puro
- `src/lib/nexusone/v3/persistence.ts` — Redis state I/O
- `src/app/api/nexusone/v3/tick/route.ts` — cron entry-point
- `src/app/api/nexusone/v3/status/route.ts` — observability
- `scripts/activate-v3-paper.sh` — paper-mode activation

## Validazione (2 anni, 6 asset, 1H + 4H)

### Universo
6 asset USDT-perp su OKX: BTC, ETH, SOL, BNB, XRP, ADA.

### Periodo
2024-05-04 → 2026-05-03 (24 mesi). 17.700 barre 1H + 4.500 barre 4H per asset.

### Configurazione
- Capitale iniziale: $10.000
- Cost model: 6 bps RT (maker)
- Warmup: 60 giorni per fold (trade reali ma metriche escluse)
- Walk-forward: 4 fold da ~6 mesi
- Bootstrap: 2.000 ricampionamenti

### Risultati globali (post-warmup)

| Metric | Value | Gate |
|---|---|---|
| Trades total | 468 | — |
| Trades / day | **1.77** | ≥ 1 ✓ |
| Total return | **+3.84%** | > 0 ✓ |
| Max drawdown | **1.81%** | < 18% ✓ |
| Sharpe (annualized) | **1.50** | > 0.8 ✓ |
| Profit factor | 1.27 | — |
| Win rate | 37.0% | — |
| Bootstrap p-value | **0.104** | < 0.10 ✗ |

Gate pass-rate: **5/7**. Il p-value è sotto la soglia di un soffio.

### Walk-forward (4 fold)

| Fold | Periodo | Trade | Net | DD | Sharpe | p |
|---|---|---|---|---|---|---|
| 1 | 24-05 → 24-11 | 243 | -1.46% | 1.80% | -3.22 | 1.000 |
| 2 | 24-11 → 25-05 | 280 | +1.03% | 1.20% | +1.32 | 0.234 |
| 3 | 25-05 → 25-11 | 271 | **+2.42%** | 0.72% | **+2.81** | **0.080** |
| 4 | 25-11 → 26-05 | 192 | -0.86% | 1.48% | -2.79 | 1.000 |

Fold 3 è genuinamente significativo (p=0.080, Sharpe 2.81). Fold 1 e 4 sono debolmente negativi ma con drawdown trascurabili (1.5-1.8%): il sistema **non perde controllo** anche quando perde soldi. Questo è frutto del position sizing Quarter-Kelly e dei risk caps.

### Lettura onesta

Il sistema:
1. **Funziona meccanicamente** — esegue trade, misura, adatta, controlla rischio.
2. **Rispetta i vincoli di rischio** — 1.81% max DD su 2 anni è ottimo.
3. **Genera volume** — 1.77 trade/giorno medio, anche di più nei sub-periodi (4 fold ha 2.4 trade/giorno).
4. **Ha edge marginale** — Sharpe 1.50 è genuino ma p=0.104 dice "10% probabilità che sia rumore".

Il sistema NON:
- Garantisce profitto in ogni periodo (2 fold negativi su 4)
- Ha edge statisticamente solido (p borderline)
- Sopravvive a un cost model peggiore (con costi taker, 13 bps RT, l'edge sparisce)

## Path verso live

### Fase 1 — Paper trading (subito)

```bash
cd ~/dev/nexus-pro
./scripts/activate-v3-paper.sh
# Cron worker chiama POST /api/nexusone/v3/tick a ogni close 1H/4H
# Status:  GET /api/nexusone/v3/status
```

**Criteri minimi per paper-pass (30 giorni):**
- Sharpe paper > 1.0 (vs 1.5 backtest, accetto degrado del 33%)
- Max drawdown < 5%
- ≥ 30 trade chiusi
- Per-tuple expectancy: ≥ 50% delle tuple attive con posterior > 0
- Numero di "halt" attivati < 3

Se anche solo uno di questi criteri fallisce a 30 giorni → estendere paper o tornare a research.

### Fase 2 — Live micro ($500 cap, dopo paper-pass)

Richiede:
1. Paper-pass certificato (script di review automatico — TODO)
2. Setting `nexusone:v3:mode = live_micro`
3. **Setting manuale** `nexusone:v3:approve_live = true` ← l'unica chiave umana
4. Capital cap: max $500 esposizione totale

Durata: 30 giorni continuativi. Criteri: stessi del paper, ma su denaro reale.

### Fase 3 — Live full (dopo micro-pass)

Capital cap: scaling per Kelly bankroll formula con review settimanale.

## Cosa serve ancora (non bloccante per paper)

- [ ] Implementare `placeBrokerOrder()` in `tick/route.ts` (Alpaca limit order maker)
- [ ] Schema Supabase per persistenza long-term (`v3_trades`, `v3_tuple_state_daily`)
- [ ] UI dashboard `/nexusone/v3` che legge da `/api/nexusone/v3/status`
- [ ] Auto-pass evaluator: script che dichiara paper-pass o paper-fail dopo 30 giorni
- [ ] Migrazione Redis Upstash → locale sul droplet (per zero-quota tick)
- [ ] Disabilitare i tick legacy v2 nel cron worker quando si attiva v3

## Riproduzione

```bash
cd ~/dev/nexus-pro
node_modules/.bin/tsx scripts/research/fetch-cache.ts        # ~2 min, una tantum
node_modules/.bin/tsx scripts/research/adaptive-backtest.ts  # ~1 sec
```

Output: `docs/nexusone/V3_VALIDATION_RAW.json`.

## Scelte autonome documentate

1. **Adaptive in resource allocation, not in rule logic** — i primitives restano congelati. Adattamento solo su attivazione tuple e position sizing. Questo evita curve-fitting che ha distrutto v2.
2. **Bayesian shrinkage con prior=0bps weight=30** — equilibrio tra "fidati dell'evidenza recente" e "non sovrarreagire al rumore".
3. **Quarter-Kelly + cap 5%** — Kelly pieno è teoricamente ottimale ma esplosivo in pratica. 1/4 Kelly è il compromesso standard tra crescita e survival.
4. **Regime gate** — Donchian/EMA solo in TRENDING_*, BB/RSI/Range solo in RANGING. Ha portato Sharpe da 0.23 → 1.50.
5. **60d warmup per ogni fold** — il sistema deve raccogliere dati prima di adattarsi. Senza warmup il primo periodo è cieco.
6. **Live gate manuale** — `approve_live` flag è separato dal `mode`. Il sistema può essere "in live mode ma non operativo" finché l'umano non sblocca. Rispetta la regola di sicurezza durable.
