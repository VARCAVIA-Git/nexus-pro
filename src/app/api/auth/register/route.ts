import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json({ ok: false, error: 'Tutti i campi sono richiesti' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'Password: minimo 8 caratteri' }, { status: 400 });
  }

  // Set session cookie
  const response = NextResponse.json({ ok: true, user: { name, email } });
  response.cookies.set('nexus-session', Buffer.from(JSON.stringify({ name, email, ts: Date.now() })).toString('base64'), {
    httpOnly: true, secure: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
