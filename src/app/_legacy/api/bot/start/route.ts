import { NextResponse } from 'next/server';
import { startBot, startBotLegacy, createBot } from '@/lib/analytics/action/live-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Reject real mode without live keys
    const env = body.environment ?? 'demo';
    if (env === 'real') {
      const liveKey = process.env.ALPACA_LIVE_API_KEY;
      const liveSecret = process.env.ALPACA_LIVE_SECRET_KEY;
      if (!liveKey || !liveSecret) {
        return NextResponse.json({ ok: false, error: 'API keys live non configurate. Vai a Connessioni per configurarle.' }, { status: 400 });
      }
    }

    // Multi-bot: if botId provided, start existing bot
    if (body.botId) {
      const result = await startBot(body.botId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    // Multi-bot: if name + full config provided, create + start
    if (body.name) {
      const bot = await createBot({
        name: body.name,
        environment: body.environment ?? 'demo',
        capitalPercent: body.capitalPercent ?? body.capitalPct ?? 30,
        assets: body.assets ?? [],
        strategies: body.strategies ?? ['combined_ai'],
        riskLevel: body.riskLevel ?? 5,
        stopLossPercent: body.stopLossPercent ?? 3,
        takeProfitPercent: body.takeProfitPercent ?? 6,
        useTrailingStop: body.useTrailingStop ?? true,
        maxOpenPositions: body.maxOpenPositions ?? body.maxPositions ?? 3,
        maxDDDaily: body.maxDDDaily ?? 3,
        maxDDWeekly: body.maxDDWeekly ?? 8,
        maxDDTotal: body.maxDDTotal ?? 20,
        operationMode: body.operationMode ?? 'intraday',
        // Phase 4.6: AI-calibrated settings from backtest
        backtestStrategyId: body.backtestStrategyId,
        backtestTimeframe: body.backtestTimeframe,
        calibratedTpPct: body.calibratedTpPct,
        calibratedSlPct: body.calibratedSlPct,
        entryTimeoutBars: body.entryTimeoutBars,
        usesMineRules: body.usesMineRules,
        mineRuleConditions: body.mineRuleConditions,
      });
      const result = await startBot(bot.id);
      return NextResponse.json({ ...result, botId: bot.id, bot }, { status: result.ok ? 200 : 400 });
    }

    // Legacy: single-bot start
    const result = await startBotLegacy({
      assets: body.assets ?? [],
      strategies: body.strategies ?? ['combined_ai'],
      capitalPct: body.capitalPct ?? 30,
      riskLevel: body.riskLevel ?? 5,
      riskPerTrade: body.riskPerTrade ?? 3,
      maxPositions: body.maxPositions ?? 3,
      trailingStopATR: body.trailingStopATR ?? 2,
      maxDDDaily: body.maxDDDaily ?? 3,
      maxDDWeekly: body.maxDDWeekly ?? 8,
      maxDDTotal: body.maxDDTotal ?? 20,
      environment: body.environment ?? 'demo',
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
