// ═══════════════════════════════════════════════════════════════
// Bollinger Bot API
// POST { action: 'train', assets: ['BTC','ETH'] } → background training
// POST { action: 'status' } → current job state
// POST { action: 'profile', asset: 'BTC' } → calibrated profile
// POST { action: 'profiles' } → all profiles
// GET  → status
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { redisGet, redisSet } from '@/lib/db/redis';
import { calibrateAsset } from '@/lib/research/bollinger-bot';
import type { BollingerProfile, TrainingJob } from '@/lib/research/bollinger-bot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOB_KEY = 'nexus:bollinger:job';
const PROFILE_KEY = (asset: string) => `nexus:bollinger:profile:${asset}`;
const PROFILES_INDEX_KEY = 'nexus:bollinger:profiles:index';

const ALPACA_DATA = 'https://data.alpaca.markets';

function alpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? process.env.ALPACA_SECRET_KEY ?? '',
  };
}

function isCrypto(asset: string): boolean {
  return asset.includes('/') || ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOT'].includes(asset);
}

function normalizeSymbol(asset: string): string {
  if (!asset.includes('/') && isCrypto(asset)) return `${asset}/USD`;
  return asset;
}

async function fetchHistory(asset: string, years: number): Promise<any[]> {
  const headers = alpacaHeaders();
  if (!headers['APCA-API-KEY-ID']) return [];
  const symbol = normalizeSymbol(asset);
  const crypto = isCrypto(symbol);
  const end = new Date(Date.now() - 16 * 60000);
  const start = new Date(end.getTime() - years * 365 * 86400000);

  const all: any[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  const MAX_PAGES = 50;

  do {
    const params = new URLSearchParams({
      timeframe: '1Hour',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: '10000',
    });
    if (crypto) params.set('symbols', symbol);
    else { params.set('feed', 'iex'); params.set('adjustment', 'split'); }
    if (pageToken) params.set('page_token', pageToken);

    const baseUrl = crypto
      ? `${ALPACA_DATA}/v1beta3/crypto/us/bars`
      : `${ALPACA_DATA}/v2/stocks/${symbol}/bars`;

    try {
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      if (!res.ok) {
        console.log(`[BOLLINGER] ${symbol}: HTTP ${res.status}`);
        break;
      }
      const data = await res.json();
      const bars = crypto ? (data.bars?.[symbol] ?? []) : (data.bars ?? []);
      for (const b of bars) {
        all.push({ date: new Date(b.t).toISOString(), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
      }
      pageToken = data.next_page_token ?? null;
      pages++;
      if (pages >= MAX_PAGES) break;
      if (pageToken) await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.log(`[BOLLINGER] ${symbol} error: ${err.message}`);
      break;
    }
  } while (pageToken);

  console.log(`[BOLLINGER] ${symbol}: ${all.length} candles (${pages} pages)`);
  return all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function setJob(patch: Partial<TrainingJob>): Promise<void> {
  const cur = (await redisGet<TrainingJob>(JOB_KEY)) ?? {
    id: 'job_' + Date.now(), assets: [], phase: 'idle', progress: 0, message: '',
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await redisSet(JOB_KEY, next, 86400);
}

async function runTraining(assets: string[]): Promise<void> {
  try {
    await setJob({ phase: 'fetching', progress: 0, message: `Training on ${assets.length} assets...` });
    const profiles: BollingerProfile[] = [];
    const indexList: string[] = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const symbol = normalizeSymbol(asset);
      const baseProgress = (i / assets.length) * 100;
      await setJob({ phase: 'fetching', progress: Math.round(baseProgress), message: `Fetching ${symbol} (4y)...` });

      const candles = await fetchHistory(asset, 4);
      if (candles.length < 200) {
        console.log(`[BOLLINGER] Skipping ${symbol}: only ${candles.length} candles`);
        continue;
      }

      await setJob({ phase: 'analyzing', progress: Math.round(baseProgress + 5), message: `Calibrating ${symbol} on ${candles.length} candles...` });
      const profile = calibrateAsset(symbol, candles);
      await redisSet(PROFILE_KEY(symbol), profile, 604800); // 7 days
      profiles.push(profile);
      indexList.push(symbol);
    }

    await redisSet(PROFILES_INDEX_KEY, indexList, 604800);
    await setJob({
      phase: 'done', progress: 100,
      message: `Trained ${profiles.length}/${assets.length} profiles`,
      profilesTrained: profiles.length,
    });
  } catch (err: any) {
    console.error('[BOLLINGER] training error:', err.message);
    await setJob({ phase: 'error', progress: 0, message: 'Failed', error: err.message });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'train') {
    const assets: string[] = Array.isArray(body.assets) && body.assets.length > 0 ? body.assets : ['BTC', 'ETH', 'SOL'];
    const cur = await redisGet<TrainingJob>(JOB_KEY);
    if (cur && (cur.phase === 'fetching' || cur.phase === 'analyzing' || cur.phase === 'finalizing')) {
      return NextResponse.json({ error: 'Job already running', job: cur }, { status: 409 });
    }
    const id = 'job_' + Date.now();
    await setJob({ id, assets, phase: 'fetching', progress: 0, message: 'Job started' });
    runTraining(assets).catch(err => console.error('[BOLLINGER] background error:', err));
    return NextResponse.json({ ok: true, id, assets });
  }

  if (action === 'status') {
    const job = await redisGet<TrainingJob>(JOB_KEY);
    return NextResponse.json(job ?? { phase: 'idle', progress: 0, message: 'Not started' });
  }

  if (action === 'profile') {
    const asset = body.asset;
    if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });
    const symbol = normalizeSymbol(asset);
    const profile = await redisGet<BollingerProfile>(PROFILE_KEY(symbol));
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(profile);
  }

  if (action === 'profiles') {
    const index = (await redisGet<string[]>(PROFILES_INDEX_KEY)) ?? [];
    const profiles: BollingerProfile[] = [];
    for (const symbol of index) {
      const p = await redisGet<BollingerProfile>(PROFILE_KEY(symbol));
      if (p) profiles.push(p);
    }
    return NextResponse.json({ profiles, count: profiles.length });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET() {
  const job = await redisGet<TrainingJob>(JOB_KEY);
  return NextResponse.json(job ?? { phase: 'idle', progress: 0, message: 'Not started' });
}
