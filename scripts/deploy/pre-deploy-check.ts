/**
 * Pre-deploy checklist — verifica che tutto sia pronto
 */
const checks = [
  { name: 'ENV vars', check: () => {
    const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    const missing = required.filter(k => !process.env[k]);
    return missing.length === 0 ? '✓' : `MISSING: ${missing.join(', ')}`;
  }},
  { name: 'TypeScript', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx tsc --noEmit', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Type errors found'; }
  }},
  { name: 'Tests', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx vitest run', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Test failures'; }
  }},
  { name: 'Build', check: () => {
    const { execSync } = require('child_process');
    try { execSync('npx next build', { stdio: 'pipe' }); return '✓'; }
    catch { return '✗ Build failed'; }
  }},
];

(async () => {
  console.log('\n🔍 NEXUS PRO — Pre-Deploy Check\n');
  let allGood = true;
  for (const c of checks) {
    const result = c.check();
    const ok = result === '✓';
    if (!ok) allGood = false;
    console.log(`  ${ok ? '✅' : '❌'} ${c.name}: ${result}`);
  }
  console.log(`\n${allGood ? '✅ Ready to deploy!' : '❌ Fix issues before deploying.'}\n`);
  process.exit(allGood ? 0 : 1);
})();
