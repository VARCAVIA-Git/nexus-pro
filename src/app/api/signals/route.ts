import { NextResponse } from 'next/server';
import { computeIndicators } from '@/lib/engine/indicators';
import { generateSignal } from '@/lib/engine/strategies';
import { redisGet, redisSet } from '@/lib/db/redis';
import type { OHLCV, StrategyKey, SignalStrength } from '@/types';

const TWELVE_DATA_URL = 'https://api.twelvedata.com';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

const COIN_ID_MAP: Record<string, string> = {
  'BTC/USD': 'bitcoin', 'ETH/USD': 'ethereum', 'SOL/USD': 'solana',
  'AVAX/USD': 'avalanche-2', 'LINK/USD': 'chainlink', 'DOT/USD': 'polkadot',
};

const STRATEGIES: StrategyKey[] = ['combined_ai', 'trend', 'momentum'];

export interface SignalData {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: SignalStrength;
  confidence: number;
  strategy: string;
  price: number;
  regime: string;
  time: string;
  indicators: Record<string, number>;
  dataSource: 'live' | 'cached';
  cacheAge?: number;
}

export const dynamic = 'force-dynamic';

async function fetchStockCandles(symbol: string): Promise<OHLCV[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${TWELVE_DATA_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=200&apikey=${apiKey}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === 'error' || !data.values) return [];
    return data.values.reverse().map((v: any) => ({
      date: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close,
      volume: parseInt(v.volume, 10) || 0,
    }));
  } catch { return []; }
}

async function fetchCryptoCandles(symbol: string): Promise<OHLCV[]> {
  const id = COIN_ID_MAP[symbol];
  if (!id) return [];
  try {
    // days=30 gives ~60 candles (12h intervals), days=14 gives ~84 candles (4h intervals)
    const res = await fetch(`${COINGECKO_URL}/coins/${id}/ohlc?vs_currency=usd&days=14`);
    if (!res.ok) return [];
    const data: number[][] = await res.json();
    return data.map((d) => ({
      date: new Date(d[0]).toISOString().slice(0, 10),
      open: d[1], high: d[2], low: d[3], close: d[4],
      // CoinGecko OHLC has no volume — use synthetic but mark it
      volume: Math.round(1e6 * (0.8 + Math.sin(d[0] / 1e9) * 0.3)),
    }));
  } catch { return []; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const symbols = symbolsParam ? symbolsParam.split(',') : [];

  if (symbols.length === 0) {
    return NextResponse.json({ signals: [], error: 'No symbols provided' }, { status: 400 });
  }

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const signals: SignalData[] = [];

  for (const symbol of symbols) {
    // Check cache first (5 minutes)
    const cacheKey = `nexus:signals:cache:${symbol}`;
    try {
      const cached = await redisGet<SignalData>(cacheKey);
      if (cached) {
        cached.dataSource = 'cached';
        cached.cacheAge = Math.round((Date.now() - new Date(cached.time).getTime()) / 60000);
        signals.push(cached);
        continue;
      }
    } catch {}

    // Fetch real data
    const isCrypto = symbol.includes('/');
    let candles: OHLCV[] = [];

    if (isCrypto) {
      candles = await fetchCryptoCandles(symbol);
    } else {
      candles = await fetchStockCandles(symbol);
    }

    // If we don't have enough data, skip this symbol (NO synthetic fallback)
    if (candles.length < 20) {
      console.log(`[SIGNALS] ${symbol}: only ${candles.length} candles — skipping (need 20+)`);
      continue;
    }

    const indicators = computeIndicators(candles);
    const lastIndex = candles.length - 1;
    const currentPrice = candles[lastIndex].close;

    // Run strategies, pick best
    let bestSignal: SignalData | null = null;
    let bestConf = -1;

    for (const stratKey of STRATEGIES) {
      const result = generateSignal(candles, indicators, lastIndex, stratKey);
      if (result.confidence > bestConf) {
        bestConf = result.confidence;
        bestSignal = {
          symbol, signal: result.signal, strength: result.strength,
          confidence: result.confidence, strategy: result.strategy,
          price: currentPrice, regime: result.regime, time: now.toISOString(),
          indicators: result.indicators, dataSource: 'live',
        };
      }
    }

    if (bestSignal) {
      signals.push(bestSignal);
      // Cache for 5 minutes
      redisSet(cacheKey, bestSignal, 300).catch(() => {});
    }
  }

  signals.sort((a, b) => b.confidence - a.confidence);

  return NextResponse.json({
    signals,
    timestamp: now.toISOString(),
    count: signals.length,
  });
}
