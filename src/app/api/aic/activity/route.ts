import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import { getAICStatus, getActiveSignals, getConfluence } from '@/lib/mine/aic-client';
import type { BacktestReport } from '@/lib/analytics/backtester/types';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

/**
 * GET /api/aic/activity?symbol=BTC/USD
 *
 * Returns live AI activity feed:
 * - AIC status (online/offline, price, regime)
 * - Active signals being generated
 * - Confluence data
 * - Last backtest summary
 * - Recent signal log from bot runner
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') ?? 'BTC/USD';

  // Fetch all data in parallel
  const [status, signals, confluence, backtestReport, signalLog] = await Promise.all([
    getAICStatus(symbol).catch(() => null),
    getActiveSignals(symbol).catch(() => []),
    getConfluence(symbol).catch(() => null),
    redisGet<BacktestReport>(`nexus:analytic:backtest:${symbol}`).catch(() => null),
    redisGet<any[]>('nexus:signals').catch(() => []),
  ]);

  // Build activity items
  const activities: Array<{
    type: 'signal' | 'analysis' | 'backtest' | 'status';
    time: string;
    message: string;
    detail?: string;
    color?: 'green' | 'red' | 'blue' | 'amber' | 'dim';
  }> = [];

  // AIC status
  if (status) {
    activities.push({
      type: 'status',
      time: new Date().toISOString(),
      message: `AIC ${symbol.replace('/USD', '')} online`,
      detail: `Regime: ${status.regime} · ${status.active_tfs?.length ?? 0} TF attivi`,
      color: 'green',
    });
  } else {
    activities.push({
      type: 'status',
      time: new Date().toISOString(),
      message: `AIC ${symbol.replace('/USD', '')} offline`,
      detail: 'Segnali generati dal motore TypeScript locale',
      color: 'amber',
    });
  }

  // Active signals from AIC
  if (Array.isArray(signals) && signals.length > 0) {
    for (const sig of signals.slice(0, 5)) {
      activities.push({
        type: 'signal',
        time: sig.expires_at ?? new Date().toISOString(),
        message: `${sig.action} ${symbol.replace('/USD', '')} @ $${sig.entry?.toLocaleString() ?? '—'}`,
        detail: `Conf: ${((sig.confidence ?? 0) * 100).toFixed(0)}% · Setup: ${sig.setup_name ?? '—'} · TP: $${sig.TP?.[0]?.toLocaleString() ?? '—'} · SL: $${sig.SL?.toLocaleString() ?? '—'}`,
        color: sig.action === 'LONG' ? 'green' : 'red',
      });
    }
  }

  // Confluence analysis
  if (confluence) {
    const tfList = Object.entries(confluence.tf_biases ?? {})
      .map(([tf, bias]) => `${tf}:${bias === 'BULLISH' ? '▲' : bias === 'BEARISH' ? '▼' : '—'}`)
      .join(' ');
    activities.push({
      type: 'analysis',
      time: new Date().toISOString(),
      message: `Confluence: ${confluence.bias} (${((confluence.score ?? 0) * 100).toFixed(0)}%)`,
      detail: tfList,
      color: confluence.bias === 'BULLISH' ? 'green' : confluence.bias === 'BEARISH' ? 'red' : 'amber',
    });
  }

  // Backtest summary
  if (backtestReport) {
    const top = backtestReport.topStrategies?.[0];
    activities.push({
      type: 'backtest',
      time: new Date(backtestReport.generatedAt).toISOString(),
      message: `Backtest: ${backtestReport.globalStats.totalStrategiesTested} strategie testate`,
      detail: top
        ? `#1: ${top.strategyName} ${top.timeframe} — WR ${top.winRate}% PF ${top.profitFactor} P&L ${top.netProfitPct >= 0 ? '+' : ''}${top.netProfitPct}%`
        : `${backtestReport.globalStats.totalTradesSimulated} trade simulati`,
      color: 'blue',
    });
  }

  // Recent signal log entries for this symbol
  const recentSignals = (Array.isArray(signalLog) ? signalLog : [])
    .filter((s: any) => s?.symbol === symbol)
    .slice(0, 3);
  for (const sig of recentSignals) {
    activities.push({
      type: 'signal',
      time: sig.time,
      message: `Bot: ${sig.signal} ${symbol.replace('/USD', '')} — ${sig.strategy}`,
      detail: sig.acted ? `Eseguito · Conf: ${((sig.confidence ?? 0) * 100).toFixed(0)}%` : `Non eseguito: ${sig.reason ?? 'confidence bassa'}`,
      color: sig.acted ? 'green' : 'dim',
    });
  }

  return NextResponse.json({ activities, symbol });
}
