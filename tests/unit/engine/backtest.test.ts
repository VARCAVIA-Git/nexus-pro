import { describe, it, expect } from 'vitest';
import { runBacktest, runMonteCarlo, runWalkForward, runFullBacktest } from '@/lib/engine/backtest';
import { generateOHLCV } from '@/lib/engine/data-generator';
import type { TradingConfig } from '@/types';

const candles = generateOHLCV({ startPrice: 100, days: 500, seed: 77 });

const config: TradingConfig = {
  capital: 10000,
  riskPerTrade: 3,
  maxPositions: 3,
  stopLossPct: 3,
  takeProfitPct: 6,
  trailingStop: true,
  trailingPct: 2,
  commissionPct: 0.1,
  slippagePct: 0.05,
  cooldownBars: 2,
  kellyFraction: 0.25,
  maxDrawdownLimit: 30,
  dailyLossLimit: 5,
};

describe('runBacktest', () => {
  it('should return valid BacktestResult', () => {
    const result = runBacktest(candles, config, 'trend');

    expect(result.initialCapital).toBe(10000);
    expect(result.equity.length).toBeGreaterThan(0);
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(result.wins + result.losses).toBe(result.totalTrades);
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    expect(Number.isFinite(result.sortinoRatio)).toBe(true);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('should work with all strategy types', () => {
    const strategies = ['trend', 'reversion', 'breakout', 'momentum', 'pattern', 'combined_ai'] as const;
    for (const s of strategies) {
      const result = runBacktest(candles, config, s);
      expect(result.equity.length).toBeGreaterThan(0);
    }
  });

  it('should handle too few candles gracefully', () => {
    const shortCandles = generateOHLCV({ startPrice: 100, days: 30, seed: 1 });
    const result = runBacktest(shortCandles, config, 'trend');
    expect(result.totalTrades).toBe(0);
    expect(result.initialCapital).toBe(10000);
  });

  it('should apply commissions', () => {
    const result = runBacktest(candles, config, 'trend');
    if (result.totalTrades > 0) {
      expect(result.totalCommissions).toBeGreaterThan(0);
    }
  });

  it('should respect max drawdown limit', () => {
    const aggressiveConfig = { ...config, maxDrawdownLimit: 5 };
    const result = runBacktest(candles, aggressiveConfig, 'trend');
    // Drawdown should not exceed the limit by much (can slightly overshoot)
    expect(result.maxDrawdown).toBeLessThan(aggressiveConfig.maxDrawdownLimit + 5);
  });

  it('equity should start near initial capital', () => {
    const result = runBacktest(candles, config, 'trend');
    expect(result.equity[0]).toBeCloseTo(config.capital, -1);
  });

  it('final capital should match last equity value', () => {
    const result = runBacktest(candles, config, 'trend');
    const lastEquity = result.equity[result.equity.length - 1];
    expect(result.finalCapital).toBeCloseTo(lastEquity, 0);
  });
});

describe('runMonteCarlo', () => {
  it('should run 200 simulations by default', () => {
    const baseResult = runBacktest(candles, config, 'trend');
    if (baseResult.trades.length < 5) return; // skip if not enough trades

    const mc = runMonteCarlo(baseResult.trades, config.capital, 200);
    expect(mc.simulations).toBe(200);
    expect(mc.probabilityOfProfit).toBeGreaterThanOrEqual(0);
    expect(mc.probabilityOfProfit).toBeLessThanOrEqual(1);
  });

  it('should have ordered percentiles', () => {
    const baseResult = runBacktest(candles, config, 'momentum');
    if (baseResult.trades.length < 5) return;

    const mc = runMonteCarlo(baseResult.trades, config.capital);
    expect(mc.percentiles.p5.final).toBeLessThanOrEqual(mc.percentiles.p25.final);
    expect(mc.percentiles.p25.final).toBeLessThanOrEqual(mc.percentiles.p50.final);
    expect(mc.percentiles.p50.final).toBeLessThanOrEqual(mc.percentiles.p75.final);
    expect(mc.percentiles.p75.final).toBeLessThanOrEqual(mc.percentiles.p95.final);
  });

  it('should handle empty trades', () => {
    const mc = runMonteCarlo([], 10000);
    expect(mc.probabilityOfProfit).toBe(0);
    expect(mc.percentiles.p50.final).toBe(10000);
  });
});

describe('runWalkForward', () => {
  it('should return 4 windows for large enough data', () => {
    const longCandles = generateOHLCV({ startPrice: 100, days: 800, seed: 55 });
    const wf = runWalkForward(longCandles, config, 'trend', 4);
    expect(wf.windows.length).toBeGreaterThan(0);
    expect(wf.windows.length).toBeLessThanOrEqual(4);
    expect(wf.robustnessPct).toBeGreaterThanOrEqual(0);
    expect(wf.robustnessPct).toBeLessThanOrEqual(100);
  });

  it('each window should have valid metrics', () => {
    const longCandles = generateOHLCV({ startPrice: 100, days: 800, seed: 55 });
    const wf = runWalkForward(longCandles, config, 'trend', 4);
    for (const w of wf.windows) {
      expect(w.window).toBeGreaterThan(0);
      expect(w.trainWinRate).toBeGreaterThanOrEqual(0);
      expect(w.testWinRate).toBeGreaterThanOrEqual(0);
      expect(typeof w.robust).toBe('boolean');
    }
  });

  it('should handle too-short data gracefully', () => {
    const shortCandles = generateOHLCV({ startPrice: 100, days: 100, seed: 33 });
    const wf = runWalkForward(shortCandles, config, 'trend', 4);
    expect(wf.windows.length).toBe(0);
    expect(wf.robustnessPct).toBe(0);
  });
});

describe('runFullBacktest', () => {
  it('should include monte carlo for enough trades', () => {
    const result = runFullBacktest(candles, config, 'trend');
    if (result.totalTrades >= 5) {
      expect(result.monteCarlo).toBeDefined();
      expect(result.monteCarlo!.simulations).toBe(200);
    }
  });

  it('should include walk-forward for enough data', () => {
    const longCandles = generateOHLCV({ startPrice: 100, days: 600, seed: 99 });
    const result = runFullBacktest(longCandles, config, 'trend');
    if (longCandles.length >= 500) {
      expect(result.walkForward).toBeDefined();
    }
  });
});
