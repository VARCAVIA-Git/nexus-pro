/**
 * NEXUS PRO — Health Check
 * Verifica stato di tutti i servizi
 */
const checks = {
  async supabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return { status: 'error', message: 'URL not configured' };
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' }
      });
      return { status: res.ok ? 'ok' : 'error', code: res.status };
    } catch (e: any) { return { status: 'error', message: e.message }; }
  },
  async redis() {
    try {
      const Redis = require('ioredis');
      const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      const pong = await r.ping();
      r.disconnect();
      return { status: pong === 'PONG' ? 'ok' : 'error' };
    } catch { return { status: 'not_configured' }; }
  },
  system() {
    const os = require('os');
    return {
      status: 'ok',
      memory: `${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB total`,
      cpu: os.cpus().length + ' cores',
      uptime: Math.round(os.uptime() / 3600) + 'h',
      node: process.version,
    };
  },
};

(async () => {
  console.log('\n🏥 NEXUS PRO — Health Check\n');
  for (const [name, fn] of Object.entries(checks)) {
    const result = typeof fn === 'function' ? (fn.constructor.name === 'AsyncFunction' ? await fn() : fn()) : fn;
    const icon = result.status === 'ok' ? '✅' : result.status === 'not_configured' ? '⚪' : '❌';
    console.log(`  ${icon} ${name}:`, JSON.stringify(result));
  }
  console.log('');
})();
