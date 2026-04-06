'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) { router.push('/dashboard'); }
      else { setError(data.error || 'Credenziali non valide'); }
    } catch { setError('Errore di connessione'); }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-n-bg px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-n-card">
            <Rocket size={24} className="text-n-text" />
          </div>
          <h1 className="mt-4 text-n-text">Accedi a Nexus Pro</h1>
          <p className="mt-2 text-sm text-n-dim">Piattaforma di trading algoritmico</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">{error}</div>}

          <div>
            <label className="label mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="trader@example.com" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="label mb-1.5 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg hover:opacity-90 transition-all min-h-[48px] disabled:opacity-50">
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>

        <div className="text-center text-sm text-n-dim">
          <p>Non hai un account? <Link href="/register" className="text-n-text hover:underline">Registrati</Link></p>
          <p className="mt-1"><Link href="/forgot-password" className="text-n-dim hover:text-n-text">Password dimenticata?</Link></p>
        </div>
      </div>
    </div>
  );
}
