import { describe, it, expect } from 'vitest';
import { calculatePositionSize } from '@/lib/nexusone/risk-engine';

describe('NexusOne Risk Engine', () => {
  describe('calculatePositionSize', () => {
    it('calculates correct size for 0.5% risk', () => {
      const result = calculatePositionSize(10000, 0.5, 1.0);
      // 0.5% of $10k = $50 risk. SL = 1%. Notional = $50 / 0.01 = $5000
      expect(result.riskAmount).toBe(50);
      expect(result.notional).toBe(5000);
    });

    it('returns 0 notional for 0 SL distance', () => {
      const result = calculatePositionSize(10000, 0.5, 0);
      expect(result.notional).toBe(0);
    });

    it('scales with equity', () => {
      const small = calculatePositionSize(1000, 0.5, 1.0);
      const large = calculatePositionSize(100000, 0.5, 1.0);
      expect(large.notional).toBeGreaterThan(small.notional);
    });

    it('scales with risk %', () => {
      const low = calculatePositionSize(10000, 0.25, 1.0);
      const high = calculatePositionSize(10000, 0.50, 1.0);
      expect(high.riskAmount).toBe(low.riskAmount * 2);
    });
  });
});
