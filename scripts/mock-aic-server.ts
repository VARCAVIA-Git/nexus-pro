#!/usr/bin/env npx tsx
// ═══════════════════════════════════════════════════════════════
// Mock AIC Server — for development/testing
// Run: npx tsx scripts/mock-aic-server.ts
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'http';

const MOCK_SIGNAL = {
  action: 'LONG',
  entry: 68420.5,
  TP: [69100, 70250, 72000],
  SL: 67300.0,
  timeout_minutes: 45,
  confidence: 0.81,
  'expected_profit_%': 2.65,
  setup_name: 'RSI_MACD_Volume_4h',
};

const MOCK_CONFLUENCE = {
  bias: 'BULLISH',
  score: 0.78,
  bull_score: 0.65,
  bear_score: 0.2,
  bullish_tfs: ['1h', '4h', '1d'],
  bearish_tfs: ['15m'],
  neutral_tfs: ['5m', '30m'],
  aligned_count: 3,
  tf_biases: { '15m': 'BEARISH', '1h': 'BULLISH', '4h': 'BULLISH', '1d': 'BULLISH' },
};

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url?.split('?')[0];

  if (url === '/status') {
    res.end(JSON.stringify({
      status: 'online',
      symbol: 'BTC/USDT',
      price: 68420.5,
      confluence: MOCK_CONFLUENCE,
      regime: 'BULL',
      regime_confidence: 0.82,
      active_tfs: ['1m', '5m', '15m', '1h', '4h', '1d'],
      ts: new Date().toISOString(),
    }));
  } else if (url === '/signals/latest') {
    res.end(JSON.stringify(MOCK_SIGNAL));
  } else if (url === '/signals') {
    res.end(JSON.stringify([MOCK_SIGNAL]));
  } else if (url === '/confluence') {
    res.end(JSON.stringify({ confluence: MOCK_CONFLUENCE, price: 68420.5, ts: new Date().toISOString() }));
  } else if (url === '/regime') {
    res.end(JSON.stringify({ regime: 'BULL', confidence: 0.82, probabilities: { up: 0.65, down: 0.2, flat: 0.15 }, ts: new Date().toISOString() }));
  } else if (url === '/research') {
    res.end(JSON.stringify({
      funding_rate_current: 0.012,
      funding_sentiment: 'NEUTRAL',
      open_interest: 45000,
      fear_greed_index: 62,
      fear_greed_label: 'Greed',
      news_sentiment: 'BULLISH',
      total_liquidations_24h_usd: 125000000,
    }));
  } else if (url === '/scorecard') {
    res.end(JSON.stringify([{
      setup_name: 'RSI_MACD_Volume_4h',
      symbol: 'BTC/USDT',
      total_signals: 45,
      total_executed: 38,
      wins: 24,
      losses: 14,
      timeouts: 0,
      real_win_rate: 0.632,
      real_profit_factor: 1.85,
      avg_pnl_pct: 1.2,
      avg_confidence: 0.75,
      confidence_accuracy: 0.882,
      last_updated: new Date().toISOString(),
      last_10_outcomes: ['tp_hit', 'sl_hit', 'tp_hit', 'tp_hit', 'sl_hit', 'tp_hit', 'tp_hit', 'sl_hit', 'tp_hit', 'tp_hit'],
    }]));
  } else if (url?.startsWith('/feedback') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: any) => (body += chunk));
    req.on('end', () => {
      console.log('[FEEDBACK]', body);
      res.end(JSON.stringify({ status: 'ok' }));
    });
    return;
  } else if (url?.startsWith('/analysis')) {
    res.end(JSON.stringify({ timeframe: '4h', indicators: { rsi: 58, macd: 120, adx: 28 }, price: 68420.5 }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, () => {
  console.log(`Mock AIC running on http://localhost:${PORT}`);
  console.log('Endpoints: /status /signals/latest /signals /confluence /regime /research /scorecard /feedback');
});
