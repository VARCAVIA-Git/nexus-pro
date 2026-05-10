# Real Money Machine — Roadmap onesta (2026-05-10)

> Un documento per separare quello che è realistico da quello che è hype.

## Premessa onesta

**La "macchina da soldi" passiva non esiste**, almeno non per trading sistematico retail. Quello che si può costruire realisticamente è:

- Un **yield enhancement** sul tuo capitale (target 8-15% APR netto)
- Una **fonte di reddito secondaria** modesta (€3-15K/anno con capitale 50-150K)
- Un **diversificatore** non correlato a stipendio/business principale
- Una **piattaforma di apprendimento** quant che si paga da sola

**Quello che NON è realistico:**
- ❌ €30K+/anno netti senza un capitale di €300K+ già investito
- ❌ Sharpe sostenuto >2 retail (top fund mondiali fanno 1.5-2.5)
- ❌ Ritorni passivi senza monitoraggio attivo
- ❌ "Doppia il capitale in un anno" — implica DD 50%+ e probabilità rovina alta

## Matematica brutale del "vivere di trading"

Per €30K netti/anno (vivibile in Italia):

| APR realistico netto | Capitale richiesto | Tempo per accumulare partendo da €10K |
|---|---|---|
| 5% (conservativo) | **€810K** | 30-40 anni reinvestendo |
| 10% (buono) | **€405K** | 15-20 anni |
| 20% (eccezionale, raro sostenibile) | **€200K** | 8-12 anni |
| 50% (Sharpe 3+, irrealistico) | €80K | 4 anni |

**Conclusione**: per "vivere di trading" servono **anni di accumulazione** + **capitale che non hai**. Più realistico: trading come *amplifier* del tuo reddito principale.

## Architettura proposta — Portfolio multi-strategy

Una singola strategia muore o si arbitraggia. Una macchina credibile ha **3-5 strategie uncorrelated**.

### Strategy Layer

| Strategia | Status | APR target | Sharpe target | DD max | Capital min |
|---|---|---:|---:|---:|---:|
| **NexusOne v3** (momentum/breakout) | 🟡 paper 6/30g | 5-15% | 0.8-1.5 | 10% | €5K |
| **Funding-carry** (delta-neutral) | 🔴 research done | 2-8% | 1.0-2.0 | 3% | €20K |
| **Mean-reversion intraday** (RSI extremes) | ⚫ to research | 8-20% | 0.7-1.2 | 15% | €5K |
| **Cross-exchange arbitrage** (taker/maker) | ⚫ to research | 5-12% | 1.5-2.5 | 2% | €30K |
| **Stablecoin yield** (Curve/AAVE managed) | ⚫ to research | 4-8% | 3-5 | 1% | €5K |

**Note**:
- Solo NexusOne ha codice funzionante
- Funding-carry richiede esecuzione cross-exchange (perp + spot)
- Arbitrage richiede infrastruttura latency-aware
- DeFi yield è il più stabile ma sensibile a smart contract risk

### Capital allocation framework

Kelly fractional con tetti:
- Max 40% del portfolio in qualsiasi singola strategia
- Min 5% in strategie attive
- Re-balance mensile
- Daily VaR cap su portfolio: 2%

### Risk overlay

- **Daily loss limit**: -1.5% portfolio → halt per 24h
- **Weekly DD**: -5% → halt + investigate
- **Correlation breaker**: se 30g rolling correlation media >0.7 → ridurre exposure
- **Kill switch globale**: -10% DD → liquida tutto

## Timeline 3 anni — milestones realistici

### Anno 1 (2026-05 → 2027-05): **Validation phase**
**Capitale al rischio: €500-2000 (live micro)**

| Mese | Milestone | Decisione |
|---|---|---|
| 1-2 (in corso) | NexusOne v3 paper 30g | PASS/FAIL → continua o ferma |
| 2-3 | Funding-carry dataset completo (compra storia 2 anni) | Edge sostenibile? |
| 3-4 | NexusOne live micro €500-1000 se PASS paper | Slippage reale? |
| 5-6 | Funding-carry shadow trade BNB regime €500 | Costi reali confermati? |
| 7-9 | Mean-reversion research + backtest | Edge significativo? |
| 10-12 | Live combinato 2 strategie €2K | Sharpe portfolio >1? |

**Verdict point Dec 2027**: Se Sharpe portfolio reale >1 e DD <8%, continua. Altrimenti, **ferma** e accetta che trading non è per te.

**Atteso anno 1**: -€200 a +€300. Aspettative break-even.

### Anno 2 (2027-05 → 2028-05): **Scale phase 1**
**Capitale al rischio: €5K-20K**

- Scale strategie validate
- Aggiungi 3a strategia se anno 1 OK
- Setup tax compliance Italia (regime amministrato vs dichiarativo)
- Hardware: backup droplet, redundant exchange APIs, monitoring 24/7

**Atteso anno 2**: +€500 a +€2500. 5-15% del capitale.

### Anno 3 (2028-05 → 2029-05): **Decision point**
**Capitale al rischio: €30K-100K (se prima fase ha tenuto)**

- Se Sharpe portfolio reale ≥1 sostenuto 18 mesi → scale aggressive
- Se non ha tenuto → ridimensiona, mantieni come hobby

**Atteso anno 3**: 
- Caso ottimista: +€10K-20K (vivibile come reddito secondario)
- Caso realistico: +€2-8K
- Caso pessimista: break-even, tempo speso = costo

## Punti di NO-GO espliciti (importante!)

**Stop tutto se:**

1. **DD portfolio >15%** in qualsiasi punto live → ferma 30g, retrospettiva, decidi se ricominciare
2. **Sharpe rolling 90g < 0.3** → strategia probabilmente decoded → cambia o ferma
3. **3 strategie consecutive falliscono validation** → forse il problema sei tu come ricercatore, non le strategie
4. **Tempo > 20h/settimana** per >3 mesi senza profitti compensativi → costo opportunità negativo
5. **Edge originale (NexusOne PASS) si rivela falso in live** → blow-up dello stack di assunzioni → review totale

## Alternative se trading non rende

Onesto: la maggior parte dei retail quant **non genera reddito significativo**. Se dopo anno 2 il sistema non rende, alternative:

1. **Yield DeFi stablecoin gestito** (4-8% netto, basso rischio) — semplice, scala con capitale
2. **Index investing + leverage modesto** — Sharpe 0.4-0.6 ma scalabile e tax-efficient
3. **Sell the skills**: code-as-a-service, costruisci sistemi per altri (broker quant, fondi piccoli)
4. **Education products**: corso/community sui learning della tua ricerca
5. **Quant consulting**: lavora come consultant per fondi piccoli

Punto cruciale: **il valore del progetto NexusOne è la skill che acquisisci, non i €/giorno che genera**.

## Infrastruttura tecnica per la macchina (già parzialmente costruita)

- ✅ **Droplet DigitalOcean** 167.172.229.159 — 24/7 reale
- ✅ **PM2 + systemd** autostart on reboot
- ✅ **Atomic writes** + watchdog cron 5min
- ✅ **Equity snapshots CSV** per analisi rigorosa
- ✅ **Dashboard pubblica** monitoring
- 🟡 **Discord webhook** — manca URL (5 min di setup)
- ⚫ **Multi-exchange execution layer** — non c'è
- ⚫ **Tax reporting automatizzato** — non c'è
- ⚫ **Risk engine portfolio-level** — solo per-strategy ora
- ⚫ **Backup state encrypted** — non c'è (solo PM2 dump)

## Allocation budget tempo

Per non rovinarti la vita:
- Max 10h/settimana **operations + monitoring** (lascia girare)
- Max 5h/settimana **ricerca attiva** (nuove strategie, refinement)
- Max 2h/settimana **dashboard/check** (basta!)
- 1 review profonda al mese: 3-4h
- 1 weekend offline al mese

Trading sistematico **non** è "guardare grafici". Se ti ritrovi a controllare 10×/giorno, sbagliato.

## Conclusione

NexusOne v3 sta paper-running con metriche oneste. Funding-carry da solo non è la risposta. **Combinati + altre 1-2 strategie + 12 mesi di validation paziente = la sola via realistica** verso un sistema che dia ritorni significativi.

**Non aspettarti soldi prima di metà 2027.** Pianifica come hobby strategico che potrebbe diventare reddito secondario in 2-3 anni.

Se questo orizzonte temporale non ti sta bene, **investi quel tempo nel tuo business principale**. Il rendimento è quasi certamente migliore.

---

*Documento da rivedere ogni 90 giorni. Prossima revisione: 2026-08-10.*
