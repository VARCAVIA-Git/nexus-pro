# NexusOne Research Report — 2026-04-15

## Strategie testate

| ID | Famiglia | Trades | Win% | Net bps | Sharpe | WF | Verdict |
|---|---|---|---|---|---|---|---|
| S1 (funding) | Positioning | 1 | 100% | +12 | 0 | N/A | **REJECTED** (troppo rara) |
| S2 (breakout) | Momentum | 101 | 31% | -1872 | -11 | 0/4 | **REJECTED** |
| S3 (reversion) | Mean Rev | 597 | 38% | -7245 | -10 | 0/4 | **REJECTED** |

## Dati usati

- **OHLCV**: Alpaca Data API, BTC/USD 5m, 17,234 bars (60 giorni)
- **Funding**: OKX reale via droplet (955 rates, 33 giorni per S1)
- **Cost model**: 13 bps round-trip (2.5 taker + 3 slippage + 1 spread per leg)
- **Periodo**: 2026-02-14 → 2026-04-15

## Lezione chiave

**Le strategie con hold breve (6-12 bars, 30-60 min) su 5m crypto non sopravvivono ai costi reali (13 bps RT).**

Per essere profittevoli servono:
- Hold piu lungo (riduce il rapporto costi/edge)
- O edge molto piu grande per trade (>30 bps netti)
- O entrambi

### Calcolo break-even

Con 13 bps di costi RT, per essere profittevoli serve:
- Se 50% win rate: avg winner > 26 bps
- Se 40% win rate: avg winner > 32.5 bps
- Se 60% win rate: avg winner > 21.7 bps

Le strategie testate hanno avg winner di 20-28 bps — insufficiente.

## Prossime ipotesi da testare

### S4 — Volatility Compression/Expansion (hold lungo)
- ATR comprime per 4+ ore → primo breakout
- Hold 24-48 bars (2-4 ore su 5m)
- Riduce impatto costi (13 bps su 2+ ore e sostenibile)

### S5 — Multi-timeframe momentum (1h bars)
- Passare a timeframe 1h
- 13 bps su hold di 6+ ore
- Meno trade, ma edge piu grande per trade

### S6 — Regime-filtered reversion
- Mean reversion SOLO quando volatilita e bassa (range-bound)
- Skip quando trending
- Riduce trade negativi del 40-60%

## Stato del sistema

```
NexusOne: operativo, paper mode, no strategia attiva
Backtester: funzionante, cost model realistico
Data: Alpaca bars + OKX funding (via droplet)
Legacy: completamente isolato
Cron: solo nexusone/tick + health
Live: BLOCCATO (nessuna strategia validata)
```

## Prossimo passo

Testare S4 (vol compression, hold lungo) — questa famiglia ha il miglior rapporto costi/edge teorico su 5m bars.
