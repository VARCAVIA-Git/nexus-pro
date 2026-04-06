import { NextResponse } from 'next/server';
import { redisSet, redisGet } from '@/lib/db/redis';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

function hashPassword(pw: string): string {
  // Simple hash for Redis auth (not bcrypt — no native module needed)
  // In production, use Supabase Auth instead
  let hash = 0;
  for (let i = 0; i < pw.length; i++) { hash = ((hash << 5) - hash + pw.charCodeAt(i)) | 0; }
  return `h_${Math.abs(hash).toString(36)}_${pw.length}`;
}

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ ok: false, error: 'Tutti i campi sono richiesti' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Password: minimo 8 caratteri' }, { status: 400 });
    }

    // Check if user exists
    const existing = await redisGet(`nexus:user:${email}`);
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Email già registrata' }, { status: 400 });
    }

    // Save user
    const userId = nanoid(12);
    const user = { id: userId, name, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    await redisSet(`nexus:user:${email}`, user);
    await redisSet(`nexus:user:id:${userId}`, user);

    // Create session
    const sessionId = nanoid(24);
    await redisSet(`nexus:session:${sessionId}`, { userId, email, name }, 604800); // 7 days

    const response = NextResponse.json({ ok: true, user: { id: userId, name, email } });
    response.cookies.set('nexus-session', sessionId, {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 604800, path: '/',
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
