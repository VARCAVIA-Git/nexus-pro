import { NextResponse } from 'next/server';
import { populateWarehouse, getWarehouseStatus, ALL_ASSETS, RESEARCH_TFS, scanIndicators, mapPatterns, analyzeEventReactions, runStrategyLab, buildAssetKnowledge, saveKnowledgeBase, getKnowledgeBase } from '@/lib/engine/rnd';
import { redisGet, KEYS } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? 'status';
  const asset = searchParams.get('asset');

  if (action === 'status') {
    const status = getWarehouseStatus();
    const knowledge = await getKnowledgeBase();
    return NextResponse.json({ warehouse: status, knowledgeEntries: knowledge.length });
  }

  if (action === 'indicators' && asset) {
    const results = await redisGet(KEYS.scanResults(asset, '1d'));
    return NextResponse.json({ asset, indicators: results ?? [] });
  }

  if (action === 'patterns' && asset) {
    const results = await redisGet(KEYS.patternMap(asset));
    return NextResponse.json({ asset, patterns: results });
  }

  if (action === 'events' && asset) {
    const results = await redisGet(KEYS.eventReactions(asset));
    return NextResponse.json({ asset, events: results });
  }

  if (action === 'lab' && asset) {
    const results = await redisGet(KEYS.labResults(asset));
    return NextResponse.json({ asset, lab: results });
  }

  if (action === 'knowledge') {
    const kb = await getKnowledgeBase();
    return NextResponse.json({ knowledge: kb, total: kb.length });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'warehouse') {
    // Start warehouse population (async)
    populateWarehouse((msg) => console.log(`📦 ${msg}`));
    return NextResponse.json({ ok: true, message: 'Warehouse population started' });
  }

  if (action === 'scan') {
    const assets = body.assets ?? ALL_ASSETS.slice(0, 4);
    const allKnowledge: any[] = [];

    for (const asset of assets) {
      console.log(`🔬 Scanning ${asset}...`);
      const indicators = await scanIndicators(asset, '1d');
      const patterns = await mapPatterns(asset, '1d');
      const events = await analyzeEventReactions(asset);
      const kb = buildAssetKnowledge(asset, indicators, patterns, events, null);
      allKnowledge.push(...kb);
    }

    await saveKnowledgeBase(allKnowledge);
    return NextResponse.json({ ok: true, knowledge: allKnowledge.length, assets: assets.length });
  }

  if (action === 'lab' && body.asset) {
    const report = await runStrategyLab(body.asset);
    return NextResponse.json({ ok: true, asset: body.asset, experiments: report.totalExperiments, bestConfig: report.bestConfig });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
