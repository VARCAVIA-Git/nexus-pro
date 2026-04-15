# NexusOne — Risk Rules

## Position Sizing

- Risk per trade: 0.25% - 0.50% of equity
- Max open positions: 1
- No pyramiding
- No averaging down

## Kill Switches

### Operational (instant)
- Broker not responding
- Data stale (>5 min)
- Funding data missing
- Orders rejected
- Duplicate order detected

### Quantitative (after evaluation)
- 5 consecutive losses → STOP
- Rolling 20-trade net edge negative → STOP
- Fill rate < 50% → STOP
- Average slippage > 15 bps → STOP
- Daily loss > 1.5R → STOP for day
- Weekly loss > 3R → STOP for week

## Emergency Stop

POST /api/nexusone/emergency-stop

Immediately:
1. Triggers kill switch
2. Closes any open trade at market
3. Sets system mode to 'disabled'
