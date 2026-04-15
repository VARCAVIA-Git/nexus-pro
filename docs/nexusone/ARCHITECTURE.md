# NexusOne — Architecture

## Modules

```
src/lib/nexusone/
├── types.ts                    Core types (signal, order, trade, drift)
├── strategy-registry.ts        Strategy catalog + system mode
├── signal-engine.ts            Signal evaluation from registry only
├── execution-engine.ts         Maker-first orders + trade lifecycle
├── risk-engine.ts              Kill switches + position sizing
├── evaluation-engine.ts        Drift detection + GO/NO-GO
├── worker-tick.ts              Main tick (30s) orchestrator
├── strategies/
│   └── s1.ts                   S1 manifest + features + trigger
└── data/
    └── (future: OKX adapter)

src/app/api/nexusone/
├── tick/route.ts               Cron endpoint (30s)
├── status/route.ts             System status API
└── emergency-stop/route.ts     Kill switch API
```

## Data Flow

```
Market Data (Alpaca/OKX)
  ↓ every 30s
Signal Engine
  ↓ evaluates S1 features
  ↓ checks trigger conditions
  ↓ if triggered → SignalEvent
Execution Engine
  ↓ risk check
  ↓ place order (maker-first)
  ↓ monitor fill/expire
  ↓ manage open trade (hold_bars exit)
  ↓ close → TradeResult
Evaluation Engine
  ↓ every 15min
  ↓ compare real vs research
  ↓ drift flags
  ↓ GO/NO-GO verdict
  ↓ auto-disable if edge lost
```

## Redis Keys

```
nexusone:strategy:active         Active strategy ID
nexusone:mode                    System mode (disabled/paper/live)
nexusone:signal:last             Last signal event
nexusone:signal:cooldown_until   Cooldown timestamp
nexusone:execution:open_trade    Current open trade
nexusone:execution:pending_order Pending limit order
nexusone:execution:orders        Order log (list, max 200)
nexusone:execution:trades        Trade log (list, max 200)
nexusone:risk:kill_switch        Kill switch state
nexusone:eval:latest             Latest drift report
nexusone:eval:drift_reports      Drift report log (list, max 100)
```
