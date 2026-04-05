import { NextResponse } from 'next/server';
import { computeIndicators } from '@/lib/engine/indicators';
import { generateSignal } from '@/lib/engine/strategies';
import { generateAssetOHLCV } from '@/lib/engine/data-generator';
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
  dataSource: 'live' | 'generated';
}

export const dynamic = 'force-dynamic';

/** Fetch OHLCV for a stock from Twelve Data */
async function fetchStockCandles(symbol: string, apiKey: string): Promise<OHLCV[]> {
  const res = await fetch(
    `${TWELVE_DATA_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=250&apikey=${apiKey}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status === 'error' || !data.values) return [];

  return data.values.reverse().map((v: any) => ({
    date: v.datetime.slice(0, 10),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume, 10) || 0,
  }));
}

/** Fetch OHLCV for crypto from CoinGecko */
async function fetchCryptoCandles(symbol: string): Promise<OHLCV[]> {
  const id = COIN_ID_MAP[symbol];
  if (!id) return [];

  const res = await fetch(`${COINGECKO_URL}/coins/${id}/ohlc?vs_currency=usd&days=250`);
  if (!res.ok) return [];
  const data: number[][] = await res.json();

  return data.map((d) => ({
    date: new Date(d[0]).toISOString().slice(0, 10),
    open: d[1],
    high: d[2],
    low: d[3],
    close: d[4],
    volume: 0,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const symbols = symbolsParam ? symbolsParam.split(',') : [];

  if (symbols.length === 0) {
    return NextResponse.json({ signals: [], error: 'No symbols provided' }, { status: 400 });
  }

  const tdKey = process.env.TWELVE_DATA_API_KEY || '';
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const signals: SignalData[] = [];

  // Process each symbol — try live data first, fall back to generated
  for (const symbol of symbols) {
    const isCrypto = symbol.includes('/');
    let candles: OHLCV[] = [];
    let dataSource: 'live' | 'generated' = 'generated';

    // Try live data
    if (isCrypto) {
      candles = await fetchCryptoCandles(symbol);
    } else if (tdKey) {
      candles = await fetchStockCandles(symbol, tdKey);
    }

    if (candles.length >= 60) {
      dataSource = 'live';
    } else {
      // Fallback to GBM-generated data
      const seed = hashCode(symbol + now.toISOString().slice(0, 10));
      candles = generateAssetOHLCV(symbol, 250, '2025-06-01', seed);
    }

    if (candles.length < 60) continue;

    // Add volume if missing (CoinGecko OHLC doesn't include it)
    if (candles.every((c) => c.volume === 0)) {
      candles = candles.map((c, i) => ({
        ...c,
        volume: Math.round(1000000 * (0.5 + Math.sin(i / 10) * 0.3 + Math.random() * 0.4)),
      }));
    }

    const indicators = computeIndicators(candles);
    const lastIndex = candles.length - 1;
    const currentPrice = candles[lastIndex].close;

    // Run each strategy, pick best signal
    let bestSignal: SignalData | null = null;
    let bestConf = -1;

    for (const stratKey of STRATEGIES) {
      const result = generateSignal(candles, indicators, lastIndex, stratKey);
      if (result.confidence > bestConf) {
        bestConf = result.confidence;
        bestSignal = {
          symbol,
          signal: result.signal,
          strength: result.strength,
          confidence: result.confidence,
          strategy: result.strategy,
          price: currentPrice,
          regime: result.regime,
          time: timeStr,
          indicators: result.indicators,
          dataSource,
        };
      }
    }

    if (bestSignal) signals.push(bestSignal);
  }

  signals.sort((a, b) => b.confidence - a.confidence);

  return NextResponse.json({
    signals,
    timestamp: now.toISOString(),
    count: signals.length,
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
