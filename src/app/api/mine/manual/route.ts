import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { createMine, getActiveMines, getActiveProfile } from '@/lib/mine/mine-store';
import { placeMarketOrder, getAccountInfo } from '@/lib/mine/execution';
import { getProfile } from '@/lib/mine/utils';
import { checkRisk } from '@/lib/mine/risk-manager';
import { SUPPORTED_SYMBOLS, MIN_TP_SL_RATIO } from '@/lib/mine/constants';
import type { DetectedSignal } from '@/lib/mine/types';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { symbol, direction, strategy, takeProfit, stopLoss } = body;

  // Validate
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: `Unsupported symbol: ${symbol}` }, { status: 400 });
  }
  if (direction !== 'long' && direction !== 'short') {
    return NextResponse.json({ error: 'Direction must be long or short' }, { status: 400 });
  }
  if (!takeProfit || !stopLoss || takeProfit <= 0 || stopLoss <= 0) {
    return NextResponse.json({ error: 'takeProfit and stopLoss required' }, { status: 400 });
  }

  const account = await getAccountInfo();
  if (!account) return NextResponse.json({ error: 'Broker unreachable' }, { status: 502 });

  const profileName = await getActiveProfile();
  const profile = getProfile(profileName);
  const allMines = await getActiveMines();
  const assetMines = allMines.filter((m) => m.symbol === symbol);

  // Build a synthetic signal for risk check
  const signal: DetectedSignal = {
    symbol,
    signal: { type: 'pattern_match', confidence: 1.0, macroClear: true },
    suggestedStrategy: strategy ?? 'trend',
    suggestedTimeframe: '1h',
    suggestedDirection: direction,
    suggestedTp: takeProfit,
    suggestedSl: stopLoss,
  };

  const risk = checkRisk(signal, profile, account.equity, allMines, assetMines);
  if (!risk.allowed) {
    return NextResponse.json({ error: `Risk check failed: ${risk.reason}` }, { status: 400 });
  }

  // Place order
  const order = await placeMarketOrder(symbol, direction, risk.quantity);
  if (!order.success) {
    return NextResponse.json({ error: `Order failed: ${order.error}` }, { status: 502 });
  }

  const mine = await createMine({
    symbol,
    status: order.filledPrice ? 'open' : 'pending',
    strategy: strategy ?? 'trend',
    timeframe: '1h',
    direction,
    entrySignal: { type: 'pattern_match', confidence: 1.0, macroClear: true },
    entryPrice: order.filledPrice,
    entryTime: order.filledPrice ? Date.now() : null,
    entryOrderId: order.orderId,
    takeProfit,
    stopLoss,
    trailingStopPct: null,
    timeoutHours: profile.timeoutHours,
    profile: profileName,
    allocatedCapital: risk.allocatedCapital,
    quantity: risk.quantity,
    unrealizedPnl: 0,
    maxUnrealizedPnl: 0,
    ticksMonitored: 0,
    lastCheck: Date.now(),
    exitPrice: null,
    exitTime: null,
    exitOrderId: null,
    outcome: null,
    realizedPnl: null,
    notes: ['manual entry'],
  });

  return NextResponse.json({ ok: true, mine });
}
