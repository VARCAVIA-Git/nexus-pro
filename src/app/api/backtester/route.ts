// ═══════════════════════════════════════════════════════════════
// Backtester API
// POST { action: 'start'|'status'|'results', preset, config }
// GET  ?id=xxx → status shortcut
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { redisGet, redisSet } from '@/lib/db/redis';
import { runMultiAssetBacktest, type BacktesterConfig, DEFAULT_BT_CONFIG } from '@/lib/engine/backtester';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — long-running

interface JobState {
  id: string;
  phase: 'idle' | 'fetching' | 'preparing' | 'simulating' | 'finalizing' | 'done' | 'error';
  progress: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

const PRESETS: Record<string, string[]> = {
  'btc_only':       ['BTC/USD'],
  'crypto_diverse': ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  'multi_class_5':  ['BTC/USD', 'ETH/USD', 'AAPL', 'NVDA', 'SPY'],
  'multi_class_8':  ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA', 'SPY', 'QQQ'],
};

const JOB_KEY = (id: string) => `nexus:backtester:job:${id}`;
const RESULT_KEY = (id: string) => `nexus:backtester:result:${id}`;

async function setJob(id: string, patch: Partial<JobState>): Promise<void> {
  const cur = (await redisGet<JobState>(JOB_KEY(id))) ?? {
    id, phase: 'idle', progress: 0, message: '',
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const next: JobState = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
  await redisSet(JOB_KEY(id), next, 86400);
}

async function runJob(id: string, config: BacktesterConfig): Promise<void> {
  try {
    await setJob(id, { phase: 'fetching', progress: 0, message: 'Starting...' });
    const result = await runMultiAssetBacktest(config, async (phase, pct, message) => {
      await setJob(id, {
        phase: phase === 'init' || phase === 'fetching' ? 'fetching'
          : phase === 'preparing' ? 'preparing'
          : phase === 'simulating' ? 'simulating'
          : phase === 'finalizing' ? 'finalizing'
          : phase === 'done' ? 'done' : 'simulating',
        progress: pct,
        message,
      });
    });
    await redisSet(RESULT_KEY(id), result, 86400);
    await setJob(id, { phase: 'done', progress: 100, message: `Done: ${result.stats.totalTrades} trades, ${result.stats.totalReturnPct}% return, verdict ${result.verdict}` });
  } catch (err: any) {
    console.error('[BACKTESTER] error:', err.message);
    await setJob(id, { phase: 'error', progress: 0, message: 'Failed', error: err.message });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  if (action === 'start') {
    const preset: string = body.preset ?? 'crypto_diverse';
    const assets: string[] = body.assets ?? PRESETS[preset] ?? PRESETS['crypto_diverse'];
    const validSources = ['strategies', 'deepmap', 'bollinger', 'both'];
    const signalSource = validSources.includes(body.signalSource) ? body.signalSource : 'strategies';
    const config: BacktesterConfig = {
      ...DEFAULT_BT_CONFIG,
      assets,
      months: parseInt(body.months ?? '3'),
      initialCapital: parseFloat(body.initialCapital ?? '10000'),
      riskPerTrade: parseFloat(body.riskPerTrade ?? '1.5'),
      tpMultiplier: parseFloat(body.tpMultiplier ?? '3'),
      slMultiplier: parseFloat(body.slMultiplier ?? '1.5'),
      maxBarsHold: parseInt(body.maxBarsHold ?? '48'),
      minConfidence: parseFloat(body.minConfidence ?? '0.55'),
      signalSource,
    };
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setJob(id, { phase: 'fetching', progress: 0, message: 'Job started' });
    runJob(id, config).catch(err => console.error('[BACKTESTER] background error:', err));
    return NextResponse.json({ ok: true, id, preset, assets });
  }

  if (action === 'status') {
    const id: string | undefined = body.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const job = await redisGet<JobState>(JOB_KEY(id));
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job);
  }

  if (action === 'results') {
    const id: string | undefined = body.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const result = await redisGet(RESULT_KEY(id));
    if (!result) return NextResponse.json({ error: 'No results yet' }, { status: 404 });
    return NextResponse.json(result);
  }

  if (action === 'presets') {
    return NextResponse.json({ presets: PRESETS });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const job = await redisGet<JobState>(JOB_KEY(id));
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job);
  }
  return NextResponse.json({ presets: PRESETS });
}
