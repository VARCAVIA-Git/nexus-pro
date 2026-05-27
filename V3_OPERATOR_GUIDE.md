# NexusOne v3 — Operator Guide

## Stato corrente (2026-05-04)

- **Mode**: `paper` (file `.v3-state/mode.json`)
- **Daemon paper runner**: PM2 `nexus-v3-paper`, tick ogni 60s
- **Auto-evaluator**: PM2 `nexus-v3-evaluator`, ogni 6 ore
- **Auto-restart su reboot**: cron `@reboot pm2 resurrect`
- **Broker**: Alpaca Paper (`PKTEAC2...`), $96k equity simulati
- **Live**: NON approvato. Per attivare → vedi sotto.

## Cosa fa il sistema, ogni minuto

1. Legge l'ultima barra 1H e 4H da OKX per BTC/ETH/SOL/BNB/XRP/ADA
2. Skip se la barra è già stata processata
3. Per ogni stream nuovo: precomputa indicatori + regime, valuta exits + entries
4. Se entry: piazza ordine paper su Alpaca (BTC/ETH/SOL supportati; BNB/XRP/ADA simulati)
5. Persiste `tuples.json`, `portfolio.json`, `closed.json` su disco

Ogni 6 ore il evaluator:
- Calcola Sharpe, drawdown, trade rate, win rate
- Scrive `evaluator-report.md` leggibile
- A 30 giorni: emette PAPER_PASS / PAPER_HOLD / PAPER_FAIL
- Su PAPER_FAIL: imposta automaticamente mode=disabled

## Comandi utili

```bash
cd ~/dev/nexus-pro

# Stato processi
pm2 list

# Log live
pm2 logs nexus-v3-paper

# Stato sistema (file leggibili)
cat .v3-state/runner.log | tail -50
cat .v3-state/evaluator-report.md
cat .v3-state/portfolio.json | jq

# Forza una valutazione subito
pm2 restart nexus-v3-evaluator

# Stoppa tutto
pm2 stop nexus-v3-paper nexus-v3-evaluator

# Riparti tutto
pm2 start ecosystem.v3.config.js

# Disabilita trading senza killare il daemon (resta in idle)
node_modules/.bin/tsx -e "
import { setMode } from './src/lib/nexusone/v3/persistence';
setMode('disabled').then(() => console.log('disabled'));
"

# Riattiva paper
node_modules/.bin/tsx -e "
import { setMode } from './src/lib/nexusone/v3/persistence';
setMode('paper').then(() => console.log('paper'));
"

# Reset completo (cancella ledger, equity simulata, ecc.)
pm2 stop nexus-v3-paper && rm -rf .v3-state/*.json .v3-state/runner.log && pm2 start nexus-v3-paper
```

## Promozione a live (DOPO paper-pass)

⚠️ Live richiede DUE atti distinti:

1. Modalità live: `setMode('live_micro')` o `setMode('live')`
2. Approvazione esplicita: `touch .v3-state/approve_live` ← l'unica chiave umana

Senza il file `approve_live`, il sistema piazza solo paper anche se mode=live.

Per revocare l'approvazione live: `rm .v3-state/approve_live`.

Capital cap suggerito: live_micro = $500, live = scaling Kelly.

## Criteri PAPER_PASS (a 30 giorni)

Tutti questi devono essere veri:
- Sharpe annualizzato > 1.0
- Max drawdown < 5%
- ≥ 30 trade chiusi
- ≥ 50% delle tuple attive con posterior expectancy > 0

Kill criteria (interrompono subito):
- Drawdown > 10%
- Sharpe < -1.5 dopo 7 giorni
- Zero trade dopo 14 giorni

Su qualsiasi kill criterion → mode = disabled automatico.

## File chiave

```
src/lib/nexusone/v3/        # runtime modulare (importabile)
scripts/v3-paper-runner.ts  # daemon PM2
scripts/v3-evaluator.ts     # auto-review
ecosystem.v3.config.js      # config PM2
.v3-state/                  # stato persistente (gitignore raccomandato)
  ├── mode.json
  ├── tuples.json
  ├── portfolio.json
  ├── closed.json
  ├── runner.log
  └── evaluator-report.md
```

## Domande frequenti

**Il sistema sta facendo trade?** Guarda `runner.log`: ogni ENTRY/EXIT è loggato. All'inizio non c'è traffico finché non si verificano segnali.

**Cosa succede se il PC si spegne?** Cron `@reboot pm2 resurrect` riavvia tutto. Lo stato persiste su disco.

**Posso modificare le primitives mentre gira?** Sì: cambia il codice in `src/lib/nexusone/v3/primitives/`, poi `pm2 restart nexus-v3-paper`. Il ledger esistente resta — interpretalo: stai cambiando le regole, le statistiche rolling diventano per metà obsolete.

**Quanto consuma?** Il daemon usa ~50 MB RAM, CPU vicino allo 0% (quasi sempre dorme). OKX rate limit largamente rispettato (12 chiamate/min).
