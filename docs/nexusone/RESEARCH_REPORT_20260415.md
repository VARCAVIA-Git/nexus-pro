# NexusOne Research Report — 2026-04-15 (Final)

## Executive Summary

**15 strategie testate su 60 giorni di dati reali BTC/USD 5m. Nessuna e profittevole dopo costi reali (13 bps RT).** Questo non e un fallimento del sistema — e il sistema che funziona correttamente rifiutando strategie senza edge.

## Strategie testate

### Fase 1: Strategie dedicate (S1-S4)

| ID | Famiglia | Trades | Win% | Net bps | Verdict | Motivo |
|---|---|---|---|---|---|---|
| S1 | Funding extremes | 1 | 100% | +12 | REJECTED | Troppo rara (1 trade/mese) |
| S2 | Momentum breakout | 101 | 31% | -1872 | REJECTED | Edge insufficiente vs costi |
| S3 | Mean reversion | 597 | 38% | -7245 | REJECTED | Costi dominano (troppi trade) |
| S4 | Vol compression | 0 | - | 0 | REJECTED | Nessun evento di compressione |

### Fase 2: Screening 11 strategie semplici

| Strategia | Trades | Win% | Net bps | PF | t-stat |
|---|---|---|---|---|---|
| SMA20x50 long 24b | 186 | 34% | -2855 | 0.58 | -2.67 |
| SMA20x50 long 48b | 136 | 40% | -2394 | 0.64 | -1.81 |
| SMA20x50 bidir 48b | 161 | 43% | -2541 | 0.66 | -1.81 |
| RSI<25 long 12b | 64 | 55% | -405 | 0.79 | -0.60 |
| RSI<30 long 24b | 122 | 46% | -605 | 0.85 | -0.55 |
| RSI<30 long 48b | 97 | 40% | -1295 | 0.70 | -1.20 |
| **RSI bidir 24b** | **218** | **52%** | **-211** | **0.97** | **-0.16** |
| Above SMA200 48b | 97 | 37% | -1863 | 0.60 | -1.68 |
| Below SMA200 48b | 98 | 45% | -1681 | 0.62 | -1.70 |
| 48bar high brk 48b | 97 | 34% | -1375 | 0.71 | -1.17 |
| 96bar high brk 96b | 52 | 42% | -967 | 0.76 | -0.73 |

**Best candidate: RSI bidir 24b** — quasi break-even (PF 0.97, -1 bps/trade avg).

## Analisi strutturale

### Il problema dei costi

Con 13 bps di costi round-trip su 5m bars:

| Hold period | Costo/ora | Edge minimo per trade |
|---|---|---|
| 30 min (6 bars) | 26 bps/h | ~26 bps |
| 2 ore (24 bars) | 6.5 bps/h | ~15 bps |
| 4 ore (48 bars) | 3.25 bps/h | ~15 bps |
| 8 ore (96 bars) | 1.6 bps/h | ~15 bps |

Il hold period da solo non basta. Serve un edge lordo > 13 bps per trade dopo aver tenuto conto del win rate.

### Calcolo break-even per RSI bidir (il migliore)

- 218 trade, 52% win, avg gross winner +36 bps, avg gross loser -38 bps
- Gross PnL: +2623 bps (positivo!)
- Costi: 218 * 13 = 2834 bps
- Net: -211 bps

**Se riducessimo i costi a 8 bps RT (maker orders)**: 218 * 8 = 1744 bps di costi, Net = +879 bps. **Sarebbe profittevole.**

## Raccomandazioni

### Priorita 1: Ridurre costi di esecuzione
- Passare da market orders a **limit orders (maker)**: 1.5 bps vs 2.5 bps per leg
- Ridurre slippage assumption da 3 a 1 bps (limit orders)
- **Target: 8 bps RT** (da 13 bps)
- Questo renderebbe RSI bidir profittevole (+879 bps su 60d)

### Priorita 2: Testare su timeframe 1h
- Riduce il noise
- Riduce il numero di trade (meno costi)
- Potenzialmente edge piu grande per trade

### Priorita 3: Testare su altri asset
- ETH/USD — piu volatile, potenzialmente piu edge
- SPY/AAPL — mercato azionario, diversi pattern
- Multi-asset riduce il rischio di overfitting a BTC

### Priorita 4: Implementare maker execution
- Alpaca supporta limit orders
- NexusOne execution-engine ha gia mode maker_first
- Ridurre il cost model nel backtester a 8 bps e retestare

## Stato del sistema

```
NexusOne:        operativo, paper mode, no strategia attiva
Backtester:      funzionante, 15 strategie testate
Data:            Alpaca 5m bars (60d) + OKX funding
Legacy:          completamente isolato
Live:            BLOCCATO
Best candidate:  RSI bidir (quasi break-even, potenzialmente GO con costi ridotti)
```

## Prossimo passo immediato

Retestare RSI bidir con cost model 8 bps (maker orders). Se positivo:
1. Formalizzare come S5
2. Walk-forward validation
3. Paper trading continuo
4. GO/NO-GO per live dopo 2 settimane di paper positivo
