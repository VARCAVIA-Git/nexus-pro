// ═══════════════════════════════════════════════════════════════
// Sentiment Analyzer — dictionary-based, lightweight
// Score = (pos - neg) / (pos + neg + 1) ∈ [-1, +1]
// ═══════════════════════════════════════════════════════════════

import dict from './dict/sentiment-dict.json';

const POSITIVE = new Set<string>((dict.positive ?? []).map((w: string) => w.toLowerCase()));
const NEGATIVE = new Set<string>((dict.negative ?? []).map((w: string) => w.toLowerCase()));

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface SentimentResult {
  score: number; // -1..+1
  positive: number;
  negative: number;
  matchedPositive: string[];
  matchedNegative: string[];
}

export function analyzeSentiment(text: string): SentimentResult {
  if (!text) {
    return { score: 0, positive: 0, negative: 0, matchedPositive: [], matchedNegative: [] };
  }
  const tokens = tokenize(text);
  const matchedPositive: string[] = [];
  const matchedNegative: string[] = [];
  for (const t of tokens) {
    if (POSITIVE.has(t)) matchedPositive.push(t);
    if (NEGATIVE.has(t)) matchedNegative.push(t);
  }
  const pos = matchedPositive.length;
  const neg = matchedNegative.length;
  const score = (pos - neg) / (pos + neg + 1);
  return {
    score: Math.round(score * 1000) / 1000,
    positive: pos,
    negative: neg,
    matchedPositive,
    matchedNegative,
  };
}
