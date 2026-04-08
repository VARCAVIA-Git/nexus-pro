import { NextResponse } from 'next/server';
import type { OHLCV } from '@/types';
import { computeIndicators, detectRegime } from '@/lib/core/indicators';
import { detectPatterns } from '@/lib/core/patterns';
import { generateSignal } from '@/lib/analytics/cognition/strategies';
import { runMTFAnalysis } from '@/lib/analytics/perception/mtf-analysis';
import { getNewsSentiment } from '@/lib/analytics/perception/news-sentiment';
import { checkCalendarForAsset, getEconomicCalendar } from '@/lib/analytics/perception/economic-calendar';
import { getKnowledgeBase } from '@/lib/research/rnd/knowledge-base';
import { downloadHistory } from '@/lib/research/rnd/history-loader';
import { redisGet, redisSet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const CG_URL = 'https://api.coingecko.com/api/v3';
const TD_URL = 'https://api.twelvedata.com';
const COIN_MAP: Record<string, string> = { 'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana', 'LINK/USD': 'chainlink' };
const CG_DAYS: Record<string, number> = { '1m': 1, '5m': 1, '15m': 1, '1h': 2, '4h': 14, '1d': 90, '1w': 365 };
const TD_TF_MAP: Record<string, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };

async function fetchChartData(asset: string, tf: string): Promise<OHLCV[]> {
  const isCrypto = asset.includes('/');

  if (isCrypto) {
    const coinId = COIN_MAP[asset]; if (!coinId) return [];
    const days = CG_DAYS[tf] ?? 14;
    try {
      const res = await fetch(`${CG_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
      if (!res.ok) return [];
      const data: number[][] = await res.json();
      return data.map(k => ({
        date: new Date(k[0]).toISOString().slice(0, 19),
        open: k[1], high: k[2], low: k[3], close: k[4],
        volume: Math.round(1e6 * (0.5 + Math.random() * 0.8)),
      }));
    } catch { return []; }
  }

  const key = process.env.TWELVE_DATA_API_KEY; if (!key) return [];
  const interval = TD_TF_MAP[tf] ?? '1h';
  try {
    const res = await fetch(`${TD_URL}/time_series?symbol=${asset}&interval=${interval}&outputsize=500&apikey=${key}`);
    if (!res.ok) return [];
    const d = await res.json();
    if (d.status === 'error' || !d.values) return [];
    return d.values.reverse().map((v: any) => ({ date: v.datetime, open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: parseInt(v.volume) || 0 }));
  } catch { return []; }
}

export async function POST(request: Request) {
  const { asset, timeframe } = await request.json();
  if (!asset) return NextResponse.json({ error: 'Asset required' }, { status: 400 });
  const tf = timeframe ?? '1h';

  // Cache check
  const cacheKey = `nexus:analysis:${asset}:${tf}`;
  try { const cached = await redisGet(cacheKey); if (cached) return NextResponse.json(cached); } catch {}

  // 1. Fetch chart data
  const chartData = await fetchChartData(asset, tf);

  // Add volume if missing
  if (chartData.length > 0 && chartData.every(c => c.volume === 0)) {
    chartData.forEach((c, i) => { c.volume = Math.round(1e6 * (0.5 + Math.sin(i / 10) * 0.3 + Math.random() * 0.4)); });
  }

  // 2. Compute indicators
  let indicators: any = null;
  let patterns: any[] = [];
  let regime = 'NORMAL';

  if (chartData.length >= 60) {
    const ind = computeIndicators(chartData);
    const n = chartData.length;
    indicators = {
      rsi: ind.rsi.slice(-200),
      macd: { line: ind.macd.line.slice(-200), signal: ind.macd.signal.slice(-200), histogram: ind.macd.histogram.slice(-200) },
      bollinger: { upper: ind.bollinger.upper.slice(-200), middle: ind.bollinger.mid.slice(-200), lower: ind.bollinger.lower.slice(-200) },
      stochastic: { k: ind.stochastic.k.slice(-200), d: ind.stochastic.d.slice(-200) },
      adx: ind.adx.slice(-200),
      ema9: ind.ema9.slice(-200),
      ema21: ind.ema21.slice(-200),
      sma50: ind.sma50.slice(-200),
      sma200: ind.sma200.slice(-200),
      volume: ind.volume.raw.slice(-200),
      volumeAvg: ind.volume.avg20.slice(-200),
    };
    patterns = detectPatterns(chartData).filter(p => p.index >= n - 50);
    regime = detectRegime(ind, n - 1);
  }

  // 3. MTF analysis
  let mtfAnalysis = null;
  try { mtfAnalysis = await runMTFAnalysis(asset); } catch {}

  // 4. News
  let news = null;
  try { news = await getNewsSentiment(asset); } catch {}

  // 5. Calendar
  let calendar: any[] = [];
  let calendarCheck = null;
  try {
    calendar = await getEconomicCalendar();
    calendarCheck = await checkCalendarForAsset(asset);
  } catch {}

  // 6. Generate signal
  let masterSignal = null;
  if (chartData.length >= 60) {
    const ind = computeIndicators(chartData);
    const sig = generateSignal(chartData, ind, chartData.length - 1, 'combined_ai');
    masterSignal = {
      signal: sig.signal,
      strength: sig.strength,
      confidence: sig.confidence,
      strategy: sig.strategy,
      regime: sig.regime,
      indicators: sig.indicators,
    };
  }

  // 7. Knowledge base
  let knowledgeInsights: any[] = [];
  try {
    const kb = await getKnowledgeBase();
    knowledgeInsights = kb.filter(k => k.asset === asset).slice(0, 10);
  } catch {}

  // 8. Training result
  let trainingResult = null;
  try {
    trainingResult = await redisGet(`nexus:rnd:training:${asset}:${tf}:combined_ai`);
  } catch {}

  // Build composite score from MTF
  const score = mtfAnalysis?.compositeScore ?? (masterSignal?.confidence ? Math.round(masterSignal.confidence * 100) : 50);
  const direction = mtfAnalysis?.direction ?? (masterSignal?.signal === 'BUY' ? 'long' : masterSignal?.signal === 'SELL' ? 'short' : 'neutral');

  // Build reasoning
  const reasoning: string[] = [];
  if (mtfAnalysis) {
    reasoning.push(`MTF: ${mtfAnalysis.alignment} alignment — ${Object.values(mtfAnalysis.timeframes).filter(t => t.trend === 'bullish').length}/5 TF bullish`);
  }
  if (indicators?.rsi) {
    const lastRsi = indicators.rsi[indicators.rsi.length - 1];
    if (lastRsi < 30) reasoning.push(`RSI ${lastRsi.toFixed(0)} su ${tf} — oversold, potenziale rimbalzo`);
    else if (lastRsi > 70) reasoning.push(`RSI ${lastRsi.toFixed(0)} su ${tf} — overbought, cautela`);
    else reasoning.push(`RSI ${lastRsi.toFixed(0)} su ${tf} — nella norma`);
  }
  if (indicators?.macd) {
    const lastH = indicators.macd.histogram[indicators.macd.histogram.length - 1];
    reasoning.push(lastH > 0 ? 'MACD histogram positivo — momentum rialzista' : 'MACD histogram negativo — momentum ribassista');
  }
  if (news) {
    reasoning.push(`News sentiment: ${news.score > 20 ? 'positivo' : news.score < -20 ? 'negativo' : 'neutro'} (${news.score})`);
  }
  if (calendarCheck?.nearbyEvents.length) {
    reasoning.push(`Evento imminente: ${calendarCheck.nearbyEvents[0].name}`);
  }
  if (patterns.length > 0) {
    reasoning.push(`Pattern rilevati: ${patterns.slice(-3).map(p => p.type).join(', ')}`);
  }

  const recommendation = score >= 75 ? 'STRONG_BUY' : score >= 60 ? 'BUY' : score <= 25 ? 'STRONG_SELL' : score <= 40 ? 'SELL' : 'HOLD';

  const result = {
    asset, timeframe: tf, score, direction, recommendation, reasoning,
    masterSignal, mtfAnalysis, patterns, news,
    calendar: calendar.slice(0, 5),
    calendarBlocked: calendarCheck?.blocked ?? false,
    trainingResult, knowledgeInsights,
    chartData: chartData.slice(-500),
    indicators,
    regime,
    timestamp: Date.now(),
  };

  // Cache 5 minutes
  redisSet(cacheKey, result, 300).catch(() => {});

  return NextResponse.json(result);
}
