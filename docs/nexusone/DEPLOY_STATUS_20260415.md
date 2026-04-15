# NexusOne Deploy Status — 2026-04-15

## Deploy completato

| Step | Stato |
|---|---|
| Git push to GitHub | DONE |
| Droplet git pull | DONE (commit 98dc2dd) |
| pnpm install | DONE |
| pnpm build | DONE (zero errori) |
| PM2 restart nexus-web | DONE (online) |
| PM2 restart nexus-cron | DONE → poi FERMATO |
| Activate S5 paper (Redis) | **BLOCCATO** |

## PROBLEMA: Redis quota esaurita

Upstash Redis ha raggiunto il limite mensile di 500.000 richieste.

**Causa**: il vecchio cron worker con 6 tick ogni 30-60s consumava migliaia di comandi Redis/giorno. In 15 giorni ha bruciato tutta la quota mensile.

**Impatto**: non posso settare le chiavi Redis per attivare S5 paper trading.

**Azioni prese**:
- Cron worker FERMATO per evitare errori continui e ulteriore consumo
- nexus-web resta online (serve la UI e le API)

## Opzioni per risolvere

### Opzione A: Attendere reset quota
- Il free tier Upstash si resetta probabilmente il 1 del mese
- Fino ad allora: sistema in standby

### Opzione B: Upgrade Upstash (Pay-as-you-go)
- $0.2 per 100K comandi
- Il nuovo cron (solo nexusone/tick) fa ~2 comandi per tick * 2880 tick/giorno = ~6K/giorno = ~180K/mese
- Costo stimato: ~$0.36/mese
- ENORME miglioramento rispetto al vecchio sistema (che faceva 500K in 15 giorni)

### Opzione C: Redis locale sul droplet
- Installare Redis sul droplet (nessun costo, nessun limite)
- Richiede cambio di configurazione
- Pro: zero limiti, latenza zero
- Contro: perde persistenza cloud, richiede backup

## Raccomandazione

**Opzione C (Redis locale)** e la migliore per NexusOne:
- Il droplet ha gia 3.8 GB RAM, Redis usa ~30 MB
- Nessun limite di query
- Latenza zero (localhost vs HTTPS a Upstash)
- Il cron tick diventa molto piu veloce
- Backup con redis-cli SAVE + cron giornaliero

## PM2 status attuale

| Processo | Stato | RAM | Note |
|---|---|---|---|
| nexus-web | ONLINE | 55 MB | Serve UI e API |
| nexus-cron | **STOPPED** | - | Fermato per quota Redis |
| aic-btc | ONLINE | 386 MB | Legacy AIC — non usato da NexusOne |
| aic-eth | ONLINE | 383 MB | Legacy AIC — non usato da NexusOne |
| aic-sol | ONLINE | 385 MB | Legacy AIC — non usato da NexusOne |

**Nota**: i 3 processi AIC usano 1.1 GB di RAM e sono legacy. Fermarli libererebbe RAM per Redis locale + headroom.
