'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Key, ToggleLeft, CheckCircle } from 'lucide-react';

const STEPS = ['Benvenuto', 'Broker', 'Modalità', 'Pronto'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');
  const [mode, setMode] = useState<'demo' | 'real'>('demo');

  return (
    <div className="flex min-h-screen items-center justify-center bg-n-bg px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full transition-all ${i <= step ? 'bg-n-text' : 'bg-n-border'}`} />
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < step ? 'bg-n-text' : 'bg-n-border'}`} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="text-center space-y-6">
            <Rocket size={48} className="mx-auto text-n-text" />
            <div>
              <h1 className="text-n-text">Benvenuto su Nexus Pro</h1>
              <p className="mt-3 text-sm text-n-dim leading-relaxed">Piattaforma di trading algoritmico con analisi multi-timeframe, news sentiment, e adaptive learning engine.</p>
            </div>
            <button onClick={() => setStep(1)} className="w-full rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg min-h-[48px]">Iniziamo</button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <Key size={36} className="mx-auto text-n-text" />
              <h2 className="mt-4 text-n-text">Collega il tuo broker</h2>
              <p className="mt-2 text-sm text-n-dim">Inserisci le API keys di Alpaca Markets per il paper trading.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">API Key</label>
                <input type="text" value={alpacaKey} onChange={e => setAlpacaKey(e.target.value)} placeholder="PK..." className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text min-h-[44px] font-mono focus:border-n-accent focus:outline-none" />
              </div>
              <div>
                <label className="label mb-1.5 block">Secret Key</label>
                <input type="password" value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)} placeholder="Secret..." className="w-full rounded-xl border border-n-border bg-n-card px-4 py-3 text-sm text-n-text min-h-[44px] font-mono focus:border-n-accent focus:outline-none" />
              </div>
              <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener" className="block text-center text-xs text-n-dim hover:text-n-text">Non hai le chiavi? Crea un account Alpaca gratuito →</a>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 rounded-xl border border-n-border py-3 text-sm text-n-dim min-h-[48px]">Indietro</button>
              <button onClick={() => setStep(2)} className="flex-1 rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg min-h-[48px]">{alpacaKey ? 'Avanti' : 'Salta per ora'}</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <ToggleLeft size={36} className="mx-auto text-n-text" />
              <h2 className="mt-4 text-n-text">Scegli la modalità</h2>
              <p className="mt-2 text-sm text-n-dim">Puoi cambiare in qualsiasi momento dalla sidebar.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('demo')} className={`rounded-xl border p-5 text-left transition-all ${mode === 'demo' ? 'border-amber-500/30 bg-amber-500/5' : 'border-n-border'}`}>
                <p className="text-base font-medium text-n-text">Demo</p>
                <p className="mt-1 text-xs text-n-dim">Capitale virtuale, zero rischio</p>
              </button>
              <button onClick={() => setMode('real')} className={`rounded-xl border p-5 text-left transition-all ${mode === 'real' ? 'border-blue-500/30 bg-blue-500/5' : 'border-n-border'}`}>
                <p className="text-base font-medium text-n-text">Real</p>
                <p className="mt-1 text-xs text-n-dim">Fondi reali su Alpaca</p>
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-n-border py-3 text-sm text-n-dim min-h-[48px]">Indietro</button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg min-h-[48px]">Avanti</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-6">
            <CheckCircle size={48} className="mx-auto text-n-green" />
            <div>
              <h2 className="text-n-text">Tutto pronto!</h2>
              <p className="mt-2 text-sm text-n-dim">Il tuo account è configurato. Vai alla dashboard per iniziare.</p>
            </div>
            <button onClick={() => router.push('/dashboard')} className="w-full rounded-xl bg-n-text py-3 text-sm font-medium text-n-bg min-h-[48px]">Vai alla Dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}
