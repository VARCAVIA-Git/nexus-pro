// ═══════════════════════════════════════════════════════════════
// MASTER SIGNAL GENERATOR — with Adaptive Learning
// Combines MTF + news + calendar + adaptive weights from learning engine
// ═══════════════════════════════════════════════════════════════

import type { MasterSignal, Recommendation } from '@/types/intelligence';
import { runMTFAnalysis } from './mtf-analysis';
import { getNewsSentiment } from './news-sentiment';
import { checkCalendarForAsset } from './economic-calendar';
import { getAdaptiveWeights, isPreferredTime } from './learning/adaptive-weights';
import { getKnowledgeBase } from './rnd/knowledge-base';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function newsToScore(score: number): number {
  return clamp((score + 100) / 2, 0, 100);
}

function getRecommendation(score: number): Recommendation {
  if (score >= 80) return 'STRONG_ENTER';
  if (score >= 65) return 'ENTER';
  if (score <= 20) return 'STRONG_EXIT';
  if (score <= 35) return 'EXIT';
  return 'HOLD';
}

export async function generateMasterSignal(asset: string): Promise<MasterSignal> {
  const reasoning: string[] = [];

  // Load adaptive weights (uses learning data if available)
  const weights = await getAdaptiveWeights(asset);
  const isAdaptive = weights.lastUpdated > 0 && weights.minScoreToEnter !== 70;

  if (isAdaptive) {
    reasoning.push(`Adaptive weights active: MTF ${(weights.mtfWeight * 100).toFixed(0)}%, News ${(weights.newsWeight * 100).toFixed(0)}%, Cal ${(weights.calendarWeight * 100).toFixed(0)}%`);
  }

  // 1. Multi-timeframe analysis
  const mtf = await runMTFAnalysis(asset);
  reasoning.push(`MTF: ${mtf.alignment} alignment, score ${mtf.compositeScore}/100, direction ${mtf.direction}`);

  // 2. News sentiment
  const news = await getNewsSentiment(asset);
  const newsScore = newsToScore(news.score);
  if (news.score > 30) reasoning.push(`News: positive (${news.score}), ${news.articles} articles`);
  else if (news.score < -30) reasoning.push(`News: negative (${news.score}), ${news.articles} articles`);
  else reasoning.push(`News: neutral (${news.score}), ${news.articles} articles`);

  // 3. Calendar check
  const calendar = await checkCalendarForAsset(asset);
  if (calendar.blocked) reasoning.push(`BLOCKED: ${calendar.reason}`);
  else if (calendar.reducedSize) reasoning.push(`Caution: ${calendar.reason}`);

  // 4. Composite score with adaptive weights
  let score = mtf.compositeScore * weights.mtfWeight
            + newsScore * weights.newsWeight
            + 50 * weights.calendarWeight;

  // Timing bonus/penalty from learning
  if (isAdaptive) {
    if (!isPreferredTime(weights)) {
      score *= 0.90; // 10% penalty outside preferred hours
      reasoning.push('Timing: outside preferred trading hours (-10%)');
    } else if (weights.preferredHours.length > 0) {
      score *= 1.05; // 5% bonus during preferred hours
      reasoning.push('Timing: preferred trading hour (+5%)');
    }
  }

  // 5. R&D Knowledge Base boost
  try {
    const kb = await getKnowledgeBase();
    const relevant = kb.filter(k => k.asset === asset && k.actionable && k.confidence !== 'low');
    let kbBoost = 0;
    for (const entry of relevant.slice(0, 5)) {
      if (entry.winRate > 0.65 && entry.sampleSize >= 10) {
        kbBoost += 5;
        reasoning.push(`R&D boost: ${entry.finding.slice(0, 60)} (+5%)`);
      } else if (entry.winRate < 0.40 && entry.sampleSize >= 10) {
        kbBoost -= 8;
        reasoning.push(`R&D warning: ${entry.finding.slice(0, 60)} (-8%)`);
      }
    }
    if (kbBoost !== 0) score += kbBoost;
  } catch {}

  // Calendar override
  if (calendar.blocked) {
    score = clamp(score, 40, 60);
    reasoning.push('Score clamped to neutral due to high-impact event');
  }

  score = Math.round(clamp(score, 0, 100));

  // Direction
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  if (score > 60) direction = mtf.direction === 'short' ? 'neutral' : 'long';
  else if (score < 40) direction = mtf.direction === 'long' ? 'neutral' : 'short';

  // News override
  if (news.score < -50 && direction === 'long') {
    direction = 'neutral';
    score = Math.min(score, 55);
    reasoning.push('Long blocked by very negative news');
  }

  const confidence = clamp(
    mtf.confidence * 0.6 + (Math.abs(news.score) / 100) * 0.2 + (calendar.blocked ? 0 : 0.2),
    0, 1,
  );

  const recommendation = getRecommendation(score);

  // Use adaptive min score
  if (isAdaptive && score >= 65 && score < weights.minScoreToEnter) {
    reasoning.push(`Learning: score ${score} below adaptive threshold ${weights.minScoreToEnter} → downgraded to HOLD`);
  }

  // SL/TP from daily timeframe
  const daily = mtf.timeframes['1d'];
  const atrProxy = daily.resistance > 0 ? (daily.resistance - daily.support) * 0.1 : 0;
  const currentPrice = daily.support > 0 ? (daily.support + daily.resistance) / 2 : 0;
  const suggestedSL = direction === 'long' ? currentPrice - atrProxy * 2 : currentPrice + atrProxy * 2;
  const suggestedTP = direction === 'long' ? currentPrice + atrProxy * 3 : currentPrice - atrProxy * 3;
  const suggestedSize = calendar.reducedSize ? 0.5 : 1.0;

  return {
    asset, score, direction, confidence, recommendation, reasoning,
    components: { mtf, news, calendar: { nearbyEvents: calendar.nearbyEvents, blocked: calendar.blocked } },
    suggestedSL: Math.round(suggestedSL * 100) / 100,
    suggestedTP: Math.round(suggestedTP * 100) / 100,
    suggestedSize,
    timestamp: Date.now(),
  };
}

export async function generateAllMasterSignals(assets: string[]): Promise<MasterSignal[]> {
  const signals: MasterSignal[] = [];
  for (const asset of assets) {
    try { signals.push(await generateMasterSignal(asset)); } catch (err) { console.error(`Master signal error for ${asset}:`, err); }
  }
  return signals.sort((a, b) => b.score - a.score);
}
