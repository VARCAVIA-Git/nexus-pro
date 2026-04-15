# NexusOne — Operating Rules

Regole operative permanenti. Non modificabili senza conferma esplicita dell'utente.

## 1. Paper-first

Tutte le strategie operano in paper trading fino a validazione completa.
Non esiste eccezione a questa regola.

## 2. Live solo con approvazione

Il live trading si attiva SOLO quando:
- S1 (o altra strategia) dimostra edge reale in paper per >= 2 settimane
- Il sistema di monitoring e stabile e operativo
- L'utente da conferma esplicita scritta
- Il deploy e stato testato in staging

## 3. Operativita 24/7

Il sistema deve operare in continuo:
- Raccogliere dati (bars, funding, prices)
- Eseguire paper trading delle strategie approvate
- Aggiornare metriche, log e memoria
- Monitorare data quality
- Segnalare anomalie

Se i dati sono mancanti o insufficienti, il sistema li procura in autonomia.

## 4. Deploy controllato

Quando ricevo comando di deploy:
1. Build locale (pnpm build)
2. Verifica TypeScript zero errori
3. Test suite verde
4. Push a GitHub
5. Deploy su droplet staging
6. Mostrare risultato all'utente
7. Produzione SOLO con conferma esplicita

## 5. Agenti in paper

Gli agenti OpenClaw/MyClaw operano sempre in modalita paper.
Non hanno accesso a operazioni live.
Possono: raccogliere dati, audit, report, monitoring.

## 6. Mappa aggiornata

Mantenere sempre aggiornati:
- CLAUDE_MEMORY.md — stato sistema
- docs/nexusone/STRATEGY_REGISTRY.md — strategie e stato
- Log di manutenzione — ~/logs/

## 7. Alert automatici

Il sistema deve segnalare:
- Edge degradation (drift report negativo)
- Data quality issues (stale bars, funding gaps)
- Kill switch triggered
- Paper PnL negativo oltre soglia
- Anomalie nel workspace

Segnalare = log + report, non azione distruttiva.
