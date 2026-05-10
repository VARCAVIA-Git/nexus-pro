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

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
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
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
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
