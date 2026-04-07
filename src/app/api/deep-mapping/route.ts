// ═══════════════════════════════════════════════════════════════
// Deep Mapping API
// POST { action: 'start'|'status'|'results', asset: 'BTC' }
// GET  ?asset=BTC → status shortcut
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { redisGet, redisSet } from '@/lib/db/redis';
import {
  downloadCompleteHistory,
  analyzeAllCandles,
  minePatterns,
} from '@/lib/engine/deep-mapping';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — long-running job

interface JobState {
  asset: string;
  phase: 'idle' | 'downloading' | 'analyzing' | 'mining' | 'finalizing' | 'complete' | 'error';
  progress: number;
  startedAt: string;
  updatedAt: string;
  message: string;
  error?: string;
}

const JOB_KEY = (asset: string) => `nexus:deepmap:job:${asset}`;
const RESULTS_KEY = (asset: string) => `nexus:deepmap:results:${asset}`;
const RULES_KEY = (asset: string) => `nexus:deepmap:rules:${asset}`;

async function setJob(asset: string, patch: Partial<JobState>): Promise<void> {
  const cur = (await redisGet<JobState>(JOB_KEY(asset))) ?? {
    asset, phase: 'idle', progress: 0,
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), message: '',
  };
  const next: JobState = { ...cur, ...patch, asset, updatedAt: new Date().toISOString() };
  await redisSet(JOB_KEY(asset), next, 86400);
}

async function runDeepMapping(asset: string): Promise<void> {
  try {
    await setJob(asset, { phase: 'downloading', progress: 0, message: 'Starting download...' });

    // 1. Download (0-20%)
    const history = await downloadCompleteHistory(asset, async (msg, pct) => {
      await setJob(asset, { phase: 'downloading', progress: Math.round(pct * 0.2), message: msg });
    });

    const candles1h = history['1h'];
    if (candles1h.length < 200) {
      await setJob(asset, { phase: 'error', progress: 0, message: `Insufficient 1h data (${candles1h.length})`, error: 'Need at least 200 candles' });
      return;
    }

    // 2. Analyze (20-60%)
    await setJob(asset, { phase: 'analyzing', progress: 25, message: `Analyzing ${candles1h.length} candles...` });
    const contexts = analyzeAllCandles(candles1h);
    await setJob(asset, { phase: 'analyzing', progress: 60, message: `${contexts.length} contexts built` });

    // 3. Mine patterns (60-80%)
    await setJob(asset, { phase: 'mining', progress: 65, message: 'Mining 2-condition combos...' });
    const rules = minePatterns(contexts);
    await setJob(asset, { phase: 'mining', progress: 80, message: `${rules.length} rules mined` });

    // 4. Global stats (80-90%)
    await setJob(asset, { phase: 'finalizing', progress: 85, message: 'Computing global stats...' });
    const returns24h = contexts.filter(c => c.futureRet24h !== null).map(c => c.futureRet24h as number);
    const avgReturn = returns24h.length > 0 ? returns24h.reduce((a, b) => a + b, 0) / returns24h.length : 0;
    const variance = returns24h.length > 1 ? returns24h.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns24h.length : 0;
    const volatility = Math.sqrt(variance);
    const maxGain = returns24h.length > 0 ? Math.max(...returns24h) : 0;
    const maxLoss = returns24h.length > 0 ? Math.min(...returns24h) : 0;

    // Regime distribution
    const regimeCounts: Record<string, number> = {};
    for (const c of contexts) regimeCounts[c.regime] = (regimeCounts[c.regime] ?? 0) + 1;

    // Hourly profile
    const hourlyProfile: Record<number, { count: number; wins: number; sumRet: number }> = {};
    for (const c of contexts) {
      if (c.futureRet24h === null) continue;
      const h = new Date(c.date).getUTCHours();
      if (!hourlyProfile[h]) hourlyProfile[h] = { count: 0, wins: 0, sumRet: 0 };
      hourlyProfile[h].count++;
      hourlyProfile[h].sumRet += c.futureRet24h;
      if (c.futureRet24h > 0) hourlyProfile[h].wins++;
    }
    const hourly = Object.entries(hourlyProfile).map(([h, d]) => ({
      hour: +h,
      count: d.count,
      winRate: d.count > 0 ? Math.round((d.wins / d.count) * 100) : 0,
      avgReturn: d.count > 0 ? Math.round((d.sumRet / d.count) * 10000) / 100 : 0,
    })).sort((a, b) => a.hour - b.hour);

    // 5. Generate report (90-100%)
    await setJob(asset, { phase: 'finalizing', progress: 95, message: 'Generating report...' });

    const results = {
      asset,
      generatedAt: new Date().toISOString(),
      dataset: {
        '15m': history['15m'].length,
        '1h': history['1h'].length,
        '4h': history['4h'].length,
        '1d': history['1d'].length,
        firstDate: candles1h[0]?.date ?? null,
        lastDate: candles1h[candles1h.length - 1]?.date ?? null,
      },
      stats: {
        contextsAnalyzed: contexts.length,
        avgReturn24h: Math.round(avgReturn * 10000) / 100,
        volatility24h: Math.round(volatility * 10000) / 100,
        maxGain24h: Math.round(maxGain * 10000) / 100,
        maxLoss24h: Math.round(maxLoss * 10000) / 100,
      },
      regimeDistribution: regimeCounts,
      hourlyProfile: hourly,
      topBuyRules: rules.filter(r => r.direction === 'BUY').slice(0, 20),
      topSellRules: rules.filter(r => r.direction === 'SELL').slice(0, 20),
      totalRules: rules.length,
    };

    await redisSet(RESULTS_KEY(asset), results, 604800); // 7 days
    await redisSet(RULES_KEY(asset), rules, 604800);
    await setJob(asset, { phase: 'complete', progress: 100, message: `Done — ${rules.length} rules mined` });
  } catch (err: any) {
    console.error(`[DEEP-MAP] runDeepMapping error: ${err.message}`);
    await setJob(asset, { phase: 'error', progress: 0, message: 'Failed', error: err.message });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, asset } = body;
  if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });

  if (action === 'start') {
    // Check if a job is already running
    const cur = await redisGet<JobState>(JOB_KEY(asset));
    if (cur && (cur.phase === 'downloading' || cur.phase === 'analyzing' || cur.phase === 'mining' || cur.phase === 'finalizing')) {
      return NextResponse.json({ error: 'Job already running', job: cur }, { status: 409 });
    }
    // Fire-and-forget background run
    runDeepMapping(asset).catch(err => console.error('[DEEP-MAP] background error:', err));
    return NextResponse.json({ ok: true, message: 'Job started', asset });
  }

  if (action === 'status') {
    const job = (await redisGet<JobState>(JOB_KEY(asset))) ?? {
      asset, phase: 'idle', progress: 0, startedAt: '', updatedAt: '', message: 'Not started',
    };
    return NextResponse.json(job);
  }

  if (action === 'results') {
    const results = await redisGet(RESULTS_KEY(asset));
    if (!results) return NextResponse.json({ error: 'No results yet' }, { status: 404 });
    return NextResponse.json(results);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset');
  if (!asset) return NextResponse.json({ error: 'asset required' }, { status: 400 });
  const job = (await redisGet<JobState>(JOB_KEY(asset))) ?? {
    asset, phase: 'idle', progress: 0, startedAt: '', updatedAt: '', message: 'Not started',
  };
  return NextResponse.json(job);
}
