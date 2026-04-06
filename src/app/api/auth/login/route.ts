import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simplified auth — swap for Supabase Auth when real credentials are configured
export async function POST(request: Request) {
  const { email, password } = await request.json();

  // For now: accept any non-empty credentials (single-user mode)
  // TODO: Replace with Supabase Auth when NEXT_PUBLIC_SUPABASE_URL is real
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'Email e password richiesti' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: 'Password troppo corta' }, { status: 400 });
  }

  // Set a simple session cookie
  const response = NextResponse.json({ ok: true, user: { email } });
  response.cookies.set('nexus-session', Buffer.from(JSON.stringify({ email, ts: Date.now() })).toString('base64'), {
    httpOnly: true, secure: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return response;
}
