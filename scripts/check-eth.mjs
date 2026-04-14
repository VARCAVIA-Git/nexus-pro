import 'dotenv/config';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const h = { Authorization: `Bearer ${token}` };

async function get(key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function smembers(key) {
  const r = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, { headers: h });
  const d = await r.json();
  return d.result ?? [];
}

async function main() {
  // State
  const state = await get('nexus:analytic:ETH/USD');
  console.log('=== ETH STATE ===');
  console.log('Status:', state?.status);
  console.log('Last trained:', state?.lastTrainedAt ? new Date(state.lastTrainedAt).toISOString() : 'never');
  console.log('Regime:', state?.currentRegime);

  // Report
  const report = await get('nexus:analytic:report:ETH/USD');
  if (!report) { console.log('No report'); return; }
  console.log('\n=== ETH REPORT ===');
  console.log('Generated:', new Date(report.generatedAt).toISOString());
  console.log('Candle counts:', JSON.stringify(report.datasetCoverage?.candleCounts));
  console.log('Top rules:', report.topRules?.length ?? 0);
  console.log('Reaction zones:', report.reactionZones?.length ?? 0);
  console.log('Has backtestSummary:', !!report.backtestSummary);
  if (report.backtestSummary) {
    console.log('  Rankings:', report.backtestSummary.rankings?.length);
    console.log('  Strategies tested:', report.backtestSummary.totalStrategiesTested);
    console.log('  Trades simulated:', report.backtestSummary.totalTradesSimulated);
    report.backtestSummary.rankings?.slice(0, 5).forEach((r, i) => {
      console.log(`  #${i+1}: ${r.strategyName} ${r.timeframe} WR:${r.winRate}% PF:${r.profitFactor} Trades:${r.totalTrades} Net:${r.netProfitPct}%`);
    });
  }
  console.log('Has predictiveProfile:', !!report.predictiveProfile);
  console.log('Recommended:', report.recommendedTimeframe, report.recommendedOperationMode);

  // Global stats
  const gs = report.globalStats;
  console.log('\n=== GLOBAL STATS ===');
  console.log('Max gain 24h:', gs?.maxGainObserved);
  console.log('Max loss 24h:', gs?.maxLossObserved);
  console.log('Best regime long:', gs?.bestRegimeForLong);
  console.log('Best regime short:', gs?.bestRegimeForShort);

  // Live context
  const live = await get('nexus:analytic:live:ETH/USD');
  console.log('\n=== ETH LIVE ===');
  if (live) {
    console.log('Price:', live.price);
    console.log('Regime:', live.regime);
    console.log('Momentum:', live.momentumScore);
    console.log('Volatility:', live.volatilityPercentile);
    console.log('Active rules:', live.activeRules?.length ?? 0);
    console.log('Nearest zones:', live.nearestZones?.length ?? 0);
    if (live.indicators) console.log('Indicators:', JSON.stringify(live.indicators));
    console.log('Updated:', new Date(live.updatedAt).toISOString());
  } else {
    console.log('No live context');
  }

  // Live price from Alpaca
  try {
    const p = await fetch('http://localhost:3000/api/prices/symbol?symbol=ETH%2FUSD').then(r => r.json());
    console.log('\nAlpaca live price:', p?.price);
  } catch { console.log('Price endpoint unavailable'); }

  // Active mines
  const mineIds = await smembers('nexus:mines:active:ETH/USD');
  console.log('\n=== ETH MINES ===');
  console.log('Active mine IDs:', mineIds);
  for (const id of mineIds.slice(0, 5)) {
    const mine = await get(`nexus:mine:${id}`);
    if (mine) console.log(`  ${id}: ${mine.status} ${mine.direction} entry:${mine.entryPrice} pnl:${mine.unrealizedPnl?.toFixed(2)}`);
  }

  // Top rules analysis
  console.log('\n=== TOP RULES (buy) ===');
  const buyRules = (report.topRules ?? []).filter(r => r.direction === 'long').slice(0, 5);
  buyRules.forEach(r => console.log(`  ${r.conditions.join(' + ')} WR:${r.winRate}% N:${r.occurrences} Avg:${r.avgReturn?.toFixed(3)}% Conf:${r.confidenceScore}`));

  console.log('\n=== TOP RULES (sell) ===');
  const sellRules = (report.topRules ?? []).filter(r => r.direction === 'short').slice(0, 5);
  sellRules.forEach(r => console.log(`  ${r.conditions.join(' + ')} WR:${(100-r.winRate)}% N:${r.occurrences} Avg:${r.avgReturn?.toFixed(3)}% Conf:${r.confidenceScore}`));

  // Indicator reactivity
  console.log('\n=== INDICATOR REACTIVITY ===');
  const inds = Object.values(report.indicatorReactivity ?? {});
  inds.sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  inds.slice(0, 8).forEach(i => console.log(`  ${i.indicatorName}: signals=${i.signalCount} WR=${i.winRate}% avg=${i.avgReturn?.toFixed(3)}%`));
}

main().catch(e => console.error('Error:', e.message));
