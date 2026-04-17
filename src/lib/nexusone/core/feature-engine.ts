// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Feature Engine
//
// Pure functions: input OHLCV bars (oldest → newest), output a
// single Features snapshot at the most recent bar.
//
// All indicators are recomputed from scratch each tick — the
// bar set is small (~100 bars) so the O(n) cost is negligible
// compared to network latency.
// ═══════════════════════════════════════════════════════════════

export interface OHLCVBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Features {
  // Bollinger Bands (20, 2.0)
  bb_upper: number;
  bb_middle: number;
  bb_lower: number;
  bb_width: number;      // (upper - lower) / middle
  bb_percent_b: number;  // (price - lower) / (upper - lower)

  // RSI
  rsi_14: number;

  // Volume
  volume_ratio: number;  // current volume / SMA(volume, 20)

  // Trend
  adx_14: number;
  ema_20: number;
  ema_50: number;
  price_vs_ema50: number; // (price - ema50) / ema50

  // Volatility
  atr_14: number;
  atr_ratio: number; // ATR(14) / ATR(50)

  // Raw price anchor
  price: number;
  ts: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function stddev(values: number[], period: number, mean: number): number {
  if (values.length < period) return NaN;
  let sumSq = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / period);
}

// Wilder-style EMA used for RSI, ADX, ATR; reg. EMA for trend following.
function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// RSI (Wilder) — returns the most recent value.
export function rsi(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return NaN;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ATR (Wilder) — returns the most recent value.
export function atr(bars: OHLCVBar[], period: number = 14): number {
  if (bars.length < period + 1) return NaN;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let smoothed = 0;
  for (let i = 0; i < period; i++) smoothed += trs[i];
  smoothed /= period;
  for (let i = period; i < trs.length; i++) {
    smoothed = (smoothed * (period - 1) + trs[i]) / period;
  }
  return smoothed;
}

// ADX (Wilder). Returns the most recent value.
export function adx(bars: OHLCVBar[], period: number = 14): number {
  if (bars.length < period * 2 + 1) return NaN;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  // Wilder smoothing for +DM, -DM and TR
  const wilder = (arr: number[], p: number): number[] => {
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += arr[i];
    out.push(sum);
    for (let i = p; i < arr.length; i++) {
      sum = sum - sum / p + arr[i];
      out.push(sum);
    }
    return out;
  };

  const trS = wilder(tr, period);
  const plusDMs = wilder(plusDM, period);
  const minusDMs = wilder(minusDM, period);

  const dxs: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    const plusDI = (plusDMs[i] / trS[i]) * 100;
    const minusDI = (minusDMs[i] / trS[i]) * 100;
    const denom = plusDI + minusDI;
    dxs.push(denom === 0 ? 0 : (Math.abs(plusDI - minusDI) / denom) * 100);
  }

  if (dxs.length < period) return NaN;
  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dxs[i];
  adxVal /= period;
  for (let i = period; i < dxs.length; i++) {
    adxVal = (adxVal * (period - 1) + dxs[i]) / period;
  }
  return adxVal;
}

// ─── Main ─────────────────────────────────────────────────────

export function computeFeatures(bars: OHLCVBar[]): Features | null {
  if (bars.length < 55) return null; // need ATR(50) lookback

  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const price = closes[closes.length - 1];

  // Bollinger Bands (20, 2)
  const bbMid = sma(closes, 20);
  const bbStd = stddev(closes, 20, bbMid);
  const bbUpper = bbMid + 2 * bbStd;
  const bbLower = bbMid - 2 * bbStd;
  const bbWidth = (bbUpper - bbLower) / bbMid;
  const bbPercentB = (price - bbLower) / (bbUpper - bbLower);

  // RSI(14)
  const rsi14 = rsi(closes, 14);

  // Volume ratio
  const volSma20 = sma(volumes, 20);
  const volumeRatio = volSma20 > 0 ? volumes[volumes.length - 1] / volSma20 : 1;

  // Trend
  const ema20Series = emaSeries(closes, 20);
  const ema50Series = emaSeries(closes, 50);
  const ema20 = ema20Series[ema20Series.length - 1];
  const ema50 = ema50Series[ema50Series.length - 1];
  const priceVsEma50 = (price - ema50) / ema50;

  // Volatility
  const atr14 = atr(bars, 14);
  const atr50 = atr(bars, 50);
  const atrRatio = atr50 > 0 ? atr14 / atr50 : NaN;

  // ADX
  const adx14 = adx(bars, 14);

  return {
    bb_upper: bbUpper,
    bb_middle: bbMid,
    bb_lower: bbLower,
    bb_width: bbWidth,
    bb_percent_b: bbPercentB,
    rsi_14: rsi14,
    volume_ratio: volumeRatio,
    adx_14: adx14,
    ema_20: ema20,
    ema_50: ema50,
    price_vs_ema50: priceVsEma50,
    atr_14: atr14,
    atr_ratio: atrRatio,
    price,
    ts: bars[bars.length - 1].ts,
  };
}
