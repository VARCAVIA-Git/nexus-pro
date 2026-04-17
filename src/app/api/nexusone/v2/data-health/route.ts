// NexusOne v2 — data health. Reads fresh (no-store) data each call.
import { NextResponse } from 'next/server';
import { fetchOkxCandles, fetchOkxPrice } from '@/lib/nexusone/data/okx';
import { isFreshEnough, priceWithinBand } from '@/lib/nexusone/core/data-validators';

export const dynamic = 'force-dynamic';

const ASSETS = ['BTC/USD', 'ETH/USD'];

export async function GET(): Promise<Response> {
  const now = Date.now();
  const report = await Promise.all(
    ASSETS.map(async asset => {
      const [bars15m, bars1h, priceOkx] = await Promise.all([
        fetchOkxCandles(asset, '15m', 50),
        fetchOkxCandles(asset, '1h', 50),
        fetchOkxPrice(asset),
      ]);
      const age15 = bars15m.length ? now - bars15m[bars15m.length - 1].ts : Infinity;
      const age1h = bars1h.length ? now - bars1h[bars1h.length - 1].ts : Infinity;
      const fresh15 = isFreshEnough(bars15m, 15, now);
      const fresh1h = isFreshEnough(bars1h, 60, now);
      const lastClose = bars15m.length ? bars15m[bars15m.length - 1].close : 0;
      return {
        asset,
        bars_15m: {
          count: bars15m.length,
          latest_age_s: Math.round(age15 / 1000),
          fresh: fresh15,
          latest_close: lastClose,
        },
        bars_1h: {
          count: bars1h.length,
          latest_age_s: Math.round(age1h / 1000),
          fresh: fresh1h,
        },
        price_okx: priceOkx,
        bar_ticker_consistent: lastClose > 0 && priceOkx > 0 ? priceWithinBand(lastClose, priceOkx, 0.01) : false,
      };
    }),
  );

  const healthy = report.every(r => r.bars_15m.fresh && r.bars_1h.fresh && r.price_okx > 0 && r.bar_ticker_consistent);
  return NextResponse.json({ healthy, checked_at: new Date().toISOString(), assets: report });
}
