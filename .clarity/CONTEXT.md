# Memoria di Contesto — NexusOne

## Progetto
- **Nome**: NexusOne
- **Descrizione**: Piattaforma di trading multi-strategy con regime detector (v2 deployed 2026-04-16)
- **Obiettivo**: Operare 24/7 in paper trading con switch a live SOLO su APPROVO_NEXUSONE_LIVE=si

## ⚠️ REGOLE CRITICHE
- **NEXUSONE_MODE=paper** (qualsiasi cambio a 'live' richiede APPROVAL)
- **Mai toccare chiavi API di exchange con soldi reali**
- **Variabili con 'LIVE/PROD' → fermati e chiedi**

## Architettura
- v2 multi-strategy + regime detection
- Path: /home/varcavia-dev/dev/nexus-pro
- Deploy: 2026-04-21

## Cosa Clarity può fare
- Esecuzione strategie in paper mode
- Monitoraggio regime market
- Analisi backtest