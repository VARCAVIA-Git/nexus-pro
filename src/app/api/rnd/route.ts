import { NextResponse } from 'next/server';
import {
  populateWarehouse, getWarehouseStatus, ALL_ASSETS, RESEARCH_TFS,
  scanIndicators, mapPatterns, analyzeEventReactions,
  buildAssetKnowledge, saveKnowledgeBase, getKnowledgeBase,
  downloadHistory, TRAINABLE_ASSETS, TRAINABLE_TFS,
  trainStrategy, runFullTraining, FAMOUS_STRATEGIES,
} from '@/lib/engine/rnd';
import type { StrategyKey } from '@/types';
import { redisGet, KEYS } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? 'status';
  const asset = searchParams.get('asset');

  if (action === 'status') {
    const status = getWarehouseStatus();
    const knowledge = await getKnowledgeBase();
    return NextResponse.json({ warehouse: status, knowledgeEntries: knowledge.length });
  }

  if (action === 'knowledge') return NextResponse.json({ knowledge: await getKnowledgeBase(), total: (await getKnowledgeBase()).length });
  if (action === 'indicators' && asset) return NextResponse.json({ asset, indicators: await redisGet(KEYS.scanResults(asset, '1d')) ?? [] });
  if (action === 'patterns' && asset) return NextResponse.json({ asset, patterns: await redisGet(KEYS.patternMap(asset)) });
  if (action === 'events' && asset) return NextResponse.json({ asset, events: await redisGet(KEYS.eventReactions(asset)) });
  if (action === 'lab' && asset) return NextResponse.json({ asset, lab: await redisGet(KEYS.labResults(asset)) });

  if (action === 'training-results') {
    const results: any[] = [];
    for (const a of TRAINABLE_ASSETS) {
      for (const tf of TRAINABLE_TFS) {
        for (const s of ['trend', 'reversion', 'breakout', 'momentum', 'combined_ai'] as StrategyKey[]) {
          const r = await redisGet(`nexus:rnd:training:${a}:${tf}:${s}`);
          if (r) results.push(r);
        }
      }
    }
    return NextResponse.json({ results, total: results.length });
  }

  if (action === 'famous-strategies') {
    return NextResponse.json({ strategies: FAMOUS_STRATEGIES.map(s => ({ id: s.id, name: s.name, author: s.author, description: s.description, timeframe: s.timeframe, entryRule: s.entryRule, exitRule: s.exitRule })) });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'warehouse') {
    populateWarehouse();
    return NextResponse.json({ ok: true, message: 'Warehouse started' });
  }

  if (action === 'scan') {
    const assets = body.assets ?? ALL_ASSETS.slice(0, 4);
    const allKb: any[] = [];
    for (const asset of assets) {
      const indicators = await scanIndicators(asset, '1d');
      const patterns = await mapPatterns(asset, '1d');
      const events = await analyzeEventReactions(asset);
      allKb.push(...buildAssetKnowledge(asset, indicators, patterns, events, null));
    }
    await saveKnowledgeBase(allKb);
    return NextResponse.json({ ok: true, knowledge: allKb.length });
  }

  if (action === 'download-history') {
    const asset = body.asset;
    const tf = body.timeframe ?? '1d';
    if (!asset) return NextResponse.json({ error: 'Asset required' }, { status: 400 });
    const { candles, source } = await downloadHistory(asset, tf);
    return NextResponse.json({ ok: true, asset, timeframe: tf, candles: candles.length, source });
  }

  if (action === 'download-all') {
    const results: any[] = [];
    const assets = body.assets ?? TRAINABLE_ASSETS;
    const tfs = body.timeframes ?? ['1d', '4h', '1h'];
    for (const asset of assets) {
      for (const tf of tfs) {
        try {
          const { candles, source } = await downloadHistory(asset, tf);
          results.push({ asset, timeframe: tf, candles: candles.length, source });
          console.log(`[RND] Downloaded ${asset} ${tf}: ${candles.length} candles from ${source}`);
        } catch (err: any) {
          console.error(`[RND] Download failed ${asset} ${tf}:`, err.message);
          results.push({ asset, timeframe: tf, candles: 0, source: 'error', error: err.message });
        }
      }
    }
    return NextResponse.json({ ok: true, results, totalCandles: results.reduce((s, r) => s + r.candles, 0) });
  }

  if (action === 'train') {
    const { asset, timeframe, strategy } = body;
    if (!asset || !strategy) return NextResponse.json({ error: 'Asset and strategy required' }, { status: 400 });
    const result = await trainStrategy(asset, timeframe ?? '1d', strategy as StrategyKey);
    return NextResponse.json({ ok: true, result });
  }

  if (action === 'train-all') {
    const assets = body.assets ?? TRAINABLE_ASSETS.slice(0, 3);
    const tfs = body.timeframes ?? ['1d', '4h'];
    const strats = body.strategies ?? ['trend', 'momentum', 'combined_ai'];
    const report = await runFullTraining(assets, tfs, strats as StrategyKey[]);
    return NextResponse.json({ ok: true, ...report });
  }

  if (action === 'test-famous') {
    const id = body.strategyId;
    const asset = body.asset ?? 'BTC/USD';
    const strat = FAMOUS_STRATEGIES.find(s => s.id === id);
    if (!strat) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    const { candles } = await downloadHistory(asset, strat.timeframe);
    if (candles.length < 100) return NextResponse.json({ error: 'Insufficient data' }, { status: 400 });
    const result = strat.test(candles);
    return NextResponse.json({ ok: true, strategy: strat.name, asset, ...result });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
