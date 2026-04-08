# SPEC TECNICA — STRATEGY V2 + MINE

> Spec di riferimento per la nuova entità `Strategy` e per il modello di esecuzione a mine.

## 1. Differenza chiave rispetto al vecchio `MultiBotConfig`

| Vecchio Bot (`MultiBotConfig`) | Nuovo `Strategy` |
|---|---|
| Sa di mercato per conto suo | Chiede tutto all'AI Analytic |
| TP/SL configurati a mano | TP/SL derivati dalle stat dell'asset |
| Apre al market sul segnale | Piazza mine con TTL |
| Bot generico per asset | Strategy specifica con AI Analytic vincolata |
| 1 bot = 1 entità | 1 Strategy = N mine attive |
| Riassorbe lo studio ad ogni tick | Lo studio è già fatto dall'AI Analytic |

## 2. Interfaccia TypeScript

```ts
// src/lib/analytics/types.ts (estensione)

export type AggressivenessLevel = 'conservative' | 'balanced' | 'aggressive';

export type StrategyStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error';

export interface StrategyV2 {
  id: string;
  name: string;
  ownerId: string;
  mode: 'demo' | 'real';
  status: StrategyStatus;
  
  // Capitale
  capitalAllocation: {
    type: 'percent' | 'fixed';
    value: number;                    // % o $ assoluti
  };
  
  // Asset operativi (devono avere AI Analytic in 'ready')
  symbols: string[];
  
  // Aggressività determina filtri e numero mine
  aggressiveness: AggressivenessLevel;
  
  // Vincoli runtime (hardcoded in risk.ts, non configurabili)
  // - max 5 mine pending per strategy
  // - capitale per mina = allocation / activeMineCount
  
  createdAt: number;
  startedAt: number | null;
  lastTickAt: number | null;
  
  // Stato runtime
  activeMines: string[];              // ID delle mine attive
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  currentEquity: number;
}

export interface Mine {
  id: string;
  strategyId: string;
  symbol: string;
  
  // Trigger
  side: 'buy' | 'sell';
  triggerPrice: number;               // limit price
  triggerType: 'limit' | 'stop';
  
  // Sizing
  quantity: number;
  notional: number;                   // $ allocati
  
  // TP/SL derivati dall'AI Analytic
  takeProfit: number;
  stopLoss: number;
  expectedRR: number;                 // risk/reward ratio
  
  // Provenienza
  sourceRule: string;                 // ID della MinedRule che l'ha generata
  sourceZone: number | null;          // priceLevel della reaction zone
  confidence: number;                 // 0-100
  
  // Lifecycle
  createdAt: number;
  expiresAt: number;                  // timestamp scadenza TTL
  status: 'pending' | 'triggered' | 'expired' | 'cancelled' | 'closed_win' | 'closed_loss';
  
  // Broker tracking
  brokerOrderId: string | null;
  brokerTpOrderId: string | null;
  brokerSlOrderId: string | null;
  
  // Risultato (a chiusura)
  closedAt: number | null;
  fillPrice: number | null;
  exitPrice: number | null;
  realizedPnl: number | null;
}
```

## 3. Aggressività: tre profili

| Aggressività | Min confidence regola | Max mine per tick | Direzioni |
|---|---|---|---|
| Conservative | 75 | 1 | Solo long o solo short, mai entrambe |
| Balanced | 65 | 3 | Long o short, una direzione per tick |
| Aggressive | 60 | 5 | Long e short contemporanei (hedge) |

In aggiunta:

- Conservative usa solo regole con `occurrences >= 50`.
- Balanced richiede `occurrences >= 25`.
- Aggressive accetta `occurrences >= 15`.

## 4. Calcolo TP/SL automatico

Per ogni mina, dato `MinedRule` selezionata e prezzo trigger:

```
TP = triggerPrice + (rule.avgWin × 0.7)        // 70% del movimento medio storico
SL = triggerPrice - (rule.avgLoss × 1.0)       // pieno SL osservato
```

(per short, segni invertiti)

Vincolo: `expectedRR = (TP - trigger) / (trigger - SL) >= 1.2`. Se non rispetta, la mina viene scartata.

## 5. TTL ereditato dal timeframe

| Timeframe AI Analytic | TTL mine | Refresh frequency |
|---|---|---|
| 15m | 2 ore | Tick ogni 60s |
| 1h | 6 ore | Tick ogni 60s |
| 4h | 24 ore | Tick ogni 60s |
| 1d | 3 giorni | Tick ogni 60s |

Default per Strategy se non specificato: usa il `recommendedTimeframe` dell'AI Analytic dell'asset.

## 6. Capital allocation rule

```
capitalePerStrategia = totalEquity × (strategy.capitalAllocation.value / 100)
capitalePerMina = capitalePerStrategia / max(activeMines.length + newMines.length, 1)
```

Quando una mina scatta o scade, le altre si **riequilibrano** automaticamente al tick successivo.

## 7. Tick loop di una Strategy (single tick)

```
ogni 60s, per ogni Strategy in 'running':
  1. CHECK PRECONDIZIONI
     - circuit breaker globale attivo? → skip
     - mode demo/real broker connesso? → skip se no
  
  2. AGGIORNA STATO MINE ESISTENTI
     - per ogni mina attiva:
       - se brokerOrder filled → status='triggered', piazza TP/SL bracket
       - se TP/SL filled → status='closed_win'/'closed_loss', registra outcome
       - se expiresAt < now AND status='pending' → cancel su broker, status='expired'
  
  3. CONSULTA AI ANALYTIC
     - per ogni symbol in strategy.symbols:
       - fetch reactionZones live (`/api/analytics/{symbol}/zones`)
       - filtra zone entro ±2% dal prezzo corrente
       - per ogni zona, costruisci candidate Mine (rule+trigger+TP+SL)
  
  4. FILTRA per aggressività
     - applica min confidence + min occurrences
     - calcola expectedRR, scarta < 1.2
  
  5. PIAZZA NUOVE MINE
     - rispetta cap max 5 mine pending per strategy
     - ricalcola capitale per mina (riequilibrio)
     - per ogni candidate accettata: place limit order su Alpaca con TTL
     - registra in Redis nexus:strategy:{id}:mines
  
  6. UPDATE STATS
     - lastTickAt, activeMines, currentEquity
     - notifica in-app eventi rilevanti (mina scattata, trade chiuso)
```

## 8. Hard limits (in `analytics/action/risk.ts`)

```ts
export const STRATEGY_LIMITS = {
  MAX_PENDING_MINES_PER_STRATEGY: 5,
  MIN_RR_RATIO: 1.2,
  MAX_NOTIONAL_PER_MINE_PCT: 25,        // max 25% del capitale strategy in una sola mina
  CIRCUIT_BREAKER_DAILY_PCT: -3,
  CIRCUIT_BREAKER_WEEKLY_PCT: -5,
  CIRCUIT_BREAKER_TOTAL_PCT: -15,
  MAX_STRATEGIES_PER_USER: 20,
  MIN_TIME_BETWEEN_MINES_SAME_ZONE_MS: 5 * 60 * 1000,  // 5 min anti-spam
};
```

## 9. Schema chiavi Redis

```
nexus:strategy:{id}                    JSON  StrategyV2
nexus:strategy:list:{userId}           SET   IDs strategy dell'utente
nexus:strategy:{id}:mines              HASH  mineId → Mine
nexus:strategy:{id}:trades             LIST  trade chiusi (history)
nexus:strategy:{id}:equity-curve       LIST  snapshot equity ogni tick
```

## 10. API HTTP

```
GET    /api/strategy                       lista strategy utente
POST   /api/strategy                       crea
GET    /api/strategy/[id]                  dettaglio + mine attive
PATCH  /api/strategy/[id]                  modifica (pause/resume/stop)
DELETE /api/strategy/[id]                  elimina (chiude tutte le mine)
GET    /api/strategy/[id]/mines            mine pending + history
GET    /api/strategy/[id]/equity           equity curve
POST   /api/strategy/[id]/start            start
POST   /api/strategy/[id]/stop             stop (cancella mine pending)
```

## 11. Migrazione dai vecchi bot

1. I `MultiBotConfig` esistenti restano leggibili in Redis ma marcati `legacy`.
2. Pagina `/strategy` mostra una sezione "Bot legacy" con bottone "Converti in Strategy V2".
3. La conversione: prende `bot.assets[0]`, crea AI Analytic se manca, accoda training, crea `StrategyV2` con stessi parametri di capitale e modalità.
4. I bot legacy non possono più essere avviati. Solo letti in sola lettura per audit.

## 12. UI: nuova pagina `/strategy` (V2)

- Lista Strategy con stato live (running/paused/stopped, equity, P&L oggi, mine attive).
- Bottone "Nuova Strategy" → wizard 4 step:
  1. Nome + modalità (demo/real).
  2. Selezione asset (mostra solo quelli con AI Analytic `ready`; quelli senza hanno bottone "Vai ad assegnare AI Analytic").
  3. Capitale (slider % o input fisso) + aggressività (3 card cliccabili con descrizione).
  4. Riepilogo + Avvia.
- Drill-down `/strategy/[id]`: equity curve, mine pending live, history trade, log decisioni.

## 13. Test minimi richiesti

- `tests/unit/strategy-v2/lifecycle.test.ts` — crea, start, pause, stop, delete.
- `tests/unit/strategy-v2/mine-placement.test.ts` — calcolo mine da AnalyticReport mock, rispetto cap.
- `tests/unit/strategy-v2/risk-limits.test.ts` — circuit breaker, min RR, max notional.
- `tests/unit/strategy-v2/ttl-expiry.test.ts` — mine scadono e vengono cancellate.
