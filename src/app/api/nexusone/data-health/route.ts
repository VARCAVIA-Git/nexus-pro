// NexusOne — Data Health Check
// Returns quality report for all data feeds

import { NextResponse } from 'next/server';
import { checkDataQuality } from '@/lib/nexusone/data/market-data';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const quality = await checkDataQuality('BTC/USD');

  const healthy = quality.bars_ok && quality.funding_ok && quality.price_ok && !quality.stale;

  return NextResponse.json({
    symbol: 'BTC/USD',
    healthy,
    quality,
    checked_at: new Date().toISOString(),
  });
}
