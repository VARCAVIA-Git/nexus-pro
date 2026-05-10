// NexusOne v3 — public HTML monitor. Served under /api/ so middleware allows it.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HTML = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NexusOne v3 — Live Paper Monitor</title>
<style>
  :root {
    --bg: #0b0e14; --panel: #11151c; --border: #1f2632;
    --fg: #e5e9f0; --muted: #7a8290; --accent: #4ade80;
    --warn: #fbbf24; --bad: #f87171; --good: #4ade80;
    --mono: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
  header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header .meta { font: 12px var(--mono); color: var(--muted); }
  main { padding: 20px; max-width: 1400px; margin: 0 auto; }
  .grid { display: grid; gap: 16px; margin-bottom: 16px; }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .grid-2 { grid-template-columns: 2fr 1fr; }
  @media (max-width: 900px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } .grid-2 { grid-template-columns: 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat { font: 700 24px/1.2 var(--mono); }
  .stat.sm { font-size: 18px; }
  .sub { font: 12px var(--mono); color: var(--muted); margin-top: 4px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 600 11px var(--mono); }
  .pill.paper { background: rgba(74, 222, 128, 0.15); color: var(--good); }
  .pill.disabled { background: rgba(248, 113, 113, 0.15); color: var(--bad); }
  .pill.live { background: rgba(251, 191, 36, 0.15); color: var(--warn); }
  table { width: 100%; border-collapse: collapse; font: 12px var(--mono); }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: var(--good); }
  .neg { color: var(--bad); }
  .dim { color: var(--muted); }
  #equityChart { width: 100%; height: 260px; }
  pre.log { background: #06080c; padding: 12px; border-radius: 6px; font: 11px var(--mono); color: var(--fg); max-height: 260px; overflow-y: auto; margin: 0; white-space: pre-wrap; word-break: break-all; }
  .err { color: var(--bad); padding: 12px; background: rgba(248, 113, 113, 0.1); border-radius: 6px; }
  footer { padding: 16px 20px; color: var(--muted); font: 11px var(--mono); text-align: center; }
</style>
</head>
<body>
<header>
  <h1>NexusOne v3 <span id="modePill" class="pill">…</span></h1>
  <div class="meta">
    <span id="generated">—</span> · refresh <span id="refresh">30s</span> ·
    <a href="javascript:reload()" style="color:var(--muted)">↻</a>
  </div>
</header>
<main>
  <div id="err"></div>

  <div class="grid grid-4">
    <div class="card"><h2>Equity</h2><div class="stat" id="equity">—</div><div class="sub" id="equitySub">—</div></div>
    <div class="card"><h2>P/L vs initial</h2><div class="stat" id="pnl">—</div><div class="sub" id="pnlSub">—</div></div>
    <div class="card"><h2>Max Drawdown</h2><div class="stat" id="dd">—</div><div class="sub">peak: <span id="peak">—</span></div></div>
    <div class="card"><h2>Trades</h2><div class="stat" id="trades">—</div><div class="sub" id="tradesSub">win — / loss —</div></div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <h2>Equity curve</h2>
      <canvas id="equityChart"></canvas>
    </div>
    <div class="card">
      <h2>Active positions <span id="openCount" class="dim"></span></h2>
      <table id="openTable">
        <thead><tr><th>Asset</th><th>TF</th><th>Dir</th><th class="num">Entry</th><th class="num">Stop</th><th class="num">TP</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <h2>Tuples (posterior expectancy bps)</h2>
    <table id="tuplesTable">
      <thead><tr><th>Tuple</th><th>Asset</th><th>TF</th><th class="num">Trades</th><th class="num">Posterior</th><th>Status</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <h2>Recent trades</h2>
      <table id="recentTable">
        <thead><tr><th>Time</th><th>Asset</th><th>Prim</th><th>Dir</th><th>Reason</th><th class="num">bps</th><th class="num">$</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="card">
      <h2>Evaluator verdict</h2>
      <div id="evaluator">—</div>
      <h2 style="margin-top:16px">Runner log (last 30 lines)</h2>
      <pre class="log" id="logTail">…</pre>
    </div>
  </div>
</main>
<footer>NexusOne v3 paper monitor · auto-refresh ogni 30s · droplet 167.172.229.159</footer>

<script>
const fmt = {
  usd: v => '$' + (v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: v => ((v ?? 0)).toFixed(2) + '%',
  bps: v => ((v >= 0 ? '+' : '') + (v ?? 0).toFixed(0)) + ' bps',
  ts: ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  dur: ms => { const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h ? \`\${h}h\${m}m\` : \`\${m}m\`; }
};

function drawChart(curve) {
  const cvs = document.getElementById('equityChart');
  const ctx = cvs.getContext('2d');
  const w = cvs.width = cvs.clientWidth * devicePixelRatio;
  const h = cvs.height = cvs.clientHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const cw = cvs.clientWidth, ch = cvs.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  if (!curve || curve.length < 2) {
    ctx.fillStyle = '#7a8290'; ctx.font = '12px monospace';
    ctx.fillText('Insufficient data (< 2 closed trades)', 12, 24);
    return;
  }

  const padL = 50, padR = 12, padT = 12, padB = 24;
  const ys = curve.map(p => p.equity);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = (maxY - minY) || 1;
  const yScale = v => padT + (ch - padT - padB) * (1 - (v - minY) / range);
  const xScale = i => padL + (cw - padL - padR) * (i / (curve.length - 1));

  // Grid
  ctx.strokeStyle = '#1f2632'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + ((ch - padT - padB) / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cw - padR, y); ctx.stroke();
    const v = maxY - (range / 4) * i;
    ctx.fillStyle = '#7a8290'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText('$' + v.toFixed(0), padL - 6, y + 3);
  }

  // Line
  ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
  ctx.beginPath();
  curve.forEach((p, i) => {
    const x = xScale(i), y = yScale(p.equity);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill area under curve
  ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
  ctx.lineTo(xScale(curve.length - 1), ch - padB);
  ctx.lineTo(xScale(0), ch - padB);
  ctx.closePath(); ctx.fill();
}

async function reload() {
  try {
    const r = await fetch('/api/nexusone/v3/dashboard', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error);
    render(d);
    document.getElementById('err').innerHTML = '';
  } catch (e) {
    document.getElementById('err').innerHTML = '<div class="err">Errore caricamento: ' + e.message + '</div>';
  }
}

function render(d) {
  document.getElementById('generated').textContent = d.generated_at.slice(0, 19).replace('T', ' ') + ' UTC';
  const pill = document.getElementById('modePill');
  pill.textContent = d.mode; pill.className = 'pill ' + d.mode;

  const p = d.portfolio;
  document.getElementById('equity').textContent = fmt.usd(p.equity);
  document.getElementById('equitySub').textContent = \`initial \${fmt.usd(p.initial_equity)} · open \${p.open_positions?.length ?? 0}\`;
  const pnl = p.equity - (p.initial_equity || 10000);
  const pnlEl = document.getElementById('pnl');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + fmt.usd(pnl);
  pnlEl.className = 'stat ' + (pnl >= 0 ? 'pos' : 'neg');
  document.getElementById('pnlSub').textContent = ((pnl / (p.initial_equity || 10000)) * 100).toFixed(3) + '%';
  document.getElementById('dd').textContent = fmt.pct(p.max_drawdown_pct);
  document.getElementById('peak').textContent = fmt.usd(p.peak_equity);
  document.getElementById('trades').textContent = p.closed_total;
  const wins = (d.recent_trades || []).filter(t => t.netDollars > 0).length;
  const losses = (d.recent_trades || []).filter(t => t.netDollars <= 0).length;
  document.getElementById('tradesSub').textContent = \`last 100: \${wins}W / \${losses}L\`;

  drawChart(d.equity_curve || []);

  // Open positions
  const openBody = document.querySelector('#openTable tbody');
  openBody.innerHTML = (p.open_positions || []).map(o => \`
    <tr>
      <td>\${o.asset}</td><td>\${o.tf}</td>
      <td class="\${o.dir === 'long' ? 'pos' : 'neg'}">\${o.dir}</td>
      <td class="num">\${o.entryPrice.toFixed(2)}</td>
      <td class="num dim">\${o.stopPrice.toFixed(2)}</td>
      <td class="num dim">\${o.tpPrice.toFixed(2)}</td>
    </tr>\`).join('') || '<tr><td colspan="6" class="dim">no open positions</td></tr>';
  document.getElementById('openCount').textContent = \`(\${p.open_positions?.length || 0})\`;

  // Tuples sorted by posterior desc
  const tup = [...(d.tuples?.details || [])].sort((a, b) => b.posteriorBps - a.posteriorBps);
  document.querySelector('#tuplesTable tbody').innerHTML = tup.map(t => \`
    <tr>
      <td>\${t.primitive}</td><td>\${t.asset}</td><td>\${t.tf}</td>
      <td class="num">\${t.totalTrades}</td>
      <td class="num \${t.posteriorBps > 0 ? 'pos' : t.posteriorBps < 0 ? 'neg' : 'dim'}">\${t.posteriorBps.toFixed(2)}</td>
      <td>\${t.active ? '<span class="pill paper">active</span>' : '<span class="pill disabled">off</span>'}</td>
    </tr>\`).join('');

  // Recent trades
  document.querySelector('#recentTable tbody').innerHTML = (d.recent_trades || []).slice(0, 20).map(t => \`
    <tr>
      <td class="dim">\${fmt.ts(t.ts)}</td>
      <td>\${t.asset}</td><td>\${t.primitive}</td>
      <td class="\${t.dir === 'long' ? 'pos' : 'neg'}">\${t.dir}</td>
      <td class="dim">\${t.reason}</td>
      <td class="num \${t.netBps >= 0 ? 'pos' : 'neg'}">\${fmt.bps(t.netBps)}</td>
      <td class="num \${t.netDollars >= 0 ? 'pos' : 'neg'}">\${(t.netDollars >= 0 ? '+' : '') + t.netDollars.toFixed(2)}</td>
    </tr>\`).join('');

  // Evaluator
  const ev = d.evaluator;
  const evEl = document.getElementById('evaluator');
  if (ev) {
    const cls = ev.decision === 'PAPER_PASS' ? 'pos' : ev.decision === 'PAPER_FAIL' ? 'neg' : 'dim';
    evEl.innerHTML = \`
      <div class="stat sm \${cls}">\${ev.decision}</div>
      <div class="sub">Days: \${ev.daysElapsed?.toFixed(2) ?? '?'} / 30 · Sharpe: \${ev.sharpe?.toFixed(2) ?? '?'} · DD: \${(ev.maxDrawdown * 100)?.toFixed(2) ?? '?'}%</div>
      <div class="sub">Trades/d: \${ev.tradesPerDay?.toFixed(2) ?? '?'} · WR: \${(ev.winRate * 100)?.toFixed(1) ?? '?'}% · PF: \${ev.profitFactor?.toFixed(2) ?? '?'}</div>\`;
  } else evEl.innerHTML = '<span class="dim">No verdict yet</span>';

  document.getElementById('logTail').textContent = (d.runner_log_tail || []).slice(-30).join('\\n');
}

reload();
setInterval(reload, 30000);
</script>
</body>
</html>
`;

export async function GET() {
  return new NextResponse(HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
