// NexusOne v3 — Local paper-trading runner.
//
// Long-running process that ticks every minute. On each tick it:
//   1. Fetches latest 250 bars for each (asset, tf) from OKX
//   2. Skips if the most recent close hasn't changed since last tick
//   3. Runs orchestrator.tick() — exits + entries
//   4. (Paper mode + Alpaca-supported asset) places paper limit order
//   5. Persists tuple + portfolio + closed-trade state
//
// Logs to .v3-state/runner.log via PM2 stdout. State to .v3-state/*.json.
//
// Run via PM2:
//   pm2 start scripts/v3-paper-runner.ts --name nexus-v3-paper --interpreter ./node_modules/.bin/tsx
//   pm2 logs nexus-v3-paper
//   pm2 status

import * as dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Load env from .env.local (Alpaca keys, etc.)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import {
  tick as orchestratorTick,
  type StreamSnapshot,
} from '../src/lib/nexusone/v3/orchestrator';
import {
  getMode, loadTuples, saveTuples, loadPortfolio, savePortfolio,
  appendClosedTrades, isLiveApproved, getStateDir,
} from '../src/lib/nexusone/v3/persistence';
import { precompute } from '../src/lib/nexusone/v3/indicators';
import { fetchOkxBars } from '../src/lib/nexusone/v3/data-fetch';
import { placePaperOrder, getPaperAccount } from '../src/lib/nexusone/v3/alpaca-paper';
import { ASSETS_V3, TFS_V3, type AssetV3, type TfV3 } from '../src/lib/nexusone/v3/types';

const TICK_INTERVAL_MS = 60_000; // 1 minute polling
const TF_MIN: Record<TfV3, number> = { '1H': 60, '4H': 240 };

const STATE_DIR = getStateDir();
const LAST_BAR_TS_FILE = path.join(STATE_DIR, 'last_bar_ts.json');
const RUN_LOG = path.join(STATE_DIR, 'runner.log');

function logLine(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(RUN_LOG, line + '\n');
  } catch {}
}

function readLastBarTs(): Record<string, number> {
  try {
    if (fs.existsSync(LAST_BAR_TS_FILE)) return JSON.parse(fs.readFileSync(LAST_BAR_TS_FILE, 'utf8'));
  } catch {}
  return {};
}

function writeLastBarTs(map: Record<string, number>) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LAST_BAR_TS_FILE, JSON.stringify(map));
}

interface SeenBars {
  [streamKey: string]: number;
}

async function tickAll(seen: SeenBars) {
  const mode = await getMode();
  if (mode === 'disabled') return { mode };

  const liveApproved = await isLiveApproved();
  const tuples = await loadTuples();
  const portfolio = await loadPortfolio();

  let totalExits = 0, totalEntries = 0, totalSkipped = 0;
  const placements: any[] = [];

  for (const asset of ASSETS_V3) {
    for (const tf of TFS_V3) {
      const key = `${asset}|${tf}`;
      try {
        const bars = await fetchOkxBars(asset, tf, 250);
        if (bars.length < 250) {
          logLine(`SKIP ${key}: only ${bars.length} bars`);
          totalSkipped++;
          continue;
        }
        // Use the second-to-last bar (last fully-closed)
        const idx = bars.length - 2;
        const closedBarTs = bars[idx].ts;
        if (seen[key] && seen[key] >= closedBarTs) continue; // already processed
        seen[key] = closedBarTs;

        const indicators = precompute(bars);
        const stream: StreamSnapshot = { asset, tf, bars, indicators };
        const result = orchestratorTick({ stream, idx, tuples, portfolio });

        totalExits += result.exits.length;
        totalEntries += result.entries.length;

        if (result.exits.length) await appendClosedTrades(result.exits);

        // Place paper orders for new entries (paper mode only by default)
        for (const e of result.entries) {
          if (mode === 'paper' || (mode === 'live_micro' && !liveApproved) || mode === 'live' && !liveApproved) {
            // Always paper if not live-approved, regardless of mode
            const r = await placePaperOrder(e);
            placements.push({ asset: e.asset, tf: e.tf, dir: e.dir, ...r });
            logLine(`ENTRY ${e.primitive}|${e.asset}|${e.tf} ${e.dir} @ ${e.entryPrice.toFixed(2)} notional=$${e.notional.toFixed(2)} placed=${r.placed} ${r.skipped_reason ?? ''}`);
          } else {
            logLine(`SKIP_ORDER (live not approved or unknown mode) ${e.asset} ${e.tf} ${e.dir}`);
          }
        }
        for (const x of result.exits) {
          logLine(`EXIT ${x.primitive}|${x.asset}|${x.tf} ${x.dir} reason=${x.reason} netBps=${x.netBps.toFixed(1)} netUSD=${x.netDollars.toFixed(2)} equity=$${portfolio.equity.toFixed(0)}`);
        }
      } catch (err: any) {
        logLine(`ERROR ${key}: ${err.message}`);
        totalSkipped++;
      }
    }
  }

  await saveTuples(tuples);
  await savePortfolio(portfolio);

  if (totalExits || totalEntries) {
    const active = tuples.all().filter((t) => t.active).length;
    logLine(`TICK summary mode=${mode} exits=${totalExits} entries=${totalEntries} skip=${totalSkipped} equity=$${portfolio.equity.toFixed(0)} open=${portfolio.open.length} active_tuples=${active}/${tuples.size()}`);
  }
  return { mode, totalExits, totalEntries, placements };
}

async function dailyHealthCheck() {
  const acct = await getPaperAccount();
  const tuples = await loadTuples();
  const p = await loadPortfolio();
  const active = tuples.all().filter((t) => t.active).length;
  logLine(
    `HEALTH alpaca_ok=${acct.ok} alpaca_equity=$${acct.equity?.toFixed(0) ?? '?'} ` +
      `nexus_equity=$${p.equity.toFixed(0)} peak=$${p.peakEquity.toFixed(0)} ` +
      `dd=${(p.maxDrawdownPct * 100).toFixed(2)}% open=${p.open.length} closed=${p.closed.length} active_tuples=${active}/${tuples.size()}`,
  );
}

async function main() {
  logLine('=== NexusOne v3 paper runner started ===');
  logLine(`State dir: ${STATE_DIR}`);
  logLine(`Mode: ${await getMode()}, live_approved: ${await isLiveApproved()}`);

  const acct = await getPaperAccount();
  if (acct.ok) {
    logLine(`Alpaca paper account: equity=$${acct.equity?.toFixed(2)} cash=$${acct.cash?.toFixed(2)} status=${acct.status}`);
  } else {
    logLine(`Alpaca paper account: NOT REACHABLE (${acct.error}). Continuing with simulation-only.`);
  }

  const seen: SeenBars = readLastBarTs();
  let lastHealthDay = '';

  while (true) {
    try {
      await tickAll(seen);
      writeLastBarTs(seen);

      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastHealthDay) {
        await dailyHealthCheck();
        lastHealthDay = today;
      }
    } catch (err: any) {
      logLine(`FATAL tick err: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
  }
}

main().catch((err) => {
  logLine(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
