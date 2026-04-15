// ═══════════════════════════════════════════════════════════════
// NexusOne — Signal Engine
//
// Calculates signals ONLY from approved strategies in the registry.
// No mining. No discovery. No improvisation.
//
// For each bar close:
//   1. Get active strategy from registry
//   2. Fetch required data
//   3. Calculate features
//   4. Evaluate trigger
//   5. If triggered → create SignalEvent → send to execution
// ═══════════════════════════════════════════════════════════════

import type { SignalEvent, MarketBar } from './types';
import { getActiveStrategy } from './strategy-registry';
import { calcS1Features, evaluateS1Trigger } from './strategies/s1';
import { calcS5Features, evaluateS5Trigger } from './strategies/s5-rsi-bidir';
import { getKillSwitch } from './risk-engine';
import { redisSet, redisGet } from '@/lib/db/redis';

const KEY_LAST_SIGNAL = 'nexusone:signal:last';
const KEY_COOLDOWN = 'nexusone:signal:cooldown_until';
const SIGNAL_TTL = 86400; // 24h

export interface SignalEngineResult {
  evaluated: boolean;
  strategy_id: string | null;
  signal: SignalEvent | null;
  skipped_reason: string | null;
  features: Record<string, number> | null;
}

/**
 * Evaluate the active strategy against current market data.
 * Called by the signal worker every bar close.
 */
export async function evaluateSignal(
  bars: MarketBar[],
  fundingRates: number[],
): Promise<SignalEngineResult> {
  const noSignal = (reason: string): SignalEngineResult => ({
    evaluated: true,
    strategy_id: null,
    signal: null,
    skipped_reason: reason,
    features: null,
  });

  // 1. Get active strategy
  const strategy = await getActiveStrategy();
  if (!strategy) return noSignal('no active strategy');
  if (strategy.status === 'disabled') return noSignal('strategy disabled');

  // 2. Check kill switch
  const killSwitch = await getKillSwitch();
  if (killSwitch.triggered) return noSignal(`kill switch: ${killSwitch.reason}`);

  // 3. Check cooldown
  const cooldownUntil = await redisGet<number>(KEY_COOLDOWN);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    return noSignal('cooldown active');
  }

  // 4. Calculate features (strategy-specific)
  if (strategy.id.startsWith('S1')) {
    const features = calcS1Features(bars, fundingRates);
    if (!features) return noSignal('insufficient data for features');

    // 5. Evaluate trigger
    const signal = evaluateS1Trigger(features);

    if (signal) {
      // Save signal event
      await redisSet(`nexusone:signal:${signal.id}`, signal, SIGNAL_TTL);
      await redisSet(KEY_LAST_SIGNAL, signal, SIGNAL_TTL);

      // Set cooldown
      const cooldownMs = strategy.risk.cooldown_bars *
        (strategy.timeframe === '5m' ? 5 * 60_000 : 60 * 60_000);
      await redisSet(KEY_COOLDOWN, Date.now() + cooldownMs, SIGNAL_TTL);

      console.log(`[nexusone-signal] TRIGGER: ${strategy.id} funding_z=${features.funding_zscore} ac1=${features.ac1}`);

      return {
        evaluated: true,
        strategy_id: strategy.id,
        signal,
        skipped_reason: null,
        features: features as any,
      };
    }

    return {
      evaluated: true,
      strategy_id: strategy.id,
      signal: null,
      skipped_reason: `no trigger (funding_z=${features.funding_zscore} ac1=${features.ac1})`,
      features: features as any,
    };
  }

  // S5: RSI Bidirectional
  if (strategy.id.startsWith('S5')) {
    const features = calcS5Features(bars);
    if (!features) return noSignal('insufficient data for S5 features');

    const signal = evaluateS5Trigger(features);

    if (signal) {
      await redisSet(`nexusone:signal:${signal.id}`, signal, SIGNAL_TTL);
      await redisSet(KEY_LAST_SIGNAL, signal, SIGNAL_TTL);

      const cooldownMs = strategy.risk.cooldown_bars *
        (strategy.timeframe === '5m' ? 5 * 60_000 : 60 * 60_000);
      await redisSet(KEY_COOLDOWN, Date.now() + cooldownMs, SIGNAL_TTL);

      console.log(`[nexusone-signal] TRIGGER: ${strategy.id} rsi=${features.rsi.toFixed(1)} dir=${features.direction}`);

      return {
        evaluated: true,
        strategy_id: strategy.id,
        signal,
        skipped_reason: null,
        features: features as any,
      };
    }

    return {
      evaluated: true,
      strategy_id: strategy.id,
      signal: null,
      skipped_reason: `no trigger (rsi=${features.rsi.toFixed(1)})`,
      features: features as any,
    };
  }

  return noSignal(`unknown strategy type: ${strategy.id}`);
}
