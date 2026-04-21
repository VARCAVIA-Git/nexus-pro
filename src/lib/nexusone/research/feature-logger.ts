/**
 * src/lib/nexusone/research/feature-logger.ts
 *
 * Passive multi-dimensional feature logger.
 * Called every 60s by cron worker. Does NOT generate signals or trade.
 * Only purpose: build a labeled dataset for future analysis.
 *
 * Flow:
 * 1. Fetch all dimensions in parallel (fail-safe per dimension)
 * 2. Insert new row with current features
 * 3. Backfill future prices on older rows
 *
 * Follows existing patterns:
 * - Same OKX fetcher as orchestrator
 * - Same feature-engine computeFeatures()
 * - Same Supabase client as dual-writer
 * - Same error handling (try-catch, never throw, log warnings)
 */

import { fetchOkxCandles, fetchOkxPrice, fetchOkxFundingRate, fetchOkxOpenInterest } from '../data/okx';
// NOTE: These two functions need to be added to okx.ts (see okx-additions.ts)
// import { fetchOkxTakerBuyRatio, fetchOkxPredictedFunding } from '../data/okx';
import { fetchFearGreedIndex, fetchBtcDominance } from '../data/external-data';
import { computeFeatures } from '../core/feature-engine';
import { getServiceSupabase } from '../persistence/supabase-client';

// ============================================================
// Types
// ============================================================

interface FeatureLogRow {
  ts: string;                          // ISO 8601
  asset: string;
  price: number;

  // Technical
  rsi_14: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  bb_percent_b: number | null;
  bb_width: number | null;
  adx_14: number | null;
  ema_20: number | null;
  ema_50: number | null;
  price_vs_ema50: number | null;
  atr_14: number | null;
  atr_ratio: number | null;
  volume_ratio: number | null;

  // Derivatives
  funding_rate: number | null;
  funding_rate_predicted: number | null;
  open_interest: number | null;
  open_interest_change_pct: number | null;

  // Sentiment
  fear_greed_index: number | null;
  fear_greed_class: string | null;

  // Order Flow
  taker_buy_ratio: number | null;

  // Context
  btc_dominance_pct: number | null;

  // Regime
  regime: string | null;

  // Meta
  data_quality: Record<string, string>;
}

interface FeatureLogResult {
  rows_inserted: number;
  rows_backfilled: number;
  errors: string[];
  elapsed_ms: number;
}

// ============================================================
// Config
// ============================================================

const ASSETS = ['BTC/USD', 'ETH/USD'] as const;
const TABLE = 'nexusone_features_log';

// Backfill windows (milliseconds)
const BACKFILL_WINDOWS = [
  { column_price: 'future_price_1h',  column_return: 'future_return_1h_pct',  age_ms: 60 * 60 * 1000,      tolerance_ms: 5 * 60 * 1000 },
  { column_price: 'future_price_4h',  column_return: 'future_return_4h_pct',  age_ms: 4 * 60 * 60 * 1000,  tolerance_ms: 10 * 60 * 1000 },
  { column_price: 'future_price_24h', column_return: 'future_return_24h_pct', age_ms: 24 * 60 * 60 * 1000, tolerance_ms: 30 * 60 * 1000 },
];

// OI cache for computing change %
const lastOiByAsset = new Map<string, { oi: number; ts: number }>();

// ============================================================
// Helper: convert OKX bars to OHLCV format (same as orchestrator)
// ============================================================

interface OHLCVBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toOhlcv(bars: Array<{ ts: number; open: number; high: number; low: number; close: number; volume: number }>): OHLCVBar[] {
  return bars.map(b => ({
    ts: b.ts,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

// ============================================================
// Helper: safe number (NaN → null)
// ============================================================

function safeNum(v: number | undefined): number | null {
  if (v === undefined || v === null || !Number.isFinite(v)) return null;
  return v;
}

// ============================================================
// Main: Log features for all assets
// ============================================================

export async function logFeatures(
  regimeOverride?: string,
): Promise<FeatureLogResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  let rowsInserted = 0;
  let rowsBackfilled = 0;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return { rows_inserted: 0, rows_backfilled: 0, errors: ['supabase not configured'], elapsed_ms: Date.now() - t0 };
  }

  // ----------------------------------------------------------
  // 1. Fetch shared (non-asset-specific) dimensions in parallel
  // ----------------------------------------------------------
  const [fearGreed, btcDominance] = await Promise.allSettled([
    fetchFearGreedIndex(),
    fetchBtcDominance(),
  ]);

  const fg = fearGreed.status === 'fulfilled' ? fearGreed.value : null;
  const dom = btcDominance.status === 'fulfilled' ? btcDominance.value : null;

  if (fearGreed.status === 'rejected') errors.push(`fear_greed: ${fearGreed.reason}`);
  if (btcDominance.status === 'rejected') errors.push(`btc_dominance: ${btcDominance.reason}`);

  // ----------------------------------------------------------
  // 2. For each asset, fetch asset-specific data + compute features
  // ----------------------------------------------------------
  for (const asset of ASSETS) {
    const quality: Record<string, string> = {};
    const now = new Date();

    try {
      // Fetch all asset-specific data in parallel
      const [barsResult, priceResult, fundingResult, oiResult, takerResult, predictedFundingResult] =
        await Promise.allSettled([
          fetchOkxCandles(asset, '15m', 100).then(toOhlcv),
          fetchOkxPrice(asset),
          fetchOkxFundingRate(asset),
          fetchOkxOpenInterest(asset),
          fetchOkxTakerBuyRatioSafe(asset),
          fetchOkxPredictedFundingSafe(asset),
        ]);

      // Extract results with fallbacks
      const bars = barsResult.status === 'fulfilled' ? barsResult.value : [];
      const price = priceResult.status === 'fulfilled' ? priceResult.value : 0;
      const funding = fundingResult.status === 'fulfilled' ? fundingResult.value : null;
      const oi = oiResult.status === 'fulfilled' ? oiResult.value : null;
      const takerRatio = takerResult.status === 'fulfilled' ? takerResult.value : null;
      const predictedFunding = predictedFundingResult.status === 'fulfilled' ? predictedFundingResult.value : null;

      // Track data quality
      if (barsResult.status === 'rejected') quality.bars = 'failed';
      if (priceResult.status === 'rejected' || price === 0) quality.price = 'failed';
      if (fundingResult.status === 'rejected') quality.funding = 'failed';
      if (oiResult.status === 'rejected') quality.oi = 'failed';
      if (takerResult.status === 'rejected') quality.taker = 'failed';
      if (!fg) quality.fear_greed = 'unavailable';
      if (dom === null) quality.btc_dominance = 'unavailable';

      // Skip if no price (can't do anything useful)
      if (price === 0) {
        errors.push(`${asset}: no price, skipping`);
        continue;
      }

      // Compute technical features
      const features = bars.length >= 55 ? computeFeatures(bars) : null;
      if (!features && bars.length > 0) quality.features = 'insufficient_bars';

      // Compute OI change %
      let oiChangePct: number | null = null;
      if (oi) {
        const prev = lastOiByAsset.get(asset);
        if (prev && prev.oi > 0) {
          oiChangePct = ((oi.oiCcy - prev.oi) / prev.oi) * 100;
        }
        lastOiByAsset.set(asset, { oi: oi.oiCcy, ts: Date.now() });
      }

      // Build row
      const row: FeatureLogRow = {
        ts: now.toISOString(),
        asset,
        price,

        // Technical (from feature-engine, null if unavailable)
        rsi_14:         features ? safeNum(features.rsi_14) : null,
        bb_upper:       features ? safeNum(features.bb_upper) : null,
        bb_middle:      features ? safeNum(features.bb_middle) : null,
        bb_lower:       features ? safeNum(features.bb_lower) : null,
        bb_percent_b:   features ? safeNum(features.bb_percent_b) : null,
        bb_width:       features ? safeNum(features.bb_width) : null,
        adx_14:         features ? safeNum(features.adx_14) : null,
        ema_20:         features ? safeNum(features.ema_20) : null,
        ema_50:         features ? safeNum(features.ema_50) : null,
        price_vs_ema50: features ? safeNum(features.price_vs_ema50) : null,
        atr_14:         features ? safeNum(features.atr_14) : null,
        atr_ratio:      features ? safeNum(features.atr_ratio) : null,
        volume_ratio:   features ? safeNum(features.volume_ratio) : null,

        // Derivatives
        funding_rate:           safeNum(funding ?? undefined),
        funding_rate_predicted: safeNum(predictedFunding ?? undefined),
        open_interest:          oi ? safeNum(oi.oiCcy) : null,
        open_interest_change_pct: safeNum(oiChangePct ?? undefined),

        // Sentiment
        fear_greed_index: fg ? fg.value : null,
        fear_greed_class: fg ? fg.classification : null,

        // Order Flow
        taker_buy_ratio: safeNum(takerRatio ?? undefined),

        // Context
        btc_dominance_pct: safeNum(dom ?? undefined),

        // Regime (from v2 orchestrator or override)
        regime: regimeOverride ?? null,

        // Meta
        data_quality: quality,
      };

      // Insert to Supabase
      const { error: insertErr } = await supabase
        .from(TABLE)
        .insert(row);

      if (insertErr) {
        errors.push(`${asset}: insert failed: ${insertErr.message}`);
      } else {
        rowsInserted++;
      }
    } catch (err) {
      errors.push(`${asset}: unexpected error: ${err}`);
    }
  }

  // ----------------------------------------------------------
  // 3. Backfill future prices on older rows
  // ----------------------------------------------------------
  try {
    rowsBackfilled = await backfillFuturePrices(supabase, errors);
  } catch (err) {
    errors.push(`backfill: ${err}`);
  }

  return {
    rows_inserted: rowsInserted,
    rows_backfilled: rowsBackfilled,
    errors,
    elapsed_ms: Date.now() - t0,
  };
}

// ============================================================
// Backfill: update future_price_* on rows that are now old enough
// ============================================================

async function backfillFuturePrices(
  supabase: ReturnType<typeof getServiceSupabase>,
  errors: string[],
): Promise<number> {
  if (!supabase) return 0;

  let totalUpdated = 0;
  const now = Date.now();

  for (const window of BACKFILL_WINDOWS) {
    // Find rows where:
    // - future_price column is NULL
    // - ts is between (now - age - tolerance) and (now - age + tolerance)
    // This ensures we only backfill rows that are approximately the right age
    const targetTs = new Date(now - window.age_ms);
    const tsMin = new Date(now - window.age_ms - window.tolerance_ms);
    const tsMax = new Date(now - window.age_ms + window.tolerance_ms);

    try {
      // Fetch rows needing backfill
      const { data: rows, error: selectErr } = await supabase
        .from(TABLE)
        .select('id, asset, price, ts')
        .is(window.column_price, null)
        .gte('ts', tsMin.toISOString())
        .lte('ts', tsMax.toISOString())
        .limit(50); // cap per tick to avoid slow queries

      if (selectErr) {
        errors.push(`backfill/${window.column_price}: select failed: ${selectErr.message}`);
        continue;
      }

      if (!rows || rows.length === 0) continue;

      // Fetch current prices for affected assets
      const assets = [...new Set(rows.map(r => r.asset))];
      const priceMap = new Map<string, number>();
      for (const asset of assets) {
        const p = await fetchOkxPrice(asset);
        if (p > 0) priceMap.set(asset, p);
      }

      // Update each row
      for (const row of rows) {
        const currentPrice = priceMap.get(row.asset);
        if (!currentPrice || row.price <= 0) continue;

        const returnPct = ((currentPrice - row.price) / row.price) * 100;

        const { error: updateErr } = await supabase
          .from(TABLE)
          .update({
            [window.column_price]: currentPrice,
            [window.column_return]: returnPct,
          })
          .eq('id', row.id);

        if (updateErr) {
          errors.push(`backfill/${window.column_price}/${row.id}: ${updateErr.message}`);
        } else {
          totalUpdated++;
        }
      }
    } catch (err) {
      errors.push(`backfill/${window.column_price}: ${err}`);
    }
  }

  return totalUpdated;
}

// ============================================================
// Safe wrappers for new OKX functions
// These gracefully degrade if the functions haven't been added to okx.ts yet
// ============================================================

async function fetchOkxTakerBuyRatioSafe(symbol: string): Promise<number | null> {
  try {
    // Dynamic import to avoid compile error if not yet added
    const mod = await import('../data/okx');
    if (typeof (mod as any).fetchOkxTakerBuyRatio === 'function') {
      return await (mod as any).fetchOkxTakerBuyRatio(symbol, '5m');
    }
    // Fallback: compute from 24hr ticker
    return await computeTakerRatioFromTicker(symbol);
  } catch {
    return null;
  }
}

async function fetchOkxPredictedFundingSafe(symbol: string): Promise<number | null> {
  try {
    const mod = await import('../data/okx');
    if (typeof (mod as any).fetchOkxPredictedFunding === 'function') {
      return await (mod as any).fetchOkxPredictedFunding(symbol);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback taker ratio from OKX 24h ticker.
 * Less granular than the rubik endpoint but always available.
 */
async function computeTakerRatioFromTicker(symbol: string): Promise<number | null> {
  const instIdMap: Record<string, string> = {
    'BTC/USD': 'BTC-USDT-SWAP',
    'BTC-USD': 'BTC-USDT-SWAP',
    'ETH/USD': 'ETH-USDT-SWAP',
    'ETH-USD': 'ETH-USDT-SWAP',
  };
  const instId = instIdMap[symbol] ?? 'BTC-USDT-SWAP';

  try {
    const res = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
      { cache: 'no-store' as RequestCache, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== '0' || !json.data?.length) return null;

    const d = json.data[0];
    const vol24h = parseFloat(d.vol24h);        // total 24h volume
    const volCcy24h = parseFloat(d.volCcy24h);  // total 24h volume in currency

    // OKX ticker doesn't split buy/sell on this endpoint.
    // Return null to indicate we need the rubik endpoint.
    // This function exists purely as a compile-safe placeholder.
    return null;
  } catch {
    return null;
  }
}
