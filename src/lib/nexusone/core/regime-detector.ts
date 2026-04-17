// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Regime Detector
//
// Classifies the market into one of four regimes from 1h features
// and applies hysteresis: the regime changes only after the new
// candidate regime has held for `HYSTERESIS_BARS` 1h observations
// in a row. This prevents whipsaw around threshold values.
//
// The detector is stateful across ticks; state lives in Redis
// under `nexusone:v2:regime`.
// ═══════════════════════════════════════════════════════════════

import { redisGet, redisSet } from '@/lib/db/redis';
import type { Features } from './feature-engine';

export type Regime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'CHOPPY';

export interface RegimeState {
  current: Regime;
  candidate: Regime;
  candidate_bars: number; // how many 1h bars the candidate has held
  last_bar_ts: number;
  updated_at: number;
}

const KEY_REGIME = 'nexusone:v2:regime';
const HYSTERESIS_BARS = 3;
const TTL = 60 * 60 * 24 * 7; // 7 days

export function classifyRaw(features1h: Features): Regime {
  const { adx_14, price, ema_20, ema_50, atr_ratio, bb_width } = features1h;

  // CHOPPY: high volatility with mid ADX — pause all crypto strategies.
  if (adx_14 >= 20 && adx_14 <= 25 && atr_ratio > 2.0) return 'CHOPPY';

  if (adx_14 > 25) {
    if (price > ema_50 && ema_20 > ema_50) return 'TRENDING_UP';
    if (price < ema_50 && ema_20 < ema_50) return 'TRENDING_DOWN';
  }

  // RANGING: low ADX and contracting BB width (we use a conservative
  // absolute threshold since `bb_width` is already normalized by middle).
  if (adx_14 < 20 && bb_width < 0.05) return 'RANGING';

  // Fallback: ambiguous zone → treat as CHOPPY for safety.
  return 'CHOPPY';
}

export async function getRegimeState(): Promise<RegimeState | null> {
  return redisGet<RegimeState>(KEY_REGIME);
}

export async function updateRegime(features1h: Features): Promise<RegimeState> {
  const now = Date.now();
  const raw = classifyRaw(features1h);
  const prev = await getRegimeState();

  if (!prev) {
    const state: RegimeState = {
      current: raw,
      candidate: raw,
      candidate_bars: HYSTERESIS_BARS,
      last_bar_ts: features1h.ts,
      updated_at: now,
    };
    await redisSet(KEY_REGIME, state, TTL);
    return state;
  }

  // Only count a new observation when the 1h bar timestamp advances,
  // so multiple ticks inside the same hour do not inflate the counter.
  const newBar = features1h.ts > prev.last_bar_ts;

  let candidate = prev.candidate;
  let bars = prev.candidate_bars;

  if (newBar) {
    if (raw === prev.current) {
      candidate = raw;
      bars = HYSTERESIS_BARS;
    } else if (raw === candidate) {
      bars = Math.min(bars + 1, HYSTERESIS_BARS);
    } else {
      candidate = raw;
      bars = 1;
    }
  }

  const current = bars >= HYSTERESIS_BARS ? candidate : prev.current;
  const next: RegimeState = {
    current,
    candidate,
    candidate_bars: bars,
    last_bar_ts: newBar ? features1h.ts : prev.last_bar_ts,
    updated_at: now,
  };
  await redisSet(KEY_REGIME, next, TTL);
  return next;
}
