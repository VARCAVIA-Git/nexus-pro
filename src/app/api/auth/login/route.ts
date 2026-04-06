import { NextResponse } from 'next/server';
import { redisSet, redisGet } from '@/lib/db/redis';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

function hashPassword(pw: string): string {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) { hash = ((hash << 5) - hash + pw.charCodeAt(i)) | 0; }
  return `h_${Math.abs(hash).toString(36)}_${pw.length}`;
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email e password richiesti' }, { status: 400 });
    }

    // Look up user
    const user = await redisGet<{ id: string; name: string; email: string; passwordHash: string }>(`nexus:user:${email}`);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Account non trovato' }, { status: 401 });
    }

    // Verify password
    if (user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ ok: false, error: 'Password non corretta' }, { status: 401 });
    }

    // Create session
    const sessionId = nanoid(24);
    await redisSet(`nexus:session:${sessionId}`, { userId: user.id, email: user.email, name: user.name }, 604800);

    const response = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
    response.cookies.set('nexus-session', sessionId, {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 604800, path: '/',
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
