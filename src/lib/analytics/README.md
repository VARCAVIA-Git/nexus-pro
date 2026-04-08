# analytics/

Il cervello unificato di Nexus Pro: ogni asset è gestito da un'`AssetAnalytic`
persistente che orchestra percezione, cognizione, azione e apprendimento.

- `asset-analytic.ts` — entità principale per asset (orchestratore)
- `analytic-registry.ts` — singleton: getAnalytic, listAnalytics, spawn
- `analytic-loop.ts` — osservazione live integrata nel cron tick
- `analytic-queue.ts` — coda Redis sequenziale per training pesanti
- `types.ts` — interfacce TypeScript condivise
- `perception/` — sensi: MTF, news, calendario, regime
- `cognition/` — cervello: master signal, strategie, smart timing
- `action/` — mani: risk, position manager, live runner, mine manager
- `learning/` — auto-miglioramento: outcome tracker, adaptive weights
