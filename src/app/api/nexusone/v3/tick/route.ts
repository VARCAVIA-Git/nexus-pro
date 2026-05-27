// NexusOne v3 — tick endpoint
//
// Called by cron worker on every 1H and 4H bar close (or every minute,
// the orchestrator only acts when a fresh bar is available).
//
// Flow:
//   1. Read mode from Redis (`disabled` skips everything)
//   2. For each (asset, tf) stream, fetch latest 250 bars
//   3. Build indicators, evaluate exits + entries via orchestrator
//   4. Persist tuple + portfolio state back to Redis
//   5. (Paper mode) record signals; (Live mode) place orders via broker
//
// Live order placement is intentionally NOT wired here. To go live,
// implement the broker call in `placeBrokerOrder()` and gate it on
// `mode === 'live'` AND the explicit Redis flag `nexusone:v3:approve_live = true`.

import { NextResponse } from 'next/server';
import { fetchBars } from '@/lib/nexusone/data/market-data';
import {
  tick as orchestratorTick,
  makeFreshPortfolio,
  type StreamSnapshot,
} from '@/lib/nexusone/v3/orchestrator';
import {
  getMode, loadTuples, saveTuples, loadPortfolio, savePortfolio, appendClosedTrades,
} from '@/lib/nexusone/v3/persistence';
import { precompute } from '@/lib/nexusone/v3/indicators';
import { ASSETS_V3, TFS_V3, type AssetV3, type BarV3, type TfV3 } from '@/lib/nexusone/v3/types';
import { redisGet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

function authorized(req: Request): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  return req.headers.get('x-cron-secret') === required;
}

async function fetchStream(asset: AssetV3, tf: TfV3): Promise<BarV3[]> {
  const bars = await fetchBars(asset, tf.toLowerCase().replace('h', 'h'), 250);
  return bars.map((b) => ({
    ts: b.ts_open, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }));
}

interface TickReport {
  mode: string;
  streams_processed: number;
  exits: number;
  entries: number;
  equity: number;
  open_positions: number;
  active_tuples: number;
  errors: string[];
}

async function placeBrokerOrder(_entry: unknown, _live: boolean): Promise<void> {
  // Intentional no-op until live activation. Paper trading only records signals.
  // To wire live: import alpaca client, place limit order, poll fill, update entry.actualPrice.
}

async function handleTick(): Promise<TickReport> {
  const mode = await getMode();
  const errors: string[] = [];
  if (mode === 'disabled') {
    return { mode, streams_processed: 0, exits: 0, entries: 0, equity: 0, open_positions: 0, active_tuples: 0, errors };
  }

  const tuples = await loadTuples();
  const portfolio = await loadPortfolio();

  // For live (not live_micro / paper), require explicit approval flag.
  const approveLive = await redisGet<string | boolean>('nexusone:v3:approve_live');
  const isLive = mode === 'live' && (approveLive === true || approveLive === 'true');

  let totalExits = 0, totalEntries = 0, totalStreams = 0;

  for (const asset of ASSETS_V3) {
    for (const tf of TFS_V3) {
      try {
        const bars = await fetchStream(asset, tf);
        if (bars.length < 250) { errors.push(`${asset} ${tf}: only ${bars.length} bars`); continue; }
        const indicators = precompute(bars);
        const stream: StreamSnapshot = { asset, tf, bars, indicators };
        const idx = bars.length - 2; // last fully-closed bar
        const result = orchestratorTick({ stream, idx, tuples, portfolio });

        totalStreams++;
        totalExits += result.exits.length;
        totalEntries += result.entries.length;
        if (result.exits.length) await appendClosedTrades(result.exits);

        // Place broker orders for new entries when live; paper just persists.
        if (mode !== 'paper' && result.entries.length) {
          for (const e of result.entries) {
            await placeBrokerOrder(e, isLive);
          }
        }
      } catch (err: any) {
        errors.push(`${asset} ${tf}: ${err.message}`);
      }
    }
  }

  await saveTuples(tuples);
  await savePortfolio(portfolio);

  return {
    mode, streams_processed: totalStreams,
    exits: totalExits, entries: totalEntries,
    equity: Math.round(portfolio.equity),
    open_positions: portfolio.open.length,
    active_tuples: tuples.all().filter((t) => t.active).length,
    errors,
  };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const report = await handleTick();
    return NextResponse.json({ ok: true, ...report });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
