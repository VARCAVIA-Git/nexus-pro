'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Le password non coincidono'); return; }
    if (!terms) { setError('Accetta i termini di servizio'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (data.ok) { router.push('/onboarding'); }
      else { setError(data.error || 'Errore registrazione'); }
    } catch { setError('Errore di connessione'); }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-n-bg px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-n-card"><Rocket size={24} className="text-n-text" /></div>
          <h1 className="mt-4 text-n-text">Crea il tuo account</h1>
          <p className="mt-2 text-sm text-n-dim">Inizia a fare trading con Nexus Pro</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">{error}</div>}

          <div>
            <label className="label mb-1.5 block">Nome</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Il tuo nome" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="label mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="trader@example.com" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="label mb-1.5 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Minimo 8 caratteri" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="label mb-1.5 block">Conferma Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Ripeti la password" className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text placeholder:text-n-dim focus:border-n-accent focus:outline-none min-h-[44px]" />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded accent-n-accent" />
            <span className="text-xs text-n-dim">Accetto i termini di servizio e la privacy policy di Nexus Pro</span>
          </label>

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg hover:opacity-90 transition-all min-h-[48px] disabled:opacity-50">
            {loading ? 'Creazione...' : 'Crea Account'}
          </button>
        </form>

        <p className="text-center text-sm text-n-dim">Hai già un account? <Link href="/login" className="text-n-text hover:underline">Accedi</Link></p>
      </div>
    </div>
  );
}
