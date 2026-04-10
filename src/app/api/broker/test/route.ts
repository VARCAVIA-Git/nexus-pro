import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redisGet } from '@/lib/db/redis';

export const dynamic = 'force-dynamic';

async function requireSession() {
  const sessionId = cookies().get('nexus-session')?.value;
  if (!sessionId) return null;
  return redisGet(`nexus:session:${sessionId}`);
}

/**
 * POST /api/broker/test
 * Tests a broker connection with the provided keys (without saving them).
 * Body: { key: string, secret: string }
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const key = body.key ?? '';
  const secret = body.secret ?? '';

  if (!key || !secret) {
    return NextResponse.json({ connected: false, error: 'Inserisci API Key e Secret Key' });
  }

  // Detect paper vs live from key prefix
  const isPaper = key.startsWith('PK');
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

  try {
    const res = await fetch(`${baseUrl}/v2/account`, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({
        connected: false,
        error: res.status === 403 ? 'Keys non valide o permessi insufficienti' : `Errore HTTP ${res.status}`,
      });
    }

    const acc = await res.json();
    return NextResponse.json({
      connected: true,
      equity: parseFloat(acc.equity),
      cash: parseFloat(acc.cash),
      buyingPower: parseFloat(acc.buying_power),
      accountType: isPaper ? 'paper' : 'live',
      status: acc.status,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, error: `Connessione fallita: ${err.message}` });
  }
}
