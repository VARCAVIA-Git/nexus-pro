// ═══════════════════════════════════════════════════════════════
// Portfolio Diversification Test
//
// Hypothesis: no single strategy passes walk-forward, but a
// portfolio of weakly-correlated near-pass strategies might
// reduce variance enough to make the aggregate equity curve
// monotonically positive.
//
// We take the top N net-positive strategies and combine their
// per-period equity into a single portfolio, then check if the
// combined walk-forward is all-positive.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

interface ScreeningResult {
  generated_at: string;
  cost_model_rt_bps: number;
  total_combinations_tested: number;
  candidates_reported: number;
  passes: number;
  results: Array<{
    strategy: string;
    symbol: string;
    tf: string;
    metrics: { trades: number; net_bps: number; win_rate: number; pf: number; sharpe: number; max_dd_bps: number; avg_bps: number };
    walk_all_positive: boolean;
    walk_folds_net: number[];
    bootstrap_p: number;
    passes: boolean;
    reasons: string[];
  }>;
}

const screeningPath = path.join(process.cwd(), 'docs', 'nexusone', 'STRATEGY_SCREENING.json');
const data: ScreeningResult = JSON.parse(fs.readFileSync(screeningPath, 'utf8'));

console.log(`Loaded ${data.results.length} candidates`);

// Take net-positive ones with PF >= 1.1
const netPositive = data.results
  .filter((r) => r.metrics.net_bps > 0 && r.metrics.pf >= 1.1)
  .sort((a, b) => b.metrics.net_bps - a.metrics.net_bps);

console.log(`${netPositive.length} candidates with net>0 & PF>=1.1`);

// Per-fold portfolio aggregation: sum the fold nets
// (assumes equal capital allocation, no leverage)
const N_FOLDS = 4;

interface PortfolioCandidate {
  size: number;
  strategies: string[];
  sumByFold: number[];
  total: number;
  allFoldsPositive: boolean;
  minFold: number;
}

function evaluatePortfolio(strats: typeof netPositive): PortfolioCandidate {
  const sumByFold = new Array(N_FOLDS).fill(0);
  for (const s of strats) {
    for (let i = 0; i < N_FOLDS; i++) sumByFold[i] += (s.walk_folds_net[i] ?? 0) / strats.length;
  }
  const total = sumByFold.reduce((a, b) => a + b, 0);
  const allPos = sumByFold.every((x) => x > 0);
  const minFold = Math.min(...sumByFold);
  return {
    size: strats.length,
    strategies: strats.map((s) => `${s.symbol}/${s.tf}/${s.strategy}`),
    sumByFold: sumByFold.map((x) => Math.round(x * 10) / 10),
    total: Math.round(total * 10) / 10,
    allFoldsPositive: allPos,
    minFold: Math.round(minFold * 10) / 10,
  };
}

// Greedy selection: start with best, add strategies that improve worst fold
function greedyPortfolio(pool: typeof netPositive, maxSize = 6): PortfolioCandidate {
  if (pool.length === 0) {
    return { size: 0, strategies: [], sumByFold: [0, 0, 0, 0], total: 0, allFoldsPositive: false, minFold: 0 };
  }
  const selected: typeof netPositive = [pool[0]];
  let best = evaluatePortfolio(selected);
  const remaining = pool.slice(1);

  while (selected.length < maxSize && remaining.length > 0) {
    let bestNext = best;
    let bestIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const trial = evaluatePortfolio([...selected, remaining[i]]);
      // Maximize min(fold) — stability — then total
      if (trial.minFold > bestNext.minFold || (trial.minFold === bestNext.minFold && trial.total > bestNext.total)) {
        bestNext = trial;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
    best = bestNext;
  }
  return best;
}

// Brute force top-K portfolios of various sizes
console.log('\n━━━ PORTFOLIO BUILDS ━━━\n');

const fullPortfolio = evaluatePortfolio(netPositive);
console.log(`Full pool (${fullPortfolio.size} strats):`);
console.log(`  fold nets: [${fullPortfolio.sumByFold.join(', ')}] bps`);
console.log(`  total: ${fullPortfolio.total} bps, all-positive: ${fullPortfolio.allFoldsPositive}, min-fold: ${fullPortfolio.minFold}`);

const greedy = greedyPortfolio(netPositive, 8);
console.log(`\nGreedy stability portfolio (size ${greedy.size}):`);
for (const s of greedy.strategies) console.log(`  - ${s}`);
console.log(`  fold nets: [${greedy.sumByFold.join(', ')}] bps`);
console.log(`  total: ${greedy.total} bps, all-positive: ${greedy.allFoldsPositive}, min-fold: ${greedy.minFold}`);

// Per-symbol/asset diversification: pick best per symbol
console.log('\n━━━ Per-asset best portfolio ━━━');
const bySymbol = new Map<string, typeof netPositive[0]>();
for (const s of netPositive) {
  const existing = bySymbol.get(s.symbol);
  if (!existing || s.metrics.net_bps > existing.metrics.net_bps) bySymbol.set(s.symbol, s);
}
const perSymbol = [...bySymbol.values()];
console.log(`${perSymbol.length} strats (one per symbol):`);
for (const s of perSymbol) console.log(`  ${s.symbol}/${s.tf}/${s.strategy} folds=[${s.walk_folds_net.join(', ')}] net=${s.metrics.net_bps}`);
const perSymbolPortfolio = evaluatePortfolio(perSymbol);
console.log(`  fold nets: [${perSymbolPortfolio.sumByFold.join(', ')}] bps`);
console.log(`  total: ${perSymbolPortfolio.total} bps, all-positive: ${perSymbolPortfolio.allFoldsPositive}, min-fold: ${perSymbolPortfolio.minFold}`);

// Cross-strategy diversification: best of each strategy family
console.log('\n━━━ Per-family best portfolio ━━━');
const byFamily = new Map<string, typeof netPositive[0]>();
for (const s of netPositive) {
  const family = s.strategy.split('_').slice(0, 2).join('_'); // e.g. RSI_CROSS, BB_REV, DONCH
  const existing = byFamily.get(family);
  if (!existing || s.metrics.net_bps > existing.metrics.net_bps) byFamily.set(family, s);
}
const perFamily = [...byFamily.values()];
for (const s of perFamily) console.log(`  ${s.strategy} on ${s.symbol}/${s.tf} folds=[${s.walk_folds_net.join(', ')}]`);
const perFamilyPortfolio = evaluatePortfolio(perFamily);
console.log(`  fold nets: [${perFamilyPortfolio.sumByFold.join(', ')}] bps`);
console.log(`  total: ${perFamilyPortfolio.total} bps, all-positive: ${perFamilyPortfolio.allFoldsPositive}, min-fold: ${perFamilyPortfolio.minFold}`);

const portfolioReport = {
  generated_at: new Date().toISOString(),
  source: 'STRATEGY_SCREENING.json',
  full_pool: fullPortfolio,
  greedy_stability: greedy,
  per_symbol: perSymbolPortfolio,
  per_family: perFamilyPortfolio,
  per_symbol_strategies: perSymbol.map((s) => ({ id: s.strategy, symbol: s.symbol, tf: s.tf, folds: s.walk_folds_net })),
  per_family_strategies: perFamily.map((s) => ({ id: s.strategy, symbol: s.symbol, tf: s.tf, folds: s.walk_folds_net })),
};

const outPath = path.join(process.cwd(), 'docs', 'nexusone', 'PORTFOLIO_TEST.json');
fs.writeFileSync(outPath, JSON.stringify(portfolioReport, null, 2));
console.log(`\nReport written to ${outPath}`);
