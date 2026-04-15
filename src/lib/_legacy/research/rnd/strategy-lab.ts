// ═══════════════════════════════════════════════════════════════
// Strategy Lab — tests strategy×params combinations on historical data
// ═══════════════════════════════════════════════════════════════

import type { StrategyKey, TradingConfig } from '@/types';
import { runBacktest } from '../backtest';
import { loadWarehouse } from './data-warehouse';
import { redisSet, redisGet, KEYS } from '@/lib/db/redis';

export interface LabExperiment {
  strategy: string;
  params: { sl: number; tp: number; confidence: number };
  result: { trades: number; winRate: number; totalReturn: number; sharpe: number; maxDrawdown: number; profitFactor: number };
}

export interface LabReport {
  asset: string;
  experiments: LabExperiment[];
  bestConfig: LabExperiment | null;
  totalExperiments: number;
}

export async function runStrategyLab(asset: string): Promise<LabReport> {
  // Check cache
  try {
    const cached = await redisGet<LabReport>(KEYS.labResults(asset));
    if (cached && cached.experiments.length > 0) return cached;
  } catch {}

  const candles = await loadWarehouse(asset, '1d');
  if (candles.length < 100) return { asset, experiments: [], bestConfig: null, totalExperiments: 0 };

  const experiments: LabExperiment[] = [];
  const strategies: StrategyKey[] = ['trend', 'reversion', 'momentum', 'combined_ai'];
  const slValues = [2, 3, 4, 5];
  const tpValues = [4, 6, 8, 10];
  const confValues = [60, 70, 80];

  for (const strategy of strategies) {
    for (const sl of slValues) {
      for (const tp of tpValues) {
        if (tp <= sl) continue; // TP must be > SL

        const config: TradingConfig = {
          capital: 10000, riskPerTrade: 3, maxPositions: 3,
          stopLossPct: sl, takeProfitPct: tp,
          trailingStop: true, trailingPct: 2,
          commissionPct: 0.1, slippagePct: 0.05,
          cooldownBars: 2, kellyFraction: 0.25,
          maxDrawdownLimit: 30, dailyLossLimit: 5,
        };

        try {
          const result = runBacktest(candles, config, strategy, asset);

          if (result.totalTrades >= 5) {
            experiments.push({
              strategy,
              params: { sl, tp, confidence: 70 },
              result: {
                trades: result.totalTrades,
                winRate: result.winRate,
                totalReturn: result.returnPct,
                sharpe: result.sharpeRatio,
                maxDrawdown: result.maxDrawdown,
                profitFactor: result.profitFactor === Infinity ? 99 : result.profitFactor,
              },
            });
          }
        } catch {}
      }
    }
  }

  // Sort by composite score
  experiments.sort((a, b) => {
    const scoreA = a.result.sharpe * 0.4 + (a.result.profitFactor > 99 ? 3 : a.result.profitFactor) * 0.3 + (a.result.winRate / 100) * 0.3;
    const scoreB = b.result.sharpe * 0.4 + (b.result.profitFactor > 99 ? 3 : b.result.profitFactor) * 0.3 + (b.result.winRate / 100) * 0.3;
    return scoreB - scoreA;
  });

  const top = experiments.slice(0, 30);
  const viable = top.filter(e => e.result.trades >= 15 && e.result.winRate > 45 && e.result.maxDrawdown < 25);

  const report: LabReport = {
    asset,
    experiments: top,
    bestConfig: viable[0] ?? top[0] ?? null,
    totalExperiments: experiments.length,
  };

  redisSet(KEYS.labResults(asset), report, 86400).catch(() => {});
  return report;
}
