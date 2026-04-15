import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';
import type { BacktestReport } from '@/lib/analytics/backtester/types';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

/**
 * GET /api/analytics/[symbol]/backtest
 *
 * Returns the full backtest report for an asset.
 * Query params:
 *   ?summary=1  — return only rankings (lightweight, for UI listing)
 *   ?strategy=trend&tf=1h — filter results to a specific strategy+timeframe
 */
export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = decodeURIComponent(params.symbol);
  const url = new URL(req.url);
  const summaryOnly = url.searchParams.get('summary') === '1';
  const filterStrategy = url.searchParams.get('strategy');
  const filterTf = url.searchParams.get('tf');

  // Try full backtest report first
  const report = await redisGet<BacktestReport>(`nexus:analytic:backtest:${symbol}`);
  if (!report) {
    // Fallback: check if there's a summary in the main report
    const mainReport = await redisGet<any>(`nexus:analytic:report:${symbol}`);
    if (mainReport?.backtestSummary) {
      return NextResponse.json({ summary: mainReport.backtestSummary });
    }
    return NextResponse.json({ error: 'No backtest data. Run AI training first.' }, { status: 404 });
  }

  if (summaryOnly) {
    return NextResponse.json({
      symbol: report.symbol,
      generatedAt: report.generatedAt,
      dateRange: report.dateRange,
      globalStats: report.globalStats,
      topStrategies: report.topStrategies,
    });
  }

  // Filter if requested
  let results = report.results;
  if (filterStrategy) {
    results = results.filter(r => r.strategyId === filterStrategy);
  }
  if (filterTf) {
    results = results.filter(r => r.timeframe === filterTf);
  }

  return NextResponse.json({
    symbol: report.symbol,
    generatedAt: report.generatedAt,
    config: report.config,
    candleCounts: report.candleCounts,
    dateRange: report.dateRange,
    globalStats: report.globalStats,
    topStrategies: report.topStrategies,
    results,
  });
}
