import { describe, it, expect } from 'vitest';
import { generateSignalsForAssets, generateSignalSummary } from '@/lib/engine/signals';

describe('generateSignalsForAssets', () => {
  it('should generate signals for provided symbols', () => {
    const signals = generateSignalsForAssets(['BTC/USD', 'ETH/USD']);
    expect(signals.length).toBe(2);

    for (const s of signals) {
      expect(['BUY', 'SELL', 'NEUTRAL']).toContain(s.signal);
      expect(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell']).toContain(s.strength);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.price).toBeGreaterThan(0);
      expect(s.regime).toBeDefined();
      expect(s.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('should sort by confidence descending', () => {
    const signals = generateSignalsForAssets(['BTC/USD', 'ETH/USD', 'AAPL']);
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i].confidence).toBeLessThanOrEqual(signals[i - 1].confidence);
    }
  });

  it('should handle unknown symbols gracefully', () => {
    const signals = generateSignalsForAssets(['UNKNOWN_SYMBOL']);
    expect(signals.length).toBe(1);
    expect(signals[0].price).toBeGreaterThan(0);
  });

  it('should accept custom strategies', () => {
    const signals = generateSignalsForAssets(['BTC/USD'], ['trend', 'momentum']);
    expect(signals.length).toBe(1);
  });
});

describe('generateSignalSummary', () => {
  it('should return a complete summary', () => {
    const summary = generateSignalSummary(['BTC/USD', 'ETH/USD', 'SOL/USD']);
    expect(summary.total).toBe(3);
    expect(summary.buys + summary.sells + summary.neutrals).toBe(summary.total);
    expect(summary.avgConfidence).toBeGreaterThanOrEqual(0);
    expect(summary.avgConfidence).toBeLessThanOrEqual(1);
    expect(summary.signals.length).toBe(3);
  });

  it('should handle empty symbols', () => {
    const summary = generateSignalSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.avgConfidence).toBe(0);
  });
});
