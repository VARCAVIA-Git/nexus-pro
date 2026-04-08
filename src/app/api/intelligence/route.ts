import { NextResponse } from 'next/server';
import { generateAllMasterSignals } from '@/lib/analytics/cognition/master-signal';
import { getEconomicCalendar } from '@/lib/analytics/perception/economic-calendar';

export const dynamic = 'force-dynamic';

const DEFAULT_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetsParam = searchParams.get('assets');
  const assets = assetsParam ? assetsParam.split(',') : DEFAULT_ASSETS;
  const single = searchParams.get('asset');

  try {
    if (single) {
      const [signal] = await generateAllMasterSignals([single]);
      const calendar = await getEconomicCalendar();
      return NextResponse.json({ signal, calendar: calendar.slice(0, 10) });
    }

    const signals = await generateAllMasterSignals(assets);
    const calendar = await getEconomicCalendar();

    return NextResponse.json({
      signals,
      calendar: calendar.slice(0, 15),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ signals: [], calendar: [], error: err.message }, { status: 500 });
  }
}
