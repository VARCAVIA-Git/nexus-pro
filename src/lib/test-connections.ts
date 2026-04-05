import { config } from 'dotenv';
config({ path: '.env.local' });

// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Connection Test Script
// Run: npx tsx src/lib/test-connections.ts
// ═══════════════════════════════════════════════════════════════

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function testAlpaca() {
  console.log(`\n${BOLD}── Alpaca Markets ──${RESET}`);

  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  const baseUrl = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

  if (!key || !secret) {
    console.log(`${FAIL} ALPACA_API_KEY o ALPACA_API_SECRET non configurate`);
    return false;
  }

  console.log(`${DIM}  Key: ${key.slice(0, 6)}...${key.slice(-4)}${RESET}`);
  console.log(`${DIM}  URL: ${baseUrl}${RESET}`);

  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.log(`${FAIL} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }

    const account = await res.json();
    console.log(`${PASS} Connesso!`);
    console.log(`  Account ID: ${account.id}`);
    console.log(`  Status: ${account.status}`);
    console.log(`  Equity: $${parseFloat(account.equity).toLocaleString()}`);
    console.log(`  Cash: $${parseFloat(account.cash).toLocaleString()}`);
    console.log(`  Buying Power: $${parseFloat(account.buying_power).toLocaleString()}`);
    console.log(`  Paper: ${account.account_number?.startsWith('PA') ? 'Yes' : 'No'}`);
    return true;
  } catch (err: any) {
    console.log(`${FAIL} Errore: ${err.message}`);
    return false;
  }
}

async function testTwelveData() {
  console.log(`\n${BOLD}── Twelve Data ──${RESET}`);

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    console.log(`${FAIL} TWELVE_DATA_API_KEY non configurata`);
    return false;
  }

  console.log(`${DIM}  Key: ${apiKey.slice(0, 8)}...${RESET}`);

  try {
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=AAPL&apikey=${apiKey}`,
    );

    if (!res.ok) {
      const body = await res.text();
      console.log(`${FAIL} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();

    if (data.status === 'error') {
      console.log(`${FAIL} API error: ${data.message}`);
      return false;
    }

    console.log(`${PASS} Connesso!`);
    console.log(`  AAPL price: $${data.price}`);

    // Test a second symbol
    const res2 = await fetch(
      `https://api.twelvedata.com/price?symbol=NVDA&apikey=${apiKey}`,
    );
    const data2 = await res2.json();
    if (data2.price) console.log(`  NVDA price: $${data2.price}`);

    return true;
  } catch (err: any) {
    console.log(`${FAIL} Errore: ${err.message}`);
    return false;
  }
}

async function testCoinGecko() {
  console.log(`\n${BOLD}── CoinGecko ──${RESET}`);

  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = apiKey
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';

  console.log(`${DIM}  Using: ${apiKey ? 'Pro API' : 'Free API'}${RESET}`);

  try {
    const keyParam = apiKey ? `&x_cg_pro_api_key=${apiKey}` : '';
    const res = await fetch(
      `${baseUrl}/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true${keyParam}`,
    );

    if (!res.ok) {
      const body = await res.text();
      console.log(`${FAIL} HTTP ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();

    if (!data.bitcoin) {
      console.log(`${FAIL} Risposta inattesa: ${JSON.stringify(data).slice(0, 200)}`);
      return false;
    }

    console.log(`${PASS} Connesso!`);
    console.log(`  BTC: $${data.bitcoin.usd.toLocaleString()} (${data.bitcoin.usd_24h_change?.toFixed(2)}%)`);
    if (data.ethereum) console.log(`  ETH: $${data.ethereum.usd.toLocaleString()} (${data.ethereum.usd_24h_change?.toFixed(2)}%)`);
    if (data.solana) console.log(`  SOL: $${data.solana.usd.toLocaleString()} (${data.solana.usd_24h_change?.toFixed(2)}%)`);
    return true;
  } catch (err: any) {
    console.log(`${FAIL} Errore: ${err.message}`);
    return false;
  }
}

async function testUpstash() {
  console.log(`\n${BOLD}── Upstash Redis ──${RESET}`);

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log(`${FAIL} UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN non configurate`);
    return false;
  }

  console.log(`${DIM}  URL: ${url}${RESET}`);

  try {
    // SET test key
    const setRes = await fetch(`${url}/set/nexus_test_key/nexus_ok`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!setRes.ok) {
      const body = await setRes.text();
      console.log(`${FAIL} SET failed — HTTP ${setRes.status}: ${body.slice(0, 200)}`);
      return false;
    }

    // GET test key
    const getRes = await fetch(`${url}/get/nexus_test_key`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!getRes.ok) {
      const body = await getRes.text();
      console.log(`${FAIL} GET failed — HTTP ${getRes.status}: ${body.slice(0, 200)}`);
      return false;
    }

    const data = await getRes.json();

    if (data.result === 'nexus_ok') {
      console.log(`${PASS} Connesso!`);
      console.log(`  SET nexus_test_key = "nexus_ok"`);
      console.log(`  GET nexus_test_key = "${data.result}"`);

      // Cleanup
      await fetch(`${url}/del/nexus_test_key`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return true;
    } else {
      console.log(`${FAIL} GET restituì valore inatteso: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err: any) {
    console.log(`${FAIL} Errore: ${err.message}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${BOLD}NEXUS PRO — Test Connessioni${RESET}`);
  console.log(`${'═'.repeat(50)}`);

  const results = {
    alpaca: await testAlpaca(),
    twelveData: await testTwelveData(),
    coinGecko: await testCoinGecko(),
    upstash: await testUpstash(),
  };

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${BOLD}Riepilogo:${RESET}`);
  console.log(`  Alpaca:     ${results.alpaca ? PASS : FAIL}`);
  console.log(`  Twelve Data: ${results.twelveData ? PASS : FAIL}`);
  console.log(`  CoinGecko:  ${results.coinGecko ? PASS : FAIL}`);
  console.log(`  Upstash:    ${results.upstash ? PASS : FAIL}`);

  const allPassed = Object.values(results).every(Boolean);
  console.log(`\n${allPassed ? `${PASS} Tutte le connessioni funzionano!` : `${FAIL} Alcune connessioni hanno fallito.`}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
