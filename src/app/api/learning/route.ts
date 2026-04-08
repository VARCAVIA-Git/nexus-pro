import { NextResponse } from 'next/server';
import { analyzeAllAssets } from '@/lib/analytics/learning/pattern-analyzer';
import { getAdaptiveWeights } from '@/lib/analytics/learning/adaptive-weights';
import { optimizeAllStrategies } from '@/lib/analytics/learning/strategy-optimizer';
import { loadOutcomes } from '@/lib/analytics/learning/outcome-tracker';

export const dynamic = 'force-dynamic';

const DEFAULT_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'NVDA', 'TSLA'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetsParam = searchParams.get('assets');
  const assets = assetsParam ? assetsParam.split(',') : DEFAULT_ASSETS;

  try {
    const allOutcomes = await loadOutcomes();
    const insights = await analyzeAllAssets(assets);

    const weights: Record<string, any> = {};
    const optimizations: Record<string, any> = {};

    for (const asset of assets) {
      weights[asset] = await getAdaptiveWeights(asset);
      const assetOutcomes = allOutcomes.filter(o => o.asset === asset);
      if (assetOutcomes.length >= 10) {
        optimizations[asset] = await optimizeAllStrategies(asset);
      }
    }

    return NextResponse.json({
      totalOutcomes: allOutcomes.length,
      insights,
      weights,
      optimizations,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, totalOutcomes: 0, insights: {}, weights: {}, optimizations: {} }, { status: 500 });
  }
}
