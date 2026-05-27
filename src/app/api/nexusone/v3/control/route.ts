// NexusOne v3 — Control endpoint for the dashboard.
// Allows toggling mode and clearing state from the UI.
// Live approval is intentionally NOT exposed here — only via filesystem.

import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { setMode, getStateDir, type NexusV3Mode } from '@/lib/nexusone/v3/persistence';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { action: string; mode?: NexusV3Mode };
    const stateDir = getStateDir();

    if (body.action === 'set_mode' && body.mode) {
      // Refuse to set 'live' or 'live_micro' from this endpoint — too easy to misclick.
      if (body.mode === 'live' || body.mode === 'live_micro') {
        return NextResponse.json({ ok: false, error: 'Live activation must be done via CLI + filesystem flag, not from web UI.' }, { status: 403 });
      }
      await setMode(body.mode);
      return NextResponse.json({ ok: true, mode: body.mode });
    }

    if (body.action === 'reset_state') {
      // Stop daemon recommended before this; we just clear state files.
      const files = ['tuples.json', 'portfolio.json', 'closed.json', 'last_bar_ts.json', 'evaluator-verdict.json', 'evaluator-report.md', 'runner.log'];
      for (const f of files) {
        const p = path.join(stateDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      return NextResponse.json({ ok: true, cleared: files });
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
