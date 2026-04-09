# ⚠️ PHASE 4 — UPDATE 001: AIC Integration + Feedback Loop

**Data**: 2026-04-09
**Leggi PRIMA di continuare qualsiasi step.**
**Questo aggiornamento modifica l'architettura di Phase 4.**

---

## Cosa è cambiato

È stato deciso di integrare un sistema Python chiamato **Asset Intelligence Core (AIC)** come microservizio sidecar. AIC è un motore analitico molto più potente della pipeline TypeScript attuale — 80+ indicatori, XGBoost ML, Optuna optimizer, regime detection, research agent con dati on-chain.

### Impatto sui tuoi step:

| Step | Stato | Cambiamento |
|------|-------|-------------|
| Step 1: Types + Utils | ✅ Invariato | Aggiungi i nuovi tipi per AIC signal |
| Step 2: Mine Store | ✅ Invariato | Aggiungi signal scorecard storage |
| Step 3: Execution Layer | ✅ Invariato | Nessun cambiamento |
| Step 4: Signal Detector | ⚠️ **SOSTITUITO** | Diventa **AIC Client** — wrapper HTTP |
| Step 5: Decision Engine | ⚠️ Modificato | Usa AIC signals + regime come input |
| Step 6: Mine Tick | ⚠️ Modificato | Integra AIC Client nel flusso |
| Step 7: API Routes | ⚠️ Modificato | Aggiungi endpoint feedback + scorecard |
| Step 8: Cron Integration | ✅ Invariato | Nessun cambiamento |
| Step 9: Feedback Loop | ⚠️ **ESTESO** | Bidirezionale: Mine → AIC |
| Step 10-11: UI | ⚠️ Modificato | Mostra regime, confluence, scorecard |
| Step 12-13: Test + Deploy | ✅ Invariato | Nessun cambiamento |

---

## Nuovi tipi da aggiungere a `src/lib/mine/types.ts`

```typescript
// ── AIC Signal (dal microservizio Python) ──────────────────────────

/** Canonical signal format from AIC */
interface AICSignal {
  action: 'LONG' | 'SHORT';
  entry: number;
  TP: number[];              // [tp1, tp2, tp3]
  SL: number;
  timeout_minutes: number;
  confidence: number;         // 0-1
  'expected_profit_%': number;
  setup_name: string;         // e.g. "RSI_MACD_Volume_4h"
  expires_at?: string;
  // Extra fields from enriched response
  win_rate?: number;
  profit_factor?: number;
  sharpe?: number;
  avg_rr?: number;
  confluence_score?: number;
}

/** AIC system status */
interface AICStatus {
  status: 'online' | 'offline';
  symbol: string;
  price: number;
  confluence: AICConfluence;
  active_tfs: string[];
  ts: string;
}

/** Multi-TF confluence from AIC */
interface AICConfluence {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;              // 0-1
  bull_score: number;
  bear_score: number;
  bullish_tfs: string[];
  bearish_tfs: string[];
  neutral_tfs: string[];
  aligned_count: number;
  tf_biases: Record<string, string>;
}

/** Market regime from AIC ML engine */
type MarketRegime = 'BULL' | 'BEAR' | 'CHOP' | 'ACCUMULATION' | 'DISTRIBUTION';

interface AICResearch {
  funding_rate_current: number;
  funding_sentiment: 'LONG_CROWDED' | 'SHORT_CROWDED' | 'NEUTRAL';
  open_interest: number;
  fear_greed_index: number;
  fear_greed_label: string;
  news_sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  total_liquidations_24h_usd: number;
  ai_summary?: string;
}

// ── Signal Scorecard ──────────────────────────────────────────────

/** Tracks real performance of each setup */
interface SetupScorecard {
  setup_name: string;          // e.g. "RSI_MACD_Volume_4h"
  symbol: string;
  total_signals: number;
  total_executed: number;
  wins: number;
  losses: number;
  timeouts: number;
  real_win_rate: number;       // actual, not backtested
  real_profit_factor: number;
  avg_pnl_pct: number;
  avg_confidence: number;      // avg confidence of signals
  confidence_accuracy: number; // how calibrated is confidence
  last_updated: string;
  last_10_outcomes: MineOutcome[];
}

// ── Updated Mine interface — add AIC fields ──────────────────────

// ADD these fields to the existing Mine interface:
//   aic_signal?: AICSignal;           // original signal from AIC
//   aic_setup_name?: string;          // for scorecard tracking
//   aic_confidence?: number;          // original confidence
//   regime_at_entry?: MarketRegime;   // regime when mine opened
//   confluence_at_entry?: number;     // confluence score when opened
```

---

## Step 4 NUOVO: AIC Client (sostituisce Signal Detector)

**File da creare:**
- `src/lib/mine/aic-client.ts`
- `src/lib/mine/__tests__/aic-client.test.ts`

```typescript
// File: src/lib/mine/aic-client.ts
//
// HTTP client per comunicare con Asset Intelligence Core.
// AIC gira come servizio separato su AIC_BASE_URL (default: http://localhost:8080)
//
// ENV VARS:
//   AIC_BASE_URL=http://localhost:8080   (o http://aic:8080 in Docker)
//   AIC_SECRET_TOKEN=                    (opzionale, per autenticazione)
//
// IMPORTANTE:
// - Timeout 5s per ogni chiamata — il mine-tick deve completare in <10s
// - Se AIC è offline, ritorna null/empty — il Mine Engine NON apre mine senza AIC
// - Cache locale del confluence per 30s (evita chiamate duplicate nello stesso tick)
// - Log ogni chiamata per debug

interface AICClientConfig {
  baseUrl: string;
  secretToken?: string;
  timeoutMs: number;     // default 5000
}

class AICClient {
  // GET /signals/latest → AICSignal | null
  async getLatestSignal(): Promise<AICSignal | null>;

  // GET /signals → AICSignal[]
  async getActiveSignals(): Promise<AICSignal[]>;

  // GET /confluence → AICConfluence
  async getConfluence(): Promise<AICConfluence | null>;

  // GET /analysis?tf=4h → indicator snapshot per timeframe
  async getAnalysis(tf: string): Promise<Record<string, any> | null>;

  // GET /research → AICResearch
  async getResearch(): Promise<AICResearch | null>;

  // GET /status → AICStatus
  async getStatus(): Promise<AICStatus | null>;

  // POST /feedback → invia outcome di una mine chiusa ad AIC
  async sendFeedback(outcome: TradeOutcome): Promise<boolean>;

  // Utility: AIC è online e funzionante?
  async isHealthy(): Promise<boolean>;
}
```

**Logica chiave:**
1. Ogni metodo ha try/catch — se AIC è down, ritorna null, non crasha
2. `isHealthy()` viene chiamato all'inizio di ogni mine-tick
3. Se AIC non è healthy, il mine-tick logga warning e monitora solo le mine aperte (non ne apre di nuove)
4. Il `sendFeedback()` viene chiamato ogni volta che una mine si chiude — è il ponte del feedback loop

**Test:** mock HTTP responses, test fallback quando AIC è offline, test timeout handling.

---

## Step 5 AGGIORNATO: Decision Engine con regime awareness

Il Decision Engine ora riceve anche il **regime** e il **confluence** da AIC. Questo cambia la logica:

```typescript
// AGGIUNTE alla logica del Decision Engine:

// 1. REGIME GATE — prima di tutto
//    - Se regime === 'CHOP' → riduci confidence del 30% (mercato laterale = trappole)
//    - Se regime === 'ACCUMULATION' → accetta solo LONG
//    - Se regime === 'DISTRIBUTION' → accetta solo SHORT
//    - Se regime === 'BULL' → bonus +10% confidence per LONG
//    - Se regime === 'BEAR' → bonus +10% confidence per SHORT

// 2. CONFLUENCE GATE
//    - Se confluence.score < 0.5 → riduci confidence del 20%
//    - Se confluence.bias contraddice il segnale → scarta

// 3. RESEARCH GATE
//    - Se funding_sentiment === 'LONG_CROWDED' e segnale è LONG → warning, riduci confidence 15%
//    - Se fear_greed_index > 80 (extreme greed) → riduci confidence 10% per LONG
//    - Se fear_greed_index < 20 (extreme fear) → riduci confidence 10% per SHORT
//    - Se evento macro high-impact nelle prossime 2h → NON aprire mine (già nel vecchio design)

// 4. SCORECARD GATE (nuovo!)
//    - Recupera scorecard per questo setup_name + symbol
//    - Se real_win_rate < 40% con almeno 20 trade → SCARTA il setup
//    - Se confidence_accuracy < 0.5 → ricalibra confidence usando real_win_rate
//    - Se ultimi 5 outcome sono tutti loss → SCARTA (losing streak protection)
```

---

## Step 9 ESTESO: Feedback Loop bidirezionale

**File aggiornati:**
- `src/lib/mine/feedback.ts` — ora include scorecard + AIC feedback

```typescript
// File: src/lib/mine/feedback.ts

// Quando una mine si chiude:
async function processMineClose(mine: Mine, exitPrice: number, outcome: MineOutcome): Promise<void> {
  // 1. Calcola TradeOutcome (già nel vecchio design)
  const tradeOutcome: TradeOutcome = { /* ... */ };

  // 2. Salva in Redis (già nel vecchio design)
  await saveFeedback(mine.symbol, tradeOutcome);

  // 3. NUOVO: Aggiorna signal scorecard
  if (mine.aic_setup_name) {
    await updateScorecard(mine.symbol, mine.aic_setup_name, tradeOutcome);
  }

  // 4. NUOVO: Invia feedback ad AIC via HTTP
  const aicClient = new AICClient();
  await aicClient.sendFeedback(tradeOutcome);
}

// Scorecard update logic:
async function updateScorecard(
  symbol: string,
  setupName: string,
  outcome: TradeOutcome
): Promise<void> {
  // Redis key: nexus:scorecard:{symbol}:{setup_name}
  // Recupera scorecard esistente o crea nuova
  // Incrementa counters (wins, losses, timeouts)
  // Ricalcola real_win_rate, real_profit_factor, avg_pnl_pct
  // Calcola confidence_accuracy:
  //   = 1 - abs(avg_confidence - real_win_rate)
  //   (se confidence media è 0.75 e win rate reale è 0.70, accuracy = 0.95)
  // Aggiorna last_10_outcomes (sliding window)
  // Salva
}
```

**Redis keys nuove:**
```
nexus:scorecard:{symbol}:{setup_name}  → JSON SetupScorecard
nexus:scorecards:{symbol}              → Set<setup_name>  (indice)
```

---

## Nuovi API Routes

```
# AIC proxy (per UI — evita CORS)
GET  /api/aic/status          → proxy a AIC /status
GET  /api/aic/confluence      → proxy a AIC /confluence
GET  /api/aic/research        → proxy a AIC /research

# Scorecard
GET  /api/scorecard/[symbol]          → SetupScorecard[] per asset
GET  /api/scorecard/[symbol]/[setup]  → singola scorecard
GET  /api/scorecard/compare           → confronto cross-asset
```

---

## UI aggiornamenti

### Pagina /mines — aggiungi:
- Badge regime corrente (BULL 🟢 / BEAR 🔴 / CHOP 🟡 / ACC ⬆️ / DIST ⬇️)
- Confluence score bar (0-100%)
- Per ogni mine: mostra setup_name, confidence originale, regime at entry

### Nuova sezione in /mines — Signal Scorecard:
- Tabella setup × performance reale
- Colonne: Setup, Trades, Win Rate reale, PF reale, Avg PnL, Confidence accuracy
- Highlight rosso per setup con win rate < 50%
- Highlight verde per setup con confidence accuracy > 0.8
- Filtro per asset

### Pagina /portfolio — aggiungi:
- Research snapshot (funding, fear/greed, AI summary)
- Regime timeline (storico regime ultimi 7 giorni)

### Pagina /impostazioni — aggiungi:
- AIC Status indicator (online/offline con latency)
- AIC Base URL config (per development)

---

## Come applicare questo update

Se hai già completato degli step:

**Se sei a Step 1-3**: Aggiungi i nuovi tipi a `types.ts`, aggiungi scorecard storage a mine-store. Poi continua con lo Step 4 NUOVO (AIC Client al posto di Signal Detector).

**Se sei a Step 4 (Signal Detector)**: FERMATI. Cancella `signal-detector.ts` se l'hai già creato. Creane uno nuovo: `aic-client.ts` come descritto sopra. Il Signal Detector TypeScript non serve più — AIC fa quel lavoro molto meglio.

**Se sei oltre Step 4**: Adatta il Decision Engine e il Mine Tick per usare AIC Client invece di Signal Detector. Aggiungi il regime gate e gli altri gate al Decision Engine.

---

## Testing con AIC offline

Siccome AIC è un servizio separato che potrebbe non essere attivo durante lo sviluppo:

1. **Mock AIC nelle test**: crea `src/lib/mine/__tests__/mocks/aic-responses.ts` con risposte mock per ogni endpoint
2. **Fallback mode**: se AIC è offline, il Mine Engine:
   - Monitora le mine aperte normalmente (TP/SL/trailing/timeout)
   - NON apre nuove mine
   - Logga `[MINE-TICK] AIC offline — monitoring only`
3. **Per test manuali**: puoi creare un mock server con un semplice file:

```typescript
// scripts/mock-aic-server.ts — da lanciare con: npx tsx scripts/mock-aic-server.ts
import { createServer } from 'http';

const MOCK_SIGNAL = {
  action: "LONG",
  entry: 68420.50,
  TP: [69100, 70250, 72000],
  SL: 67300.00,
  timeout_minutes: 45,
  confidence: 0.81,
  "expected_profit_%": 2.65,
  setup_name: "RSI_MACD_Volume_4h",
};

const MOCK_CONFLUENCE = {
  bias: "BULLISH",
  score: 0.78,
  bull_score: 0.65,
  bear_score: 0.2,
  bullish_tfs: ["1h", "4h", "1d"],
  bearish_tfs: ["15m"],
  neutral_tfs: ["5m", "30m"],
  aligned_count: 3,
  tf_biases: { "15m": "BEARISH", "1h": "BULLISH", "4h": "BULLISH", "1d": "BULLISH" },
};

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/status') {
    res.end(JSON.stringify({ status: 'online', symbol: 'BTC/USDT', price: 68420.50, confluence: MOCK_CONFLUENCE, active_tfs: ['1m','5m','15m','1h','4h','1d'], ts: new Date().toISOString() }));
  } else if (req.url === '/signals/latest') {
    res.end(JSON.stringify(MOCK_SIGNAL));
  } else if (req.url === '/signals') {
    res.end(JSON.stringify([MOCK_SIGNAL]));
  } else if (req.url === '/confluence') {
    res.end(JSON.stringify(MOCK_CONFLUENCE));
  } else if (req.url === '/research') {
    res.end(JSON.stringify({ funding_rate_current: 0.012, funding_sentiment: 'NEUTRAL', open_interest: 45000, fear_greed_index: 62, fear_greed_label: 'Greed', news_sentiment: 'BULLISH', total_liquidations_24h_usd: 125000000 }));
  } else if (req.url?.startsWith('/feedback') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { console.log('[FEEDBACK]', body); res.end(JSON.stringify({ ok: true })); });
    return;
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(8080, () => console.log('Mock AIC running on http://localhost:8080'));
```
