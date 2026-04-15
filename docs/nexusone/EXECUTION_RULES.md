# NexusOne — Execution Rules

## Modalita di sistema

| Modalita | Descrizione | Chi puo attivarla |
|---|---|---|
| `disabled` | Nessun trading. Solo data collection. | Default |
| `paper` | Paper trading via Alpaca Paper API | Automatico dopo Paper Candidate |
| `live_guarded` | Live con micro-capitale e limiti stretti | Solo manuale + gate check |

## Regole di esecuzione

### Order routing
1. Tutti gli ordini passano da Alpaca (paper o live)
2. Ordini market per urgenza, limit (maker-first) per default
3. Timeout ordine limit: 2 bars (10 min su 5m TF)
4. Se limit non riempito in timeout: cancella (no chase)

### Fill tracking
- Ogni ordine registra: intended price, actual price, slippage, fee, latency
- Slippage medio > 15 bps → warning
- Fill rate < 50% → auto-disable strategy

### Position management
- Hold period definito dalla strategia (es. S1 = 6 bars = 30 min)
- Alla scadenza hold period: close a mercato
- No trailing stop (complessita inutile senza edge provato)

### Reconciliation
- Ogni 5 minuti: verifica posizioni broker vs stato interno
- Mismatch → log + alert
- Posizione orfana → close a mercato dopo 2 verifiche consecutive

## Regole live_guarded

| Parametro | Valore |
|---|---|
| Capitale iniziale max | $500 |
| Max position size | $100 |
| Max open positions | 1 |
| Max daily loss | $25 (5%) |
| Max weekly loss | $50 (10%) |
| Consecutive losses kill | 5 |
| Min paper track record | 2 settimane positive |
| Emergency stop | Sempre disponibile (API + UI + kill switch) |
