# NexusOne — Istruzioni per Claude Code

## Progetto

NexusOne e un **sistema di trading algoritmico autonomo e disciplinato**. Non e discovery-driven. Non cerca pattern casuali. Valida ipotesi in modo rigoroso e trada solo edge reali dimostrati.

**Stack**: Next.js 14, TypeScript, Tailwind, Upstash Redis, Supabase, Alpaca API (paper + live), Binance (funding data).

## Architettura

```
Market Data (Alpaca bars + Binance funding)
  → Signal Engine (valuta SOLO strategia attiva nel registry)
  → Execution Engine (maker-first, fill tracking)
  → Risk Engine (kill switch, daily loss cap)
  → Evaluation Engine (drift detection, GO/NO-GO)
```

Core: `src/lib/nexusone/` (8 file)
Legacy: `src/lib/_legacy/` (archiviato, non usato dal runtime)

## Stato attuale (2026-04-15)

### NexusOne core: IMPLEMENTATO
- Strategy Registry: una strategia attiva alla volta, versioned, frozen
- S1 (BTC/USD short funding): manifest completo, funding via Binance
- Signal Engine: valuta solo la strategia registrata
- Execution Engine: maker-first, fill monitoring, lifecycle
- Risk Engine: kill switch, daily/weekly loss, consecutive losses
- Evaluation Engine: drift detection, auto-disable

### Cron Worker: PULITO
```
Fast tick (30s): /api/nexusone/tick (signal + execution)
Slow tick (60s): /api/health (health check)
Legacy ticks: TUTTI DISABILITATI
```

### Modalita sistema
- `disabled` (default) — nessun trading
- `paper` — paper trading via Alpaca Paper API
- `live_guarded` — live micro-capitale con limiti stretti

### Infrastruttura
- **Droplet**: 167.172.229.159 (DigitalOcean, user: nexus)
- **PM2**: nexus-web (porta 3000) + nexus-cron
- **Redis**: Upstash (free tier, ~10k cmd/giorno)
- **Database**: Supabase

### Broker
- Paper: Alpaca Paper (keys in .env.local)
- Live: Alpaca Live (keys in .env.local)

## Documentazione

| Documento | Contenuto |
|---|---|
| `docs/nexusone/ARCHITECTURE.md` | Design sistema |
| `docs/nexusone/STRATEGY_REGISTRY.md` | Catalogo strategie |
| `docs/nexusone/RISK_RULES.md` | Regole rischio |
| `docs/nexusone/RESEARCH_RULES.md` | Regole ricerca e validazione |
| `docs/nexusone/EXECUTION_RULES.md` | Regole esecuzione |
| `docs/nexusone/DATA_PLAN.md` | Fonti dati e quality checks |
| `docs/nexusone/REBUILD_PLAN.md` | Piano di completamento |

## Regole operative

1. **NexusOne only**: il vecchio sistema (analytics, mine, research) e in `_legacy/` e non va usato
2. **Registry first**: nessuna strategia va live senza essere nel registry
3. **No discovery live**: la ricerca avviene offline, non nel loop di trading
4. **Cost model sempre**: ogni backtest include commissioni, slippage, spread
5. **Test**: `pnpm test:run && pnpm build` prima di ogni commit
6. **Lingua**: Codice in inglese, UI in italiano
7. **Deploy**: `git push` → SSH droplet → `git pull && pnpm build && pm2 restart`

## Vincoli

- Upstash Redis: free tier, ~10k cmd/giorno
- Alpaca: 200 req/min
- Binance public: 2400 req/min (no auth)
- Droplet: 3.8GB RAM, 2GB swap
- Cron tick: 30s, deve completare in <25s

## Comandi

```bash
pnpm test:run        # Tests
pnpm build           # Production build
pnpm dev             # Dev server
ssh root@167.172.229.159 "su - nexus -c 'pm2 status'"
```
