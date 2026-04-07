// ═══════════════════════════════════════════════════════════════
// Strategy Trainer — grid search optimization per asset × timeframe × strategy
// ═══════════════════════════════════════════════════════════════

import type { StrategyKey, TradingConfig } from '@/types';
import { runBacktest } from '../backtest';
import { downloadHistory } from './history-loader';
import { redisSet, redisGet } from '@/lib/db/redis';

export interface TrainingResult {
  asset: string;
  timeframe: string;
  strategy: string;
  bestParams: { stopLoss: number; takeProfit: number; confidenceThreshold: number };
  metrics: { totalTrades: number; winRate: number; profitFactor: number; sharpe: number; maxDrawdown: number; avgTradeReturn: number };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: string;
  score: number;
}

function assignGrade(sharpe: number, winRate: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (sharpe > 2 && winRate > 60) return 'A';
  if (sharpe > 1.5 && winRate > 55) return 'B';
  if (sharpe > 1 && winRate > 50) return 'C';
  if (sharpe > 0.5) return 'D';
  return 'F';
}

export async function trainStrategy(asset: string, tf: string, strategy: StrategyKey): Promise<TrainingResult> {
  const cacheKey = `nexus:rnd:training:${asset}:${tf}:${strategy}`;
  try { const c = await redisGet<TrainingResult>(cacheKey); if (c) return c; } catch {}

  const { candles } = await downloadHistory(asset, tf);

  if (candles.length < 100) {
    return { asset, timeframe: tf, strategy, bestParams: { stopLoss: 3, takeProfit: 6, confidenceThreshold: 70 }, metrics: { totalTrades: 0, winRate: 0, profitFactor: 0, sharpe: 0, maxDrawdown: 0, avgTradeReturn: 0 }, grade: 'F', recommendation: 'Dati insufficienti', score: 0 };
  }

  const SL_RANGE = [1.5, 2, 2.5, 3, 4, 5];
  const TP_RANGE = [3, 4, 5, 6, 8, 10];
  let bestScore = -Infinity;
  let bestResult: TrainingResult | null = null;

  for (const sl of SL_RANGE) {
    for (const tp of TP_RANGE) {
      if (tp <= sl) continue;

      const config: TradingConfig = {
        capital: 10000, riskPerTrade: 3, maxPositions: 3,
        stopLossPct: sl, takeProfitPct: tp,
        trailingStop: true, trailingPct: 2,
        commissionPct: 0.1, slippagePct: 0.05,
        cooldownBars: 2, kellyFraction: 0.25,
        maxDrawdownLimit: 30, dailyLossLimit: 5,
      };

      try {
        const bt = runBacktest(candles, config, strategy, asset);
        if (bt.totalTrades < 5) continue;

        const compositeScore = bt.sharpeRatio * 0.4 + (bt.profitFactor > 10 ? 3 : bt.profitFactor) * 0.3 + (bt.winRate / 100) * 0.3;

        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          const grade = assignGrade(bt.sharpeRatio, bt.winRate);
          bestResult = {
            asset, timeframe: tf, strategy,
            bestParams: { stopLoss: sl, takeProfit: tp, confidenceThreshold: 70 },
            metrics: {
              totalTrades: bt.totalTrades, winRate: Math.round(bt.winRate * 10) / 10,
              profitFactor: Math.round((bt.profitFactor > 10 ? 10 : bt.profitFactor) * 100) / 100,
              sharpe: Math.round(bt.sharpeRatio * 100) / 100,
              maxDrawdown: Math.round(bt.maxDrawdown * 10) / 10,
              avgTradeReturn: bt.totalTrades > 0 ? Math.round((bt.returnPct / bt.totalTrades) * 100) / 100 : 0,
            },
            grade, score: Math.round(compositeScore * 100) / 100,
            recommendation: grade === 'A' ? 'Eccellente — usa in produzione' : grade === 'B' ? 'Buono — testare ulteriormente' : grade === 'C' ? 'Mediocre — ottimizzare' : 'Sconsigliato',
          };
        }
      } catch {}
    }
  }

  const result = bestResult ?? {
    asset, timeframe: tf, strategy,
    bestParams: { stopLoss: 3, takeProfit: 6, confidenceThreshold: 70 },
    metrics: { totalTrades: 0, winRate: 0, profitFactor: 0, sharpe: 0, maxDrawdown: 0, avgTradeReturn: 0 },
    grade: 'F' as const, recommendation: 'Nessun risultato valido', score: 0,
  };

  await redisSet(cacheKey, result, 86400).catch(() => {});
  return result;
}

export interface TrainingReport {
  totalExperiments: number;
  results: TrainingResult[];
  gradeDistribution: Record<string, number>;
  topCombinations: TrainingResult[];
}

export async function runFullTraining(
  assets: string[],
  timeframes: string[],
  strategies: StrategyKey[],
  onProgress?: (msg: string, pct: number) => void,
): Promise<TrainingReport> {
  const results: TrainingResult[] = [];
  const total = assets.length * timeframes.length * strategies.length;
  let done = 0;

  for (const asset of assets) {
    for (const tf of timeframes) {
      for (const strat of strategies) {
        onProgress?.(`${asset} × ${tf} × ${strat}`, (done / total) * 100);
        try {
          const result = await trainStrategy(asset, tf, strat);
          results.push(result);
        } catch {}
        done++;
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of results) gradeDistribution[r.grade]++;

  return {
    totalExperiments: results.length,
    results,
    gradeDistribution,
    topCombinations: results.filter(r => r.grade === 'A' || r.grade === 'B').slice(0, 20),
  };
}
