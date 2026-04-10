// ═══════════════════════════════════════════════════════════════
// Live Observer (Phase 3)
//
// Calcola il LiveContext per un asset ready:
//   - fetcha le ultime ~100 candele 15m + 50 candele 1h
//   - calcola indicatori, regime, momentum, volatility percentile
//   - matcha le topRules contro lo stato attuale
//   - trova le 3 zone più vicine al prezzo corrente
//   - persiste in nexus:analytic:live:{symbol} con TTL 10 min
//   - aggiorna AssetAnalytic.lastLiveContextAt e currentRegime
//
// Budget: 15 secondi totali per asset.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV } from '@/types';
import { redisGet, redisSet } from '@/lib/db/redis';
import { computeIndicators } from '@/lib/core/indicators';
import { classifyRegime } from '@/lib/analytics/perception/regime-classifier';
import type {
  AnalyticReport,
  AssetAnalytic as AssetAnalyticState,
  LiveContext,
  MinedRule,
  ReactionZone,
} from './types';

const KEY_STATE = (s: string) => `nexus:analytic:${s}`;
const KEY_REPORT = (s: string) => `nexus:analytic:report:${s}`;
const KEY_LIVE = (s: string) => `nexus:analytic:live:${s}`;

const LIVE_TTL_SECONDS = 600; // 10 min
const BUDGET_MS = 15_000;

export interface LiveObserverError extends Error {
  code: 'no-state' | 'no-report' | 'fetch-failed' | 'insufficient-data' | 'budget-exceeded';
}

function makeError(code: LiveObserverError['code'], msg: string): LiveObserverError {
  const e = new Error(msg) as LiveObserverError;
  e.code = code;
  return e;
}

/**
 * Calcola il LiveContext aggiornato per il symbol indicato.
 * Ritorna l'oggetto LiveContext (anche se da fallback all'ultimo valido).
 */
export async function computeLiveContext(symbol: string): Promise<LiveContext> {
  const start = Date.now();
  const state = await redisGet<AssetAnalyticState>(KEY_STATE(symbol));
  if (!state) throw makeError('no-state', `state ${symbol} non trovato`);

  const report = await redisGet<AnalyticReport>(KEY_REPORT(symbol));
  if (!report) throw makeError('no-report', `report ${symbol} non trovato`);

  // Lightweight fetch: solo le ultime 200 candele 1h da Alpaca (1 sola call HTTP).
  // Niente downloadCompleteHistory che scarica 4 anni × 4 timeframe.
  let candles1h: OHLCV[] = [];
  try {
    candles1h = await fetchRecentBars(symbol, '1Hour', 200);
  } catch (e) {
    const fallback = await loadValidLiveContext(symbol);
    if (fallback) {
      console.warn(`[live-observer] ${symbol}: fetch fallito, uso ultimo live valido`);
      return fallback;
    }
    throw makeError('fetch-failed', `fetch fallito: ${(e as Error).message}`);
  }
  if (candles1h.length < 50) {
    const fallback = await loadValidLiveContext(symbol);
    if (fallback) return fallback;
    throw makeError('insufficient-data', `dati insufficienti: 1h=${candles1h.length}`);
  }

  if (Date.now() - start > BUDGET_MS) {
    const last = await redisGet<LiveContext>(KEY_LIVE(symbol));
    if (last) return last;
    throw makeError('budget-exceeded', 'budget 15s superato post-fetch');
  }

  const ind1h = computeIndicators(candles1h);
  const i = candles1h.length - 1;
  const price = candles1h[i].close;

  // Regime corrente
  const regimeAnalysis = classifyRegime(candles1h);
  const regime = regimeAnalysis.regime;

  // Momentum score (-1..+1): media pesata di RSI normalizzato + MACD sign + price vs EMA20
  const rsi = ind1h.rsi[i] ?? 50;
  const macdH = ind1h.macd.histogram[i] ?? 0;
  const ema21 = ind1h.ema21[i];
  const rsiNorm = (rsi - 50) / 50; // -1..+1
  const macdNorm = Math.sign(macdH);
  const emaNorm = ema21 ? Math.max(-1, Math.min(1, (price - ema21) / ema21 * 20)) : 0;
  const momentumScore = round4(0.4 * rsiNorm + 0.3 * macdNorm + 0.3 * emaNorm);

  // Volatility percentile: ATR corrente vs storico ATR (window large)
  const atrSeries = ind1h.atr.filter((v) => v != null && !Number.isNaN(v));
  const currentAtr = ind1h.atr[i] ?? 0;
  const sortedAtr = [...atrSeries].sort((a, b) => a - b);
  const idx = sortedAtr.findIndex((v) => v >= currentAtr);
  const volatilityPercentile =
    sortedAtr.length > 0 ? Math.round(((idx === -1 ? sortedAtr.length : idx) / sortedAtr.length) * 100) : 50;

  // Active rules: itera topRules e marca quelle che matchano lo stato attuale
  const activeRules = matchTopRules(report.topRules ?? [], {
    rsi,
    bbPosition: classifyBB(price, ind1h.bollinger.lower[i], ind1h.bollinger.mid[i], ind1h.bollinger.upper[i]),
    macdSign: Math.sign(macdH) as -1 | 0 | 1,
    adx: ind1h.adx[i] ?? 0,
    stochK: ind1h.stochastic.k[i] ?? 50,
    regime,
    trendShort: classifyTrend(slope(candles1h.map((c) => c.close), i, 5)),
    trendMedium: classifyTrend(slope(candles1h.map((c) => c.close), i, 20)),
    trendLong: classifyTrend(slope(candles1h.map((c) => c.close), i, 50)),
    volume: candles1h[i].volume,
    avgVolume: ind1h.volume.avg20[i] ?? 0,
  });

  // Nearest zones: ±3% dal prezzo corrente, top 3
  const nearestZones = findNearestZones(report.reactionZones ?? [], price, 3, 0.03);

  const liveContext: LiveContext = {
    updatedAt: Date.now(),
    price,
    regime,
    activeRules,
    nearestZones,
    momentumScore,
    volatilityPercentile,
    indicators: {
      rsi: round2(rsi),
      macdHistogram: round4(macdH),
      bbPosition: classifyBB(price, ind1h.bollinger.lower[i], ind1h.bollinger.mid[i], ind1h.bollinger.upper[i]),
      adx: round2(ind1h.adx[i] ?? 0),
      stochK: round2(ind1h.stochastic.k[i] ?? 50),
      atr: round4(currentAtr),
    },
  };

  await redisSet(KEY_LIVE(symbol), liveContext, LIVE_TTL_SECONDS);

  // Update state: lastLiveContextAt + currentRegime + regimeChangedAt
  const updated: AssetAnalyticState = {
    ...state,
    lastLiveContextAt: Date.now(),
    currentRegime: regime,
    regimeChangedAt: state.currentRegime === regime ? state.regimeChangedAt ?? null : Date.now(),
  };
  await redisSet(KEY_STATE(symbol), updated);

  return liveContext;
}

// ── Helpers ─────────────────────────────────────────────────

function slope(closes: number[], i: number, window: number): number {
  if (i < window) return 0;
  const first = closes[i - window];
  const last = closes[i];
  return first > 0 ? (last - first) / first : 0;
}

type Trend = 'STRONG_UP' | 'UP' | 'FLAT' | 'DOWN' | 'STRONG_DOWN';
function classifyTrend(slopeVal: number): Trend {
  if (slopeVal > 0.015) return 'STRONG_UP';
  if (slopeVal > 0.003) return 'UP';
  if (slopeVal < -0.015) return 'STRONG_DOWN';
  if (slopeVal < -0.003) return 'DOWN';
  return 'FLAT';
}

function classifyBB(close: number, lower: number | null, mid: number | null, upper: number | null): string {
  if (lower === null || mid === null || upper === null) return 'AT_MID';
  if (close < lower * 0.998) return 'BELOW_LOWER';
  if (close < lower * 1.005) return 'AT_LOWER';
  if (close < mid * 0.998) return 'LOWER_HALF';
  if (close < mid * 1.002) return 'AT_MID';
  if (close < upper * 0.995) return 'UPPER_HALF';
  if (close < upper * 1.002) return 'AT_UPPER';
  return 'ABOVE_UPPER';
}

interface MatchContext {
  rsi: number;
  bbPosition: string;
  macdSign: -1 | 0 | 1;
  adx: number;
  stochK: number;
  regime: string;
  trendShort: Trend;
  trendMedium: Trend;
  trendLong: Trend;
  volume: number;
  avgVolume: number;
}

/** Valuta una singola condition stringa contro lo stato corrente. */
export function evalCondition(cond: string, ctx: MatchContext): boolean {
  switch (cond) {
    case 'RSI<30': return ctx.rsi < 30;
    case 'RSI<40': return ctx.rsi < 40;
    case 'RSI>60': return ctx.rsi > 60;
    case 'RSI>70': return ctx.rsi > 70;
    case 'BB=BELOW_LOWER': return ctx.bbPosition === 'BELOW_LOWER';
    case 'BB=AT_LOWER': return ctx.bbPosition === 'AT_LOWER';
    case 'BB=LOWER_HALF': return ctx.bbPosition === 'LOWER_HALF';
    case 'BB=AT_UPPER': return ctx.bbPosition === 'AT_UPPER';
    case 'BB=ABOVE_UPPER': return ctx.bbPosition === 'ABOVE_UPPER';
    case 'MACD=CROSS_UP': return ctx.macdSign > 0; // approssimazione live (non abbiamo bar precedente qui)
    case 'MACD=CROSS_DOWN': return ctx.macdSign < 0;
    case 'MACD=ABOVE': return ctx.macdSign > 0;
    case 'MACD=BELOW': return ctx.macdSign < 0;
    case 'TREND_S=UP': return ctx.trendShort === 'UP' || ctx.trendShort === 'STRONG_UP';
    case 'TREND_S=DOWN': return ctx.trendShort === 'DOWN' || ctx.trendShort === 'STRONG_DOWN';
    case 'TREND_M=UP': return ctx.trendMedium === 'UP' || ctx.trendMedium === 'STRONG_UP';
    case 'TREND_M=DOWN': return ctx.trendMedium === 'DOWN' || ctx.trendMedium === 'STRONG_DOWN';
    case 'TREND_L=UP': return ctx.trendLong === 'UP' || ctx.trendLong === 'STRONG_UP';
    case 'TREND_L=DOWN': return ctx.trendLong === 'DOWN' || ctx.trendLong === 'STRONG_DOWN';
    case 'ADX>25': return ctx.adx > 25;
    case 'ADX<15': return ctx.adx < 15;
    case 'VOL=CLIMAX': return ctx.avgVolume > 0 && ctx.volume / ctx.avgVolume > 2.5;
    case 'VOL=HIGH': return ctx.avgVolume > 0 && ctx.volume / ctx.avgVolume > 1.5;
    case 'VOL=DRY': return ctx.avgVolume > 0 && ctx.volume / ctx.avgVolume < 0.5;
    case 'STOCH<20': return ctx.stochK < 20;
    case 'STOCH>80': return ctx.stochK > 80;
    case 'REGIME=TREND_UP': return ctx.regime === 'TRENDING_UP';
    case 'REGIME=TREND_DN': return ctx.regime === 'TRENDING_DOWN';
    case 'REGIME=RANGING': return ctx.regime === 'RANGING';
    case 'REGIME=VOLATILE': return ctx.regime === 'VOLATILE';
    default: return false;
  }
}

export function matchTopRules(rules: MinedRule[], ctx: MatchContext): LiveContext['activeRules'] {
  const out: LiveContext['activeRules'] = [];
  for (const r of rules) {
    let allMatch = true;
    for (const c of r.conditions) {
      if (!evalCondition(c, ctx)) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) continue;
    out.push({
      ruleId: r.id,
      matched: true,
      directionBias: r.direction,
      confidence: r.confidenceScore,
    });
  }
  // Top 10 più affidabili
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 10);
}

export function findNearestZones(zones: ReactionZone[], price: number, max: number, maxDistancePct: number): LiveContext['nearestZones'] {
  const all = zones
    .filter((z) => z && typeof z.priceLevel === 'number')
    .map((z) => ({
      level: z.priceLevel,
      type: z.type,
      distancePct: round4((z.priceLevel - price) / price),
      pBounce: z.bounceProbability ?? 0,
    }))
    .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
  const inside = all.filter((z) => Math.abs(z.distancePct) <= maxDistancePct);
  if (inside.length > 0) return inside.slice(0, max);
  // Phase 3.6: fallback — nessuna zona dentro il range, mostra le 2 più vicine
  // ma solo se entro ±20% (evita zone storiche irrilevanti a -60%)
  const fallbackMax = 0.20;
  const nearby = all.filter((z) => Math.abs(z.distancePct) <= fallbackMax);
  return nearby.slice(0, Math.min(2, max));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Lightweight Alpaca fetcher ──────────────────────────────

const ALPACA_DATA = 'https://data.alpaca.markets';

function isCryptoSymbol(s: string): boolean {
  return s.includes('/') || ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOT'].includes(s);
}

function normalizeSymbol(s: string): string {
  if (!s.includes('/') && isCryptoSymbol(s)) return `${s}/USD`;
  return s;
}

async function fetchRecentBars(symbol: string, timeframe: '15Min' | '1Hour' | '4Hour' | '1Day', limit: number): Promise<OHLCV[]> {
  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? process.env.ALPACA_SECRET_KEY ?? '';
  if (!key || !secret) throw new Error('Alpaca credentials missing');

  const sym = normalizeSymbol(symbol);
  const crypto = isCryptoSymbol(sym);

  // Window: ultime ~3 settimane per essere sicuri di avere `limit` candele 1h
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);

  const params = new URLSearchParams({
    timeframe,
    start: start.toISOString(),
    end: end.toISOString(),
    limit: String(limit),
  });
  if (crypto) params.set('symbols', sym);

  const url = crypto
    ? `${ALPACA_DATA}/v1beta3/crypto/us/bars?${params}`
    : `${ALPACA_DATA}/v2/stocks/${sym}/bars?${params}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Alpaca HTTP ${res.status}`);
    const data = await res.json();
    const bars = crypto ? (data.bars?.[sym] ?? []) : (data.bars ?? []);
    return bars
      .map((b: any) => ({
        date: new Date(b.t).toISOString(),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }))
      .sort((a: OHLCV, b: OHLCV) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-limit);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * Carica un LiveContext valido dalla cache (deve avere il campo `activeRules`).
 * Filtra esplicitamente i buffer legacy Phase 2 che erano array di snapshot.
 */
async function loadValidLiveContext(symbol: string): Promise<LiveContext | null> {
  const raw = await redisGet<unknown>(KEY_LIVE(symbol));
  if (!raw || Array.isArray(raw)) return null;
  if (typeof raw !== 'object') return null;
  if (!('activeRules' in (raw as any))) return null;
  return raw as LiveContext;
}
