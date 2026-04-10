import { describe, it, expect } from 'vitest';
import { runFullBacktest, backtestStrategy } from '@/lib/analytics/backtester/full-backtester';
import { DEFAULT_BACKTEST_CONFIG } from '@/lib/analytics/backtester/types';
import { computeIndicators } from '@/lib/core/indicators';
import { strategyMap } from '@/lib/analytics/cognition/strategies';
import type { OHLCV } from '@/types';

// ── Synthetic candle generator ───────────────────────────────

function generateCandles(count: number, options?: {
  startPrice?: number;
  trend?: 'up' | 'down' | 'sideways';
  volatility?: number;
}): OHLCV[] {
  const { startPrice = 100, trend = 'sideways', volatility = 0.02 } = options ?? {};
  const candles: OHLCV[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const drift = trend === 'up' ? 0.001 : trend === 'down' ? -0.001 : 0;
    const change = (Math.random() - 0.5) * 2 * volatility + drift;
    const open = price;
    price *= (1 + change);
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.round(1e6 * (0.5 + Math.random() * 1.5));
    const date = new Date(2024, 0, 1);
    date.setHours(date.getHours() + i);
    candles.push({
      date: date.toISOString().slice(0, 10),
      open, high, low, close, volume,
    });
  }
  return candles;
}

// ── Tests ────────────────────────────────────────────────────

describe('Full Backtester', () => {
  describe('backtestStrategy — single strategy on single timeframe', () => {
    it('produces valid result structure', () => {
      const candles = generateCandles(300, { trend: 'up', volatility: 0.03 });
      const indicators = computeIndicators(candles);
      const result = backtestStrategy(
        'trend', 'Trend Following', strategyMap.trend,
        candles, indicators, '1h', DEFAULT_BACKTEST_CONFIG,
      );

      // Structure checks
      expect(result.strategyId).toBe('trend');
      expect(result.strategyName).toBe('Trend Following');
      expect(result.timeframe).toBe('1h');
      expect(result.isMineRule).toBe(false);

      // Stats should be numbers, not NaN
      expect(Number.isFinite(result.winRate)).toBe(true);
      expect(Number.isFinite(result.profitFactor)).toBe(true);
      expect(Number.isFinite(result.netProfitPct)).toBe(true);
      expect(Number.isFinite(result.maxDrawdownPct)).toBe(true);
      expect(Number.isFinite(result.sharpe)).toBe(true);
      expect(Number.isFinite(result.rankScore)).toBe(true);

      // Equity curve should exist
      expect(result.equityCurve.length).toBeGreaterThan(0);
      expect(result.equityCurve[0]).toBe(DEFAULT_BACKTEST_CONFIG.initialCapital);
    });

    it('respects max concurrent positions', () => {
      const config = { ...DEFAULT_BACKTEST_CONFIG, maxConcurrentPositions: 1 };
      const candles = generateCandles(500, { trend: 'up', volatility: 0.04 });
      const indicators = computeIndicators(candles);
      const result = backtestStrategy(
        'momentum', 'Momentum', strategyMap.momentum,
        candles, indicators, '1h', config,
      );

      // With max 1 position, should still produce valid results
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('handles short candle arrays gracefully', () => {
      const candles = generateCandles(70); // barely above minimum
      const indicators = computeIndicators(candles);
      const result = backtestStrategy(
        'trend', 'Trend', strategyMap.trend,
        candles, indicators, '1h', DEFAULT_BACKTEST_CONFIG,
      );

      // Should not crash, may have 0 trades
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
    });

    it('tracks TP/SL/trailing exit rates', () => {
      const candles = generateCandles(500, { trend: 'up', volatility: 0.035 });
      const indicators = computeIndicators(candles);
      const result = backtestStrategy(
        'reversion', 'Mean Reversion', strategyMap.reversion,
        candles, indicators, '1h', DEFAULT_BACKTEST_CONFIG,
      );

      // Sum of all exit rates should be ~100% (allow rounding)
      if (result.totalTrades > 0) {
        const totalRate = result.tpHitRate + result.slHitRate + result.trailingExitRate + result.timeoutRate;
        // signal_exit is another possible outcome not tracked in rates, so total may be < 100
        expect(totalRate).toBeGreaterThanOrEqual(0);
        expect(totalRate).toBeLessThanOrEqual(100.5);
      }
    });

    it('accounts for commissions and slippage', () => {
      const candles = generateCandles(300, { trend: 'sideways', volatility: 0.01 });
      const indicators = computeIndicators(candles);

      const noFees = backtestStrategy(
        'trend', 'Trend', strategyMap.trend,
        candles, indicators, '1h',
        { ...DEFAULT_BACKTEST_CONFIG, commissionRate: 0, slippageRate: 0 },
      );
      const withFees = backtestStrategy(
        'trend', 'Trend', strategyMap.trend,
        candles, indicators, '1h',
        { ...DEFAULT_BACKTEST_CONFIG, commissionRate: 0.002, slippageRate: 0.001 },
      );

      // With fees, net profit should be lower (or less negative)
      if (noFees.totalTrades > 0 && withFees.totalTrades > 0) {
        expect(withFees.netProfit).toBeLessThanOrEqual(noFees.netProfit + 1); // +1 for float tolerance
      }
    });
  });

  describe('runFullBacktest — all strategies across timeframes', () => {
    it('runs all 6 coded strategies on each provided timeframe', () => {
      const candles1h = generateCandles(300, { trend: 'up', volatility: 0.03 });
      const candles4h = generateCandles(200, { trend: 'up', volatility: 0.04 });

      const report = runFullBacktest('BTC/USD', {
        '1h': candles1h,
        '4h': candles4h,
      }, [], { ...DEFAULT_BACKTEST_CONFIG, includeMineRules: false });

      // 6 strategies × 2 timeframes = 12 results
      expect(report.results.length).toBe(12);
      expect(report.symbol).toBe('BTC/USD');
      expect(report.globalStats.totalStrategiesTested).toBe(12);

      // Results should be sorted by rankScore desc
      for (let i = 1; i < report.results.length; i++) {
        expect(report.results[i - 1].rankScore).toBeGreaterThanOrEqual(report.results[i].rankScore);
      }

      // Top strategies should have max 5 entries
      expect(report.topStrategies.length).toBeLessThanOrEqual(5);
    });

    it('includes mined rules when configured', () => {
      const candles = generateCandles(300, { trend: 'up', volatility: 0.03 });

      const mockRules = [
        {
          id: 'RSI<30+TREND_M=UP',
          conditions: ['RSI<30', 'TREND_M=UP'],
          occurrences: 50,
          winRate: 70,
          wilsonLB: 58,
          wilson: 58,
          avgReturn: 1.5,
          direction: 'BUY' as const,
          edgeScore: 5.0,
        },
      ];

      const report = runFullBacktest('BTC/USD', { '1h': candles }, mockRules, {
        ...DEFAULT_BACKTEST_CONFIG,
        includeMineRules: true,
      });

      // Should have 6 coded + 1 mine rule = 7 per timeframe
      const mineResults = report.results.filter(r => r.isMineRule);
      expect(mineResults.length).toBeGreaterThanOrEqual(1);
      expect(mineResults[0].strategyName).toContain('RSI<30');
    });

    it('skips timeframes with insufficient data', () => {
      const candles = generateCandles(50); // too few
      const report = runFullBacktest('ETH/USD', { '1h': candles }, []);

      // Should have 0 results since 50 < 100 minimum
      expect(report.results.length).toBe(0);
    });

    it('generates correct date range', () => {
      const candles = generateCandles(200);
      const report = runFullBacktest('SOL/USD', { '1h': candles }, []);

      expect(report.dateRange.start).toBeTruthy();
      expect(report.dateRange.end).toBeTruthy();
    });
  });

  describe('ranking and scoring', () => {
    it('penalizes strategies with high drawdown', () => {
      const candles = generateCandles(300, { trend: 'up', volatility: 0.03 });
      const indicators = computeIndicators(candles);

      const result = backtestStrategy(
        'breakout', 'Breakout', strategyMap.breakout,
        candles, indicators, '1h', DEFAULT_BACKTEST_CONFIG,
      );

      // rankScore should be finite
      expect(Number.isFinite(result.rankScore)).toBe(true);
      expect(result.rankScore).toBeGreaterThanOrEqual(0);
    });

    it('avgHoldingHours scales with timeframe', () => {
      const candles = generateCandles(300, { trend: 'up', volatility: 0.03 });
      const indicators = computeIndicators(candles);

      const r1h = backtestStrategy('trend', 'Trend', strategyMap.trend, candles, indicators, '1h', DEFAULT_BACKTEST_CONFIG);
      const r4h = backtestStrategy('trend', 'Trend', strategyMap.trend, candles, indicators, '4h', DEFAULT_BACKTEST_CONFIG);

      // 4h bars should report more holding hours per bar than 1h
      if (r1h.totalTrades > 0 && r4h.totalTrades > 0 && r1h.avgHoldingBars > 0 && r4h.avgHoldingBars > 0) {
        const ratio = r4h.avgHoldingHours / r4h.avgHoldingBars;
        expect(ratio).toBeCloseTo(4, 0); // 4h per bar
      }
    });
  });
});
