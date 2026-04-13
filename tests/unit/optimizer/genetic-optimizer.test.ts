import { describe, it, expect } from 'vitest';
import { runGeneticOptimizer, createRandomGenome, evaluateGenome } from '@/lib/analytics/optimizer';
import { DEFAULT_GA_CONFIG } from '@/lib/analytics/optimizer/types';
import { computeIndicators } from '@/lib/core/indicators';
import type { OHLCV } from '@/types';

// ── Synthetic data ───────────────────────────────────────────

function generateCandles(count: number, startPrice = 100, trend: 'up' | 'down' | 'sideways' = 'sideways'): OHLCV[] {
  const candles: OHLCV[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const drift = trend === 'up' ? 0.001 : trend === 'down' ? -0.001 : 0;
    const change = (Math.random() - 0.5) * 0.04 + drift;
    const open = price;
    price *= (1 + change);
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.round(1e6 * (0.5 + Math.random()));
    const date = new Date(2024, 0, 1);
    date.setHours(date.getHours() + i);
    candles.push({ date: date.toISOString().slice(0, 10), open, high, low, close, volume });
  }
  return candles;
}

// ── Tests ────────────────────────────────────────────────────

describe('Genetic Optimizer', () => {
  describe('createRandomGenome', () => {
    it('creates a genome with at least 2 active indicators', () => {
      const g = createRandomGenome();
      const active = Object.values(g.indicators).filter(v => (v as any).active).length;
      expect(active).toBeGreaterThanOrEqual(2);
    });

    it('has valid TP/SL multipliers', () => {
      const g = createRandomGenome();
      expect(g.tpAtrMultiplier).toBeGreaterThanOrEqual(1.5);
      expect(g.tpAtrMultiplier).toBeLessThanOrEqual(5.0);
      expect(g.slAtrMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(g.slAtrMultiplier).toBeLessThanOrEqual(3.0);
    });

    it('has unique IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => createRandomGenome().id));
      expect(ids.size).toBe(10);
    });
  });

  describe('evaluateGenome', () => {
    it('fills metrics after evaluation', () => {
      const candles = generateCandles(300, 100, 'up');
      const indicators = computeIndicators(candles);
      const genome = createRandomGenome();
      evaluateGenome(genome, candles, indicators, DEFAULT_GA_CONFIG);

      expect(Number.isFinite(genome.winRate)).toBe(true);
      expect(Number.isFinite(genome.profitFactor)).toBe(true);
      expect(Number.isFinite(genome.sharpe)).toBe(true);
      expect(Number.isFinite(genome.maxDrawdownPct)).toBe(true);
    });

    it('respects minTrades filter', () => {
      const candles = generateCandles(100); // short = few trades
      const indicators = computeIndicators(candles);
      const genome = createRandomGenome();
      genome.minConfidence = 0.95; // Very restrictive = few trades
      evaluateGenome(genome, candles, indicators, { ...DEFAULT_GA_CONFIG, minTrades: 50 });
      // With high confidence and short data, should have 0 trades
      expect(genome.totalTrades).toBeLessThan(50);
      if (genome.totalTrades < 50) {
        expect(genome.winRate).toBe(0);
      }
    });
  });

  describe('runGeneticOptimizer', () => {
    it('runs and returns valid result', () => {
      const candles = generateCandles(500, 100, 'up');
      const config = {
        ...DEFAULT_GA_CONFIG,
        populationSize: 20,  // Small for speed
        generations: 10,     // Few for speed
        minTrades: 5,
      };

      const result = runGeneticOptimizer(candles, config);

      expect(result.bestGenome).toBeDefined();
      expect(result.topGenomes.length).toBeLessThanOrEqual(5);
      expect(result.generationsRun).toBeGreaterThan(0);
      expect(result.totalEvaluations).toBeGreaterThan(config.populationSize);
      expect(result.elapsedMs).toBeGreaterThan(0);
    });

    it('best genome has positive fitness', () => {
      const candles = generateCandles(500, 100, 'up'); // Uptrend = easier to find good strategies
      const config = {
        ...DEFAULT_GA_CONFIG,
        populationSize: 30,
        generations: 20,
        minTrades: 3,
      };

      const result = runGeneticOptimizer(candles, config);
      expect(result.bestGenome.fitness).toBeGreaterThanOrEqual(0);
    });

    it('throws on insufficient data', () => {
      const candles = generateCandles(50);
      expect(() => runGeneticOptimizer(candles)).toThrow('Insufficient data');
    });

    it('returns train and test metrics', () => {
      const candles = generateCandles(500, 100, 'up');
      const config = {
        ...DEFAULT_GA_CONFIG,
        populationSize: 15,
        generations: 5,
        minTrades: 3,
      };

      const result = runGeneticOptimizer(candles, config);
      expect(result.trainMetrics).toBeDefined();
      expect(result.testMetrics).toBeDefined();
      expect(Number.isFinite(result.trainMetrics.sharpe)).toBe(true);
      expect(Number.isFinite(result.testMetrics.sharpe)).toBe(true);
    });
  });
});
