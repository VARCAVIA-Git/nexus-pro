// NexusOne v3 — persistence (file-backed, no external deps).
//
// State files live in $NEXUS_V3_STATE_DIR (default: <cwd>/.v3-state):
//   mode.json       — current mode
//   tuples.json     — tuple ledger
//   portfolio.json  — equity, open positions, risk state
//   closed.json     — last 1000 closed trades
//   approve_live    — presence (any content) means live is approved
//
// Why files: paper trading is a single-process workload. Files survive
// PM2 restarts, are diffable, and don't require running a Redis daemon.

import fs from 'node:fs';
import path from 'node:path';
import { TupleManagerV3 } from './tuple-manager';
import { type PortfolioState, makeFreshPortfolio } from './orchestrator';
import type { ClosedTradeV3 } from './types';
import { DEFAULT_RISK_V3 } from './risk';

export type NexusV3Mode = 'disabled' | 'paper' | 'live_micro' | 'live';

const STATE_DIR = process.env.NEXUS_V3_STATE_DIR
  ?? path.join(process.cwd(), '.v3-state');

let dirReady = false;
function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!dirReady) {
    // Clean orphan .tmp files from previous crashes
    try {
      for (const f of fs.readdirSync(STATE_DIR)) {
        if (f.endsWith('.tmp')) {
          try { fs.unlinkSync(path.join(STATE_DIR, f)); } catch {}
        }
      }
    } catch {}
    dirReady = true;
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const p = path.join(STATE_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  const p = path.join(STATE_DIR, file);
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeSync(fd, payload);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, p);
      return;
    } catch (err) {
      lastErr = err;
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
  throw lastErr;
}

export async function getMode(): Promise<NexusV3Mode> {
  return readJson<NexusV3Mode>('mode.json', 'disabled');
}

export async function setMode(mode: NexusV3Mode): Promise<void> {
  writeJson('mode.json', mode);
}

export async function loadTuples(): Promise<TupleManagerV3> {
  const m = new TupleManagerV3();
  const data = readJson<unknown>('tuples.json', null);
  if (data) m.deserialize(JSON.stringify(data));
  return m;
}

export async function saveTuples(m: TupleManagerV3): Promise<void> {
  writeJson('tuples.json', JSON.parse(m.serialize()));
}

export async function loadPortfolio(): Promise<PortfolioState> {
  const raw = readJson<PortfolioState | null>('portfolio.json', null);
  if (!raw) return makeFreshPortfolio(DEFAULT_RISK_V3);
  if (!raw.cfg) raw.cfg = DEFAULT_RISK_V3;
  if (!raw.riskState) raw.riskState = { haltedUntilTs: 0, consecutiveLosses: 0, dailyPnL: {}, weeklyPnL: {} };
  return raw;
}

export async function savePortfolio(p: PortfolioState): Promise<void> {
  writeJson('portfolio.json', p);
}

export async function appendClosedTrades(trades: ClosedTradeV3[]): Promise<void> {
  if (trades.length === 0) return;
  const existing = readJson<ClosedTradeV3[]>('closed.json', []);
  const merged = [...trades, ...existing].slice(0, 1000);
  writeJson('closed.json', merged);
}

export async function readClosedTrades(): Promise<ClosedTradeV3[]> {
  return readJson<ClosedTradeV3[]>('closed.json', []);
}

export async function isLiveApproved(): Promise<boolean> {
  ensureDir();
  return fs.existsSync(path.join(STATE_DIR, 'approve_live'));
}

export function getStateDir(): string {
  return STATE_DIR;
}

export interface HeartbeatV3 {
  ts: number;
  mode: NexusV3Mode;
  equity: number;
  peakEquity: number;
  drawdownPct: number;
  openCount: number;
  closedCount: number;
  activeTuples: number;
  totalTuples: number;
}

export function writeHeartbeat(h: HeartbeatV3): void {
  writeJson('heartbeat.json', h);
}

export function appendEquitySnapshot(row: {
  ts: number; equity: number; peakEquity: number; drawdownPct: number;
  openCount: number; closedCount: number; activeTuples: number;
}): void {
  ensureDir();
  const file = path.join(STATE_DIR, 'equity-snapshots.csv');
  const header = 'ts,iso,equity,peak_equity,drawdown_pct,open_count,closed_count,active_tuples\n';
  const exists = fs.existsSync(file);
  const iso = new Date(row.ts).toISOString();
  const line = `${row.ts},${iso},${row.equity.toFixed(4)},${row.peakEquity.toFixed(4)},${row.drawdownPct.toFixed(6)},${row.openCount},${row.closedCount},${row.activeTuples}\n`;
  fs.appendFileSync(file, exists ? line : header + line);
}
