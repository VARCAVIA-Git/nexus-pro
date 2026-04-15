# NexusOne — Research Rules

## Principi

1. **No data snooping**: mai guardare i dati OOS prima di finalizzare la strategia
2. **No lookahead**: nessun indicatore puo usare dati futuri
3. **No target contamination**: il target (profitto/loss) non entra nei features
4. **Cost model realistico**: ogni backtest include spread, slippage, commissioni
5. **Benchmark obbligatorio**: ogni strategia deve battere il buy-and-hold e un baseline random

## Validazione obbligatoria

Ogni strategia deve passare TUTTI questi gate prima di diventare Paper Candidate:

| Gate | Soglia | Descrizione |
|---|---|---|
| OOS net bps | > 0 | Profitto netto positivo out-of-sample |
| OOS trades | >= 30 | Almeno 30 trade nel periodo OOS |
| OOS Sharpe | > 0.5 | Sharpe ratio annualizzato > 0.5 |
| Walk-forward stable | tutti positivi | Ogni fold del walk-forward deve essere positivo |
| Bootstrap p-value | < 0.05 | L'edge non e dovuto al caso |
| Max drawdown | < 15% | Drawdown massimo nel periodo di test |

## Lifecycle strategia

```
Draft → Research → Rejected
                 → Paper Candidate → Paper → Live Candidate → Live → Retired
```

- **Draft**: ipotesi scritta, non ancora testata
- **Research**: backtest in corso
- **Rejected**: non passa i gate — documentare perche
- **Paper Candidate**: passa tutti i gate, pronta per paper
- **Paper**: paper trading attivo
- **Live Candidate**: paper tracking positivo per >= 2 settimane
- **Live**: trading live con capitale reale
- **Retired**: disabilitata (edge degradato, mercato cambiato)

## Cost model

| Componente | Valore default |
|---|---|
| Commissione taker | 2.5 bps (0.025%) |
| Commissione maker | 1.5 bps (0.015%) |
| Slippage stimato | 3 bps |
| Spread stimato | 2 bps |
| **Costo totale round-trip** | **~12 bps** |

Ogni backtest deve sottrarre questi costi da ogni trade.

## Regola anti-overfitting

- Max 5 parametri ottimizzabili per strategia
- Ogni parametro deve avere una giustificazione economica (non statistica)
- Il rapporto trades/parametri deve essere >= 10:1
- No curve fitting su dati in-sample
