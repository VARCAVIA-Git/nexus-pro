# NexusOne — Data Plan

## Fonti dati attive

| Fonte | Tipo | Auth | Limite | Usato per |
|---|---|---|---|---|
| Alpaca Data API | OHLCV crypto + stocks | API key (paper/live) | 200 req/min | Bars 5m, live price |
| Binance Public | Funding rates futures | Nessuna | 2400 req/min | S1 funding z-score |

## Fonti dati disponibili (non ancora integrate)

| Fonte | Tipo | Auth | Limite | Potenziale uso |
|---|---|---|---|---|
| Alpaca Data API | Bars multi-TF (1m-1d) | Gia configurata | 200/min | Research, multi-TF analysis |
| CoinGecko | Prezzi crypto, market cap | Free (opzionale key) | 10/min | Metadata, alternative price |
| Twelve Data | OHLCV stocks + forex | API key | 800/giorno | Stocks bars |
| CoinMarketCap | Ranking, dominance, metadata | API key | 333/giorno | Market context |
| Finnhub | Fondamentali, earnings, news | API key | 60/min | Stock fundamentals |
| FMP | Calendario economico | API key | 250/giorno | Macro events |
| Trading Economics | Calendario macro | Guest (no key) | ~100/giorno | Macro schedule |
| CryptoPanic | News crypto | Free (opzionale key) | ~100/giorno | Sentiment proxy |

## Dati necessari per S1

| Dato | Fonte | Frequenza | Stato |
|---|---|---|---|
| BTC/USD 5m OHLCV | Alpaca | Ogni 30s | PRONTO |
| BTC/USD live price | Alpaca | Ogni 30s | PRONTO |
| BTC funding rate history | Binance | Ogni 8h (fetch ogni 30s) | IMPLEMENTATO (nuovo) |

## Gap residui

| Gap | Impatto | Soluzione possibile |
|---|---|---|
| Funding rates storici lunghi (>1000) | Limita depth del backtest S1 | Fetch e persist in Supabase |
| Open Interest | Non disponibile gratis in modo affidabile | Non necessario per S1 |
| Liquidation data | Non disponibile gratis | Non necessario per S1 |
| Spread reale tick-by-tick | Impossibile gratis | Stimare con proxy 2 bps |

## Storage strategy

| Dato | Dove | TTL | Motivo |
|---|---|---|---|
| Live bars (ultime 200) | Redis | 1h | Fast access per signal engine |
| Funding rates (ultime 100) | Redis | 4h | Fast access per z-score |
| Data quality snapshot | Redis | 5min | Health check |
| Bars storici per backtest | Supabase (futuro) | Permanente | Research |
| Trade history | Supabase | Permanente | Audit trail |

## Quality checks

Ogni tick verifica:
- bars_count >= 30 (altrimenti skip signal)
- funding_count >= 10 (altrimenti skip signal se S1)
- latest_bar_age < 600s (altrimenti stale data warning)
- price > 0 (altrimenti broker error)
