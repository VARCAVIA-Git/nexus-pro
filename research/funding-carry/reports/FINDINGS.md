# Funding-Carry Research — Findings (2026-05-10)

**Dati**: OKX USDT-perpetual funding rate history, 6 asset (BTC, ETH, SOL, BNB, XRP, ADA), 280 events ciascuno = ~93 giorni (2026-02-06 → 2026-05-10). OKX limita storia pubblica a ~3 mesi.

## TL;DR

**Il funding-carry crypto su questi 6 asset, in questo regime di mercato, NON è una macchina da soldi.**

- APR medio lordo: **+1.04%** annualizzato
- Dopo costi realistici (40 bps flip): **vicino zero o negativo** per la maggior parte degli asset
- **Solo BNB** mostra un edge marginale (+1.7% APR Sharpe 2.1 con regime EMA6)
- Tutto il portfolio always-on: **-1.42% APR** (perde dopo costi)

Era atteso: il sample copre un periodo di mercato "calmo". Lo stesso edge in bull market 2021/2024 raggiungeva 20-40% APR.

## Per-asset funding stats (93g)

| Asset | μ 8h (bps) | σ 8h (bps) | APR μ | APR med | % pos | AC lag1 |
|---|---:|---:|---:|---:|---:|---:|
| BTC | +0.126 | 0.44 | +1.38% | +1.36% | 60% | +0.39 |
| ETH | +0.154 | 0.53 | +1.68% | +1.85% | 60% | +0.29 |
| **SOL** | **-0.182** | 0.96 | **-1.99%** | -1.15% | 45% | +0.53 |
| **BNB** | **+0.287** | 0.72 | **+3.14%** | +4.93% | 68% | +0.52 |
| XRP | +0.034 | 0.84 | +0.37% | +1.67% | 55% | +0.41 |
| ADA | +0.151 | 1.12 | +1.66% | +7.42% | 65% | +0.42 |

**Insight chiave**:
- BNB ha il funding più alto e persistente
- SOL è l'unico con APR negativo (gli short pagano)
- Tutti gli asset hanno **autocorrelation lag1 = +0.3 a +0.5** → il funding di adesso predice quello dopo (segnale debole ma utile)
- AC decade a zero entro 3 giorni → l'edge è breve

## Cross-asset funding correlation

```
       BTC    ETH    SOL    BNB    XRP    ADA
BTC  +1.00  +0.42  +0.16  +0.16  +0.12  +0.15
ETH  +0.42  +1.00  +0.26  +0.22  +0.17  +0.26
SOL  +0.16  +0.26  +1.00  +0.49  +0.58  +0.47
BNB  +0.16  +0.22  +0.49  +1.00  +0.40  +0.46
XRP  +0.12  +0.17  +0.58  +0.40  +1.00  +0.42
ADA  +0.15  +0.26  +0.47  +0.46  +0.42  +1.00
```

- BTC è il più decorrelato dagli altri
- "Altseason cluster": SOL/XRP/ADA si muovono insieme (corr ~0.45-0.58)
- Diversification effective: combina BTC + 1 alt = riduci varianza

## Backtest realistico (costi 40 bps per flip)

### Always-on (entra all'inizio, esci alla fine)

| Asset | APR | MaxDD | Sharpe |
|---|---:|---:|---:|
| BTC | -1.72% | 0.51% | -0.19 |
| ETH | -1.45% | 0.40% | +0.15 |
| SOL | -1.33% | 0.64% | +0.26 |
| **BNB** | **+0.01%** | 0.46% | +1.93 |
| XRP | -2.60% | 0.71% | -1.25 |
| ADA | -1.43% | 0.48% | +0.16 |
| **Portfolio 6** | **-1.42%** | 0.40% | +0.19 |

**Mostly negativo** dopo costi entry/exit.

### Regime EMA filter (entra solo se EMA funding > threshold)

| Asset | Best params | APR | Sharpe | Calmar |
|---|---|---:|---:|---:|
| **BNB** | EMA6, in=0.5bp, out=-2.0bp | **+1.72%** | **+2.08** | **+4.41** |
| SOL (long) | EMA3, in=0.5, out=-1.0 | +0.24% | +0.30 | +0.59 |
| ADA | EMA9, in=0.5, out=-2.0 | +0.08% | +0.04 | +0.15 |
| altri | — | ≤ +0.03% | ≤+0.1 | — |

**Solo BNB ha un edge meaningful.** APR 1.7% non è "macchina da soldi" — è meglio di un conto deposito ma con rischio operativo.

## Cosa NON è stato testato (e che potrebbe cambiare il verdetto)

1. **Storico più lungo**: 93g è poco. Bisogna comprare dataset funding (CoinGlass, Kaiko) per 2-3 anni di storia, includendo bull 2024.
2. **Multi-exchange**: stessa strategia su Bybit/Binance può divergere. Aggregare migliora signal.
3. **Premium index / open interest** come secondary signal — quando funding alto + OI in crescita = squeeze pending = entry premium.
4. **Stable funding (USDC vs USDT)** — basis differential trade tra perp USDT e USDC.
5. **Inverse contracts** (BTC-margined) — funding storico storicamente più alto.
6. **Position sizing dinamico** in base a |funding|. Qui ho usato weight fisso.

## Implicazioni per "real money machine"

### Cosa NON funziona standalone
- Funding-carry come unica strategia → marginale o break-even nei regime calmi
- Single asset → too narrow
- Sempre-on senza filtro → costi mangiano edge

### Cosa POTREBBE funzionare
- **Funding-carry come overlay**: capitale dormiente quando NexusOne è flat, attivo solo su BNB quando EMA funding > 5 bps
- **Multi-strategy portfolio** con funding-carry come "yield enhancement" di basso rischio
- **Regime trading**: funding ACCESS in bull (>20% APR storico), OFF in bear/chop

### Capital efficiency
- Per €10K di capitale → +€170/anno gross su BNB regime (con €5K perp + €5K spot delta-neutral)
- Per €100K → +€1700/anno gross
- **Non è vivibile**. È un side yield.

## Prossimi passi consigliati

1. **Acquisto dataset funding storico 2021-2025** (CoinGlass API ~€20-50/mese) per validare in bull regime
2. **Aggiungi Bybit + Binance via VPN** per cross-exchange aggregate signal
3. **Live shadow** su BNB regime con €500 capitale per 60g — misura slippage e basis VERO
4. **Ricerca paper carry**: USDC perp basis spread, inverse contracts, ETH staking + funding stack

## Concluso 2026-05-10. Branch `research/funding-carry`. Tutti gli script in `research/funding-carry/`.
