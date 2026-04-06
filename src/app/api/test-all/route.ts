import { NextResponse } from 'next/server';
import { redisPing, redisGet, KEYS } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

interface TestResult { name: string; ok: boolean; ms: number; detail?: string }

async function test(name: string, fn: () => Promise<string>): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t0, detail };
  } catch (err: any) {
    return { name, ok: false, ms: Date.now() - t0, detail: err.message };
  }
}

export async function GET() {
  const results: TestResult[] = [];

  // 1. Redis
  results.push(await test('Redis Ping', async () => {
    const ok = await redisPing();
    if (!ok) throw new Error('PONG not received');
    return 'Connected';
  }));

  // 2. Alpaca Paper
  results.push(await test('Alpaca Paper', async () => {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) throw new Error('Keys not configured');
    const res = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const acc = await res.json();
    return `Equity: $${parseFloat(acc.equity).toLocaleString('en-US')}`;
  }));

  // 3. Twelve Data
  results.push(await test('Twelve Data', async () => {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key) throw new Error('Key not configured');
    const res = await fetch(`https://api.twelvedata.com/price?symbol=AAPL&apikey=${key}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (!d.price) throw new Error('No price returned');
    return `AAPL: $${d.price}`;
  }));

  // 4. CoinGecko
  results.push(await test('CoinGecko', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return `BTC: $${d.bitcoin?.usd?.toLocaleString('en-US')}`;
  }));

  // 5. Bot configs in Redis
  results.push(await test('Bot Configs', async () => {
    const configs = await redisGet(KEYS.botConfig);
    const count = Array.isArray(configs) ? configs.length : 0;
    return `${count} bot(s) configured`;
  }));

  // 6. Notifications
  results.push(await test('Notifications', async () => {
    const { redisLlen } = await import('@/lib/db/redis');
    const count = await redisLlen(KEYS.notifications);
    return `${count} notification(s)`;
  }));

  // 7. Trades
  results.push(await test('Trade Store', async () => {
    const trades = await redisGet(KEYS.trades);
    return 'Store accessible';
  }));

  // 8. Alpaca Live (optional)
  results.push(await test('Alpaca Live', async () => {
    const key = process.env.ALPACA_LIVE_API_KEY;
    const secret = process.env.ALPACA_LIVE_SECRET_KEY;
    if (!key || !secret) return 'Not configured (optional)';
    const res = await fetch('https://api.alpaca.markets/v2/account', {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const acc = await res.json();
    return `Equity: $${parseFloat(acc.equity).toLocaleString('en-US')}`;
  }));

  // 9. Upstash write/read
  results.push(await test('Redis Write/Read', async () => {
    const { redisSet, redisGet } = await import('@/lib/db/redis');
    await redisSet('nexus:test:ping', { ts: Date.now() }, 60);
    const val = await redisGet('nexus:test:ping');
    if (!val) throw new Error('Read failed');
    return 'Write + Read OK';
  }));

  const passed = results.filter(r => r.ok).length;

  return NextResponse.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    allGreen: passed === results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
