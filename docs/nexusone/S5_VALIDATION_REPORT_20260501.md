# NexusOne — Strategy Validation Report (2026-05-01)

**Author**: autonomous research run
**Goal**: identify a strategy producing constant net profit after maker execution costs (6 bps RT) — paper-ready candidate for live consideration.

## TL;DR — VERDETTO: NO-GO

Su un universo di **216 backtest** (36 varianti × 3 asset × 2 timeframe) con costi maker reali, **zero strategie passano la validazione completa**. Il candidato S5 documentato il 15 aprile è stato **rifiutato**. La diversificazione di portfolio è stata testata con metodologia out-of-sample rigorosa: collassa fuori dal training window. La conclusione onesta: in queste condizioni di mercato (BTC/ETH/SOL recenti) nessuna regola frozen semplice produce edge statisticamente significativo.

## Setup

- **Dati**: OKX history-candles (BTC-USDT-SWAP, ETH-USDT-SWAP, SOL-USDT-SWAP)
- **Periodo**: 60 giorni 5m + 1 anno 1H, snapshot al 2026-05-01
- **Cost model**: maker_first (1.5 bps fee, 1.0 bps slippage, 1.0 bps spread → 6 bps round-trip)
- **Validation gates**:
  1. Min 50 trade (sufficiente potenza statistica)
  2. Net edge > 0 dopo costi
  3. Walk-forward 4-fold con TUTTI i fold positivi (no luck pockets)
  4. Bootstrap p-value < 0.05 (one-sided, 1000 iter)
  5. Profit factor ≥ 1.1

## Risultati per fase

### Fase 1 — Re-validazione S5 (RSI bidir)

Il `RESEARCH_REPORT_20260415.md` indicava S5 come paper-ready: +879 bps/60d net con maker costs. Re-eseguito su dati OKX freschi:

| Asset | Trade | Net bps | Win% | WF stable | p-value | Verdetto |
|---|---|---|---|---|---|---|
| BTC-USD | 220 | **-214** | 54.5 | NO ([-278, -45, +480, -390]) | 0.567 | NO_GO |
| ETH-USD | 208 | **-2088** | 49.0 | NO ([-540, -1061, +233, -979]) | 0.926 | NO_GO |
| SOL-USD | 211 | **-808** | 53.1 | NO ([-929, +84, +148, +21]) | 0.687 | NO_GO |

S5 è stato marcato `status: 'rejected'` in `src/lib/nexusone/strategies/s5-rsi-bidir.ts`. Il dato di aprile era apparentemente period-specific.

### Fase 2 — Screening 36 varianti × 3 asset × 2 TF

Famiglie testate: RSI cross/inside, Bollinger reversion, Donchian breakout, EMA pullback. Su 216 backtest:

- 26 con net edge > 0 (12% — sotto il livello atteso da rumore)
- **0 passano walk-forward + bootstrap**
- I top 10 per net bps mostrano sistematicamente almeno un fold negativo significativo

Top candidati respinti (1Y 1H):
| Strategy | Asset | Net 1Y | PF | WF folds | p |
|---|---|---|---|---|---|
| DONCH_24_h48 | ETH | +6644 | 1.33 | [+919, **-1715**, +3286, +2366] | 0.143 |
| DONCH_48_h48 | ETH | +4757 | 1.28 | [+1551, +4417, +1545, **-2735**] | 0.196 |
| RSI_CROSS_35_65_h12 | SOL | +3125 | 1.11 | [-236, +54, +3794, +499] | 0.233 |

Il pattern è uniforme: ogni strategia con net positivo elevato ha ≥1 fold molto negativo. È esattamente il segnale che il sistema deve rifiutare — andrebbe in drawdown profondo periodicamente.

### Fase 3 — Portfolio diversification (out-of-sample)

Ipotesi: combinare 3-6 strategie debolmente correlate riduce la varianza e stabilizza il portfolio.

**Test rigoroso:**
1. Split 1Y in IS (75%) + OOS (25%)
2. Greedy portfolio costruito massimizzando il fold peggiore SU IS only
3. Applicato il portfolio ai dati OOS held-out

Portfolio selezionato (IS only):
- ETH/DONCH_48_h48 (IS net +6956)
- SOL/BB_REV_s2_h12 (IS net +4500)
- SOL/BB_REV_s2_h24 (IS net +2324)
- SOL/EMA_PB_50_h12 (IS net +4029)

| | IS folds | OOS net per strat |
|---|---|---|
| Portfolio | [+915, +910, +1421, +948] bps (all positive) | -2735 / -1747 / -229 / -4136 |

**OOS net portfolio: -2212 bps. Bootstrap p-value: 1.0.**

In altre parole: la combinazione che sembrava perfetta IS è stata **sterminata** sui dati held-out. Questa è precisamente la ragione per cui il walk-forward gate esiste.

## Conclusioni

### 1. Cosa il sistema ha fatto correttamente

NexusOne v2 ha rispettato il proprio mandato: rifiutare strategie senza edge dimostrato. Il backtester con cost model realistico e i gate di validazione (walk-forward + bootstrap + holdout) hanno bloccato:

- Una strategia (S5) che sembrava promettente su un periodo specifico ma non è robusta
- 35 varianti aggiuntive di famiglie diverse
- Un'illusione di portfolio robusto che era curve-fitting

Senza questi gate, S5 sarebbe andata in paper trading e poi probabilmente live, con perdite reali.

### 2. Cosa NON funziona ora

| Approccio | Verdetto |
|---|---|
| Singola strategia frozen (qualsiasi famiglia tested) | NO |
| Portfolio greedy diversificato | NO (curve fitting) |
| Cross-asset semplice (BTC + ETH + SOL) | NO |
| Timeframe 5m vs 1H | NO in entrambi |

### 3. Path realistici verso profitto costante

Nessuno è breve. In ordine di costo crescente:

**A. Edge strutturale, non tecnico** *(richiede infrastruttura aggiuntiva)*
- **Funding-rate carry**: short perp + long spot quando funding > soglia. Edge documentato e persistente. Richiede: account spot+perp, capital efficiency, gestione liquidazioni. Non è "trading di pattern", è capture di un premio strutturale.
- **Triangular arb stablecoin** o **DEX-CEX spread** — edge frazionario ma deterministico, richiede esecuzione ad alta frequenza.

**B. Edge informativo** *(richiede dati alternativi)*
- On-chain: large transfer + esecuzione veloce
- Order flow imbalance da LOB granulare (non da OHLCV)
- News/sentiment NLP con esecuzione sub-second

**C. Ridurre i costi sotto la barriera attuale** *(richiede infrastruttura broker)*
- Maker rebate su exchange tier alto (es. Binance VIP3+ con rebate negativi)
- Connessione co-location / FIX
- Questo riporta il costo da 6 bps verso 1-2 bps RT, dove molte strategie marginali diventano profittevoli

**D. Strategy ensembling con regime detection** *(da non considerare prima di rifare la pipeline)*
- Ogni strategia attiva solo in un regime specifico, switch autorizzato dal regime detector
- Richiede: regime ground truth labelato, validazione regime-by-regime, NO selezione greedy
- Rischio alto di curve fitting senza disciplina molto stretta

## Raccomandazioni operative — ordine di priorità

1. **Mantenere il sistema in `mode=disabled`**. Nessuna strategia paper, nessun live. Il rispetto della regola "NEXUSONE_LIVE_MODE solo con prove" è confermato.
2. **Sbloccare l'infrastruttura comunque** (Redis locale sul droplet, fermare AIC legacy). Costo = un'ora, beneficio = piattaforma pronta quando un edge sarà trovato.
3. **Pivot research verso funding-rate carry**: è strutturalmente diverso da pattern-trading, OKX espone i dati di funding già usati nel codice, l'edge è documentato in letteratura. Tempo stimato: 1-2 settimane di ricerca prima di un MVP.
4. **Non rincorrere il prossimo "promettente" set di parametri**. Il problema non sono i parametri ma che l'universo di strategie semplici BTC/ETH/SOL su OHLCV non ha edge sufficiente sui costi maker correnti.

## Artefatti

- `docs/nexusone/S5_VALIDATION_RAW.json` — backtest S5 multi-asset
- `docs/nexusone/STRATEGY_SCREENING.json` — screening 36 varianti × 3 asset × 1Y 1H
- `docs/nexusone/PORTFOLIO_TEST.json` — combinazioni di portfolio (greedy / per-symbol / per-family)
- `docs/nexusone/OOS_PORTFOLIO_VALIDATION.json` — true out-of-sample test
- `scripts/research/validate-s5.ts` — entry point S5
- `scripts/research/screen-strategies.ts` — entry point screener
- `scripts/research/portfolio-test.ts` — entry point portfolio (in-sample)
- `scripts/research/oos-portfolio.ts` — entry point true OOS

Per riprodurre: `pnpm tsx scripts/research/oos-portfolio.ts`.
