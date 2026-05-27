// ═══════════════════════════════════════════════════════════════
// S5 RSI Bidir — Walk-Forward + Bootstrap Validation
//
// Pulls 60 days of 5m bars from OKX for BTC, ETH, SOL.
// Runs the project's frozen backtester with the MAKER cost model
// (8 bps RT). Writes a JSON report to docs/nexusone/.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import {
  runBacktest,
  walkForward,
  type CostModel,
  type BacktestReport,
} from '../../src/lib/nexusone/research/backtester';
import { strategyS5, MAKER_COSTS } from '../../src/lib/nexusone/strategies/s5-rsi-bidir';
import type { MarketBar } from '../../src/lib/nexusone/types';

const SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const DAYS = 60;
const TF = '5m';

const OKX_BASE = 'https://www.okx.com/api/v5';

function toOkxInstId(symbol: string): string {
  const map: Record<string, string> = {
    'BTC-USD': 'BTC-USDT-SWAP',
    'ETH-USD': 'ETH-USDT-SWAP',
    'SOL-USD': 'SOL-USDT-SWAP',
  };
  return map[symbol] ?? 'BTC-USDT-SWAP';
}

interface RawBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchOkxHistory(symbol: string, days: number): Promise<RawBar[]> {
  const instId = toOkxInstId(symbol);
  const barsPerDay = (24 * 60) / 5;
  const target = days * barsPerDay;
  const out: RawBar[] = [];

  // /history-candles allows older data with `after` cursor (timestamp ms)
  let after: string | undefined;
  let safety = 200;

  while (out.length < target && safety-- > 0) {
    const url = new URL(`${OKX_BASE}/market/history-candles`);
    url.searchParams.set('instId', instId);
    url.searchParams.set('bar', '5m');
    url.searchParams.set('limit', '300');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      console.error(`[OKX] ${instId} HTTP ${res.status} ${await res.text()}`);
      break;
    }
    const data = (await res.json()) as { code: string; msg: string; data: string[][] };
    if (data.code !== '0') {
      console.error(`[OKX] ${instId} err ${data.msg}`);
      break;
    }
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    // OKX history-candles returns newest first; oldest is last in array.
    for (const c of batch) {
      out.push({
        ts: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      });
    }

    // Next page: ask for bars OLDER than the oldest we got.
    const oldest = batch[batch.length - 1];
    after = oldest[0];

    // Be polite — OKX rate limit is 20/2s for this endpoint.
    await new Promise((r) => setTimeout(r, 120));
  }

  // Sort oldest→newest, dedupe by ts.
  const seen = new Set<number>();
  const sorted = out
    .filter((b) => (seen.has(b.ts) ? false : (seen.add(b.ts), true)))
    .sort((a, b) => a.ts - b.ts);

  return sorted;
}

function toMarketBars(symbol: string, raw: RawBar[]): MarketBar[] {
  return raw.map((b) => ({
    venue: 'okx',
    symbol,
    timeframe: TF,
    ts_open: b.ts,
    ts_close: b.ts + 5 * 60_000,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

// ─── Bootstrap p-value ──────────────────────────────────────
//
// H0: net edge per trade is ≤ 0.
// We resample trades with replacement N times and measure
// the fraction of resamples where mean(net_pnl_bps) ≤ 0.
// This is one-sided (we only care about positive edge).

function bootstrapPValue(trades: number[], iterations = 1000): {
  p_value: number;
  mean: number;
  ci_low: number;
  ci_high: number;
} {
  if (trades.length < 10) return { p_value: 1, mean: 0, ci_low: 0, ci_high: 0 };

  const n = trades.length;
  const observedMean = trades.reduce((s, x) => s + x, 0) / n;

  let nullOrWorse = 0;
  const means: number[] = [];

  // Center for null distribution
  const centered = trades.map((t) => t - observedMean);

  for (let i = 0; i < iterations; i++) {
    // Sample under null (mean = 0)
    let sumNull = 0;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      sumNull += centered[idx];
      sum += trades[idx];
    }
    const meanNull = sumNull / n;
    if (meanNull >= observedMean) nullOrWorse++;
    means.push(sum / n);
  }

  means.sort((a, b) => a - b);
  const ciLow = means[Math.floor(iterations * 0.025)];
  const ciHigh = means[Math.floor(iterations * 0.975)];

  return {
    p_value: nullOrWorse / iterations,
    mean: observedMean,
    ci_low: ciLow,
    ci_high: ciHigh,
  };
}

// ─── Main ───────────────────────────────────────────────────

interface SymbolResult {
  symbol: string;
  bars_count: number;
  full: BacktestReport['metrics'];
  walk_forward: {
    folds_count: number;
    all_positive: boolean;
    avg_net_bps: number;
    fold_metrics: Array<{
      fold: number;
      trades: number;
      net_bps: number;
      win_rate: number;
      sharpe: number;
    }>;
  };
  bootstrap: ReturnType<typeof bootstrapPValue>;
  verdict: 'GO_PAPER' | 'NO_GO';
  reasons: string[];
}

async function validateSymbol(
  symbol: string,
  costs: CostModel,
): Promise<SymbolResult> {
  console.log(`\n=== ${symbol} ===`);
  console.log(`Fetching ${DAYS}d of ${TF} bars from OKX...`);
  const raw = await fetchOkxHistory(symbol, DAYS);
  console.log(`  ${raw.length} bars`);
  if (raw.length < 1000) {
    return {
      symbol,
      bars_count: raw.length,
      full: {
        total_trades: 0, winning_trades: 0, losing_trades: 0, win_rate: 0,
        gross_pnl_bps: 0, total_cost_bps: 0, net_pnl_bps: 0, avg_trade_bps: 0,
        avg_winner_bps: 0, avg_loser_bps: 0, max_drawdown_bps: 0,
        sharpe_ratio: 0, profit_factor: 0, t_stat: 0, expectancy_bps: 0,
      },
      walk_forward: { folds_count: 4, all_positive: false, avg_net_bps: 0, fold_metrics: [] },
      bootstrap: { p_value: 1, mean: 0, ci_low: 0, ci_high: 0 },
      verdict: 'NO_GO',
      reasons: ['Insufficient data'],
    };
  }

  const bars = toMarketBars(symbol, raw);

  // Build a per-symbol manifest by overriding the symbol field.
  const manifest = { ...strategyS5, symbol };

  // Funding not used by S5 — pass empty.
  const empty: number[] = [];

  console.log('Running full backtest with maker costs...');
  const full = runBacktest(manifest, bars, empty, costs);
  console.log(
    `  trades=${full.metrics.total_trades} net=${full.metrics.net_pnl_bps}bps ` +
      `win=${full.metrics.win_rate}% sharpe=${full.metrics.sharpe_ratio} ` +
      `pf=${full.metrics.profit_factor}`,
  );

  console.log('Running walk-forward (4 folds)...');
  const wf = walkForward(manifest, bars, empty, 4, costs);
  const foldMetrics = wf.folds.map((r, i) => ({
    fold: i + 1,
    trades: r.metrics.total_trades,
    net_bps: r.metrics.net_pnl_bps,
    win_rate: r.metrics.win_rate,
    sharpe: r.metrics.sharpe_ratio,
  }));
  for (const f of foldMetrics) {
    console.log(`  fold ${f.fold}: ${f.trades} trades, net=${f.net_bps}bps, win=${f.win_rate}%`);
  }
  console.log(`  all_positive=${wf.all_positive} avg_net=${wf.avg_net_bps}bps`);

  console.log('Running bootstrap (1000 iterations)...');
  const tradeReturns = full.trades.map((t) => t.net_pnl_bps);
  const boot = bootstrapPValue(tradeReturns, 1000);
  console.log(
    `  mean=${boot.mean.toFixed(2)}bps p=${boot.p_value.toFixed(4)} ` +
      `CI95=[${boot.ci_low.toFixed(2)}, ${boot.ci_high.toFixed(2)}]bps`,
  );

  const reasons: string[] = [];
  if (full.metrics.total_trades < 50) reasons.push('Too few trades (<50)');
  if (full.metrics.net_pnl_bps <= 0) reasons.push('Full-period net edge ≤ 0');
  if (!wf.all_positive) reasons.push('Walk-forward not all-positive');
  if (boot.p_value >= 0.05) reasons.push(`Bootstrap p-value ${boot.p_value.toFixed(3)} ≥ 0.05`);
  if (full.metrics.profit_factor < 1.1) reasons.push(`Profit factor ${full.metrics.profit_factor} < 1.1`);

  const verdict: 'GO_PAPER' | 'NO_GO' = reasons.length === 0 ? 'GO_PAPER' : 'NO_GO';

  return {
    symbol,
    bars_count: raw.length,
    full: full.metrics,
    walk_forward: {
      folds_count: 4,
      all_positive: wf.all_positive,
      avg_net_bps: wf.avg_net_bps,
      fold_metrics: foldMetrics,
    },
    bootstrap: boot,
    verdict,
    reasons,
  };
}

async function main() {
  console.log('S5 RSI Bidir — Validation with MAKER cost model');
  console.log('Costs:', MAKER_COSTS);

  const results: SymbolResult[] = [];
  for (const symbol of SYMBOLS) {
    try {
      const r = await validateSymbol(symbol, MAKER_COSTS);
      results.push(r);
    } catch (err: any) {
      console.error(`[${symbol}] FAILED:`, err.message);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    strategy: strategyS5.id,
    period_days: DAYS,
    timeframe: TF,
    cost_model: MAKER_COSTS,
    cost_model_round_trip_bps: 6,
    results,
    overall_verdict: results.every((r) => r.verdict === 'GO_PAPER')
      ? 'GO_PAPER_ALL'
      : results.some((r) => r.verdict === 'GO_PAPER')
        ? 'GO_PAPER_PARTIAL'
        : 'NO_GO',
  };

  const outDir = path.join(process.cwd(), 'docs', 'nexusone');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'S5_VALIDATION_RAW.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath}`);
  console.log(`Overall: ${report.overall_verdict}`);

  // Print per-symbol summary
  console.log('\n┌────────┬───────┬──────────┬──────┬──────┬─────────┬──────────┐');
  console.log('│ Symbol │ Trade │ Net bps  │ Win% │ Shar │ p-value │ Verdict  │');
  console.log('├────────┼───────┼──────────┼──────┼──────┼─────────┼──────────┤');
  for (const r of results) {
    console.log(
      `│ ${r.symbol.padEnd(6)} │ ${String(r.full.total_trades).padStart(5)} │ ${
        String(r.full.net_pnl_bps).padStart(8)
      } │ ${String(r.full.win_rate).padStart(4)} │ ${
        String(r.full.sharpe_ratio).padStart(4)
      } │ ${r.bootstrap.p_value.toFixed(3).padStart(7)} │ ${r.verdict.padEnd(8)} │`,
    );
  }
  console.log('└────────┴───────┴──────────┴──────┴──────┴─────────┴──────────┘');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
