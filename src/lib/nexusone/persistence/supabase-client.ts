// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Supabase service-role client
//
// Used ONLY by DualWriter and server-side persistence reads.
// Returns null if env is missing or placeholder — the DualWriter
// degrades to Redis-only instead of crashing the tick.
// ═══════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _resolved = false;

function isUsable(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  if (url.includes('xxxxx') || key.includes('xxxxx')) return false;
  if (!url.startsWith('https://')) return false;
  return true;
}

export function getServiceSupabase(): SupabaseClient | null {
  if (_resolved) return _client;
  _resolved = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isUsable(url, key)) {
    console.warn('[nexusone/supabase] service-role client disabled: missing or placeholder env');
    return null;
  }
  _client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
