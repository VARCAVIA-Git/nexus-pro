# NexusOne Rebuild Plan

## Stato attuale (audit 2026-04-15)

### Cosa e pronto
- NexusOne core: 8 file in `src/lib/nexusone/` (registry, S1, signal, execution, risk, eval, worker)
- Broker Alpaca: paper + live keys, adapter funzionante
- Alpaca Data: crypto + stock bars con volume reale
- Data providers: CoinMarketCap, CryptoPanic, Finnhub, FMP, TradingEconomics
- Redis (Upstash): caching e state
- Supabase: database

### Cosa e legacy (da isolare)
- `src/lib/analytics/` (57 file) — vecchio discovery engine
- `src/lib/mine/` (11 file) — vecchio mine engine
- `src/lib/research/` (28 file) — vecchio backtester
- 6 cron routes legacy (analytic-tick, auto-retrain-tick, live-observer-tick, mine-tick, tick, force-tick)
- UI vecchia: analisi, bot, mines pages

### Gap critici
1. **Funding rates**: S1 richiede funding rates, Alpaca non li fornisce. Serve adapter Binance/OKX
2. **Research metrics**: S1 ha metriche vuote (0 trades OOS, 0 sharpe)
3. **UI NexusOne**: nessuna pagina dedicata
4. **Paper engine continuo**: non implementato (solo il vecchio PaperBroker locale)

## Piano di implementazione — 5 sprint

### Sprint 1: Isolamento + Data Layer (oggi)
1. Disattivare tutti i vecchi tick nel cron-worker
2. Spostare codice legacy in `src/lib/_legacy/`
3. Implementare data adapter: Binance funding rates
4. Implementare data adapter: multi-timeframe OHLCV via Alpaca
5. Data quality checker
6. Test data layer

### Sprint 2: Research Engine + S1 Validation
1. Backtester NexusOne-native (no lookahead, realistic costs)
2. Walk-forward validator
3. OOS test framework
4. Validare S1 con dati reali
5. Popolare research_metrics
6. GO/NO-GO su S1

### Sprint 3: Paper Engine Continuo
1. Paper execution engine (usa Alpaca paper API)
2. Trade logger (Redis + Supabase)
3. PnL tracker continuo
4. Paper vs research comparator
5. Drift detector paper mode
6. Report giornaliero automatico

### Sprint 4: Live Guard + Risk
1. Live mode guarded (micro capital)
2. Pre-trade risk checks completi
3. Daily/weekly drawdown stops
4. Emergency stop automatico
5. Broker error handling
6. Reconciliation

### Sprint 5: UI + Monitoring
1. Dashboard NexusOne
2. Strategy detail page
3. Data health page
4. Risk controls page
5. 24/7 health checks
6. Report settimanali

## Priorita assoluta
Sprint 1 e Sprint 2 sono bloccanti. Senza dati e senza validazione, il resto non ha senso.
