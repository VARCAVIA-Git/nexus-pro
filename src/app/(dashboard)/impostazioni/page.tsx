'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Key, Pickaxe, Save, User, AlertTriangle, LogOut,
  CheckCircle2, XCircle, Loader2, ExternalLink, Wifi, WifiOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// ── Reusable components ──────────────────────────────────────

function Section({ title, icon: Icon, badge, children }: {
  title: string; icon: React.ElementType; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-n-text-s" />
          <h3 className="text-sm font-bold text-n-text">{title}</h3>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs font-medium text-n-text">{label}</p>
        {description && <p className="text-[10px] text-n-dim">{description}</p>}
      </div>
      <button onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition-all ${checked ? 'bg-green-500' : 'bg-n-border-b'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// ── Ticker Settings (standalone save) ────────────────────────

const ALL_TICKER = {
  crypto: ['BTC', 'ETH', 'SOL', 'LINK', 'ADA', 'DOT', 'AVAX', 'MATIC', 'DOGE', 'XRP', 'ATOM', 'UNI', 'AAVE', 'APT', 'ARB', 'OP', 'FIL', 'LTC', 'NEAR', 'INJ'],
  stocks: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD', 'NFLX', 'CRM', 'COIN', 'SQ', 'PLTR', 'UBER', 'ABNB', 'SNOW', 'MSTR', 'RIOT'],
};

function TickerSettings() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'SPY']));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings?section=ticker').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.assets && Array.isArray(d.assets)) setSelected(new Set(d.assets));
    }).catch(() => {});
  }, []);

  const toggle = (a: string) => { const s = new Set(selected); if (s.has(a)) s.delete(a); else s.add(a); setSelected(s); };
  const save = async () => {
    setSaving(true);
    const assets = Array.from(selected);
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'ticker', assets }) }),
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'ticker_global', assets }) }),
      ]);
      if (r1.ok && r2.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // Force browser to reload ticker by refreshing the page after a short delay
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSaved(false);
        alert('Errore nel salvataggio ticker. Riprova.');
      }
    } catch {
      alert('Errore di connessione.');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-n-text">Ticker</h3>
        <button onClick={save} disabled={saving} className="rounded-lg bg-n-text px-3 py-1.5 text-xs font-medium text-n-bg disabled:opacity-50">
          {saved ? 'Salvato' : saving ? '...' : 'Salva'}
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] text-n-dim">Crypto</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TICKER.crypto.map(a => (
            <button key={a} onClick={() => toggle(a)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${selected.has(a) ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-n-border text-n-dim'}`}>{a}</button>
          ))}
        </div>
        <p className="text-[10px] text-n-dim">Stocks</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TICKER.stocks.map(a => (
            <button key={a} onClick={() => toggle(a)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${selected.has(a) ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-n-border text-n-dim'}`}>{a}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function ImpostazioniPage() {
  const router = useRouter();

  // Profile
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Europe/Rome');

  // Notifications
  const [tradeNotifications, setTradeNotifications] = useState(true);
  const [signalNotifications, setSignalNotifications] = useState(true);

  // Broker — Live
  const [liveKey, setLiveKey] = useState('');
  const [liveSecret, setLiveSecret] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ connected: boolean; equity?: number; error?: string } | null>(null);
  const [paperStatus, setPaperStatus] = useState<{ connected: boolean; equity?: number } | null>(null);

  // Mine Engine
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [riskProfile, setRiskProfile] = useState('conservative');

  // UI state
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnectPassword, setDisconnectPassword] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Load data ──
  useEffect(() => {
    // Profile
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.user) { setDisplayName(d.user.name || ''); setEmail(d.user.email || ''); }
    }).catch(() => {});
    // Settings
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.settings) {
        if (d.settings.timezone) setTimezone(d.settings.timezone);
        if (d.settings.tradeNotifications !== undefined) setTradeNotifications(d.settings.tradeNotifications);
        if (d.settings.signalNotifications !== undefined) setSignalNotifications(d.settings.signalNotifications);
      }
    }).catch(() => {});
    // Broker keys (masked)
    fetch('/api/settings?section=broker').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        if (d.liveKey) setLiveKey(d.liveKey);
        if (d.liveEnabled !== undefined) setLiveEnabled(d.liveEnabled);
      }
    }).catch(() => {});
    // Broker status
    fetch('/api/broker/status').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setLiveStatus(d.live ?? null); setPaperStatus(d.paper ?? null); }
    }).catch(() => {});
    // Mine engine
    fetch('/api/mine/engine').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setEngineEnabled(d.enabled ?? false);
    }).catch(() => {});
    fetch('/api/config/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.profile?.name) setRiskProfile(d.profile.name);
    }).catch(() => {});
  }, []);

  // ── Save all ──
  const handleSave = async () => {
    setSaving(true);
    const errors: string[] = [];
    try {
      // Profile + notifications
      const r1 = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName, email, timezone, tradeNotifications, signalNotifications }),
      });
      if (!r1.ok) errors.push('profilo');

      // Note: broker keys are saved separately via "Collega Broker" button

      if (errors.length === 0) {
        showToast('Impostazioni salvate', true);
      } else {
        showToast(`Errore: ${errors.join(', ')}`, false);
      }
    } catch { showToast('Errore di connessione', false); }
    setSaving(false);
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Connect broker: test keys → save to Redis (encrypted) → update status ──
  const connectBroker = async () => {
    if (!liveKey || !liveSecret) {
      showToast('Inserisci API Key e Secret Key', false);
      return;
    }
    setConnectingBroker(true);
    try {
      // Step 1: Test the keys
      const testRes = await fetch('/api/broker/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: liveKey, secret: liveSecret }),
      });
      const testData = await testRes.json();

      if (!testData.connected) {
        setLiveStatus({ connected: false, error: testData.error });
        showToast(testData.error || 'Keys non valide', false);
        setConnectingBroker(false);
        return;
      }

      // Step 2: Keys work — save them (encrypted) to Redis
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'broker',
          liveKey,
          liveSecret,
          liveEnabled: true,
        }),
      });

      if (saveRes.ok) {
        setLiveStatus({ connected: true, equity: testData.equity });
        setLiveEnabled(true);
        showToast(`Broker connesso! Equity: $${testData.equity?.toLocaleString('en-US')} (${testData.accountType})`, true);
      } else {
        showToast('Connessione OK ma errore nel salvataggio', false);
      }
    } catch {
      showToast('Errore di rete', false);
    }
    setConnectingBroker(false);
  };

  // ── Disconnect broker: verify password → delete keys ──
  const disconnectBroker = async () => {
    if (!disconnectPassword) { showToast('Inserisci la password', false); return; }
    setDisconnecting(true);
    try {
      // Verify password via login endpoint
      const authRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: disconnectPassword }),
      });
      if (!authRes.ok) {
        showToast('Password non corretta', false);
        setDisconnecting(false);
        return;
      }
      // Password verified — delete broker keys
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'broker', liveKey: '', liveSecret: '', liveEnabled: false }),
      });
      setLiveKey('');
      setLiveSecret('');
      setLiveEnabled(false);
      setLiveStatus(null);
      setShowDisconnect(false);
      setDisconnectPassword('');
      showToast('API disconnesse', true);
    } catch {
      showToast('Errore durante la disconnessione', false);
    }
    setDisconnecting(false);
  };

  // ── Mine engine toggle ──
  const toggleEngine = async (v: boolean) => {
    await fetch('/api/mine/engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: v ? 'start' : 'stop' }) }).catch(() => {});
    setEngineEnabled(v);
  };

  const changeProfile = async (p: string) => {
    await fetch('/api/config/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: p }) }).catch(() => {});
    setRiskProfile(p);
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-fade-in ${toast.ok ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Impostazioni</h1>
          <p className="text-xs text-n-dim">Configura il tuo centro di trading</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-n-text px-4 py-2.5 text-xs font-bold text-n-bg hover:opacity-90 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Salvataggio...' : 'Salva tutto'}
        </button>
      </div>

      {/* ═══ BROKER CONNECTION — Main section ═══ */}
      <Section
        title="Connessione Broker"
        icon={Key}
        badge={
          liveStatus?.connected ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-2.5 py-1">
              <Wifi size={12} className="text-green-400" />
              <span className="text-[10px] font-bold text-green-400">Connesso · ${liveStatus.equity?.toLocaleString('en-US') ?? '—'}</span>
            </div>
          ) : paperStatus?.connected ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1">
              <Wifi size={12} className="text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400">Solo Paper · ${paperStatus.equity?.toLocaleString('en-US') ?? '—'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1">
              <WifiOff size={12} className="text-red-400" />
              <span className="text-[10px] font-bold text-red-400">Non connesso</span>
            </div>
          )
        }
      >
        <div className="space-y-4">
          {/* Live Trading Keys */}
          <div>
            <p className="mb-2 text-[11px] font-semibold text-n-text">Alpaca API Keys</p>
            <p className="mb-3 text-[10px] text-n-dim">
              Inserisci le tue API keys di{' '}
              <a href="https://app.alpaca.markets" target="_blank" rel="noopener" className="text-blue-400 hover:underline">
                Alpaca <ExternalLink size={9} className="inline" />
              </a>
              {' '}per collegare il broker ed eseguire operazioni.
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-n-dim">API Key</label>
                <input
                  type="text"
                  value={liveKey}
                  onChange={e => setLiveKey(e.target.value)}
                  placeholder="AK... o PK..."
                  autoComplete="off"
                  className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2.5 font-mono text-xs text-n-text placeholder:text-n-dim focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-n-dim">Secret Key</label>
                <input
                  type="text"
                  value={liveSecret}
                  onChange={e => setLiveSecret(e.target.value)}
                  placeholder="Inserisci la Secret Key"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2.5 font-mono text-xs text-n-text placeholder:text-n-dim focus:border-blue-500/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Connect button — saves keys + tests + enables */}
          <button
            onClick={connectBroker}
            disabled={connectingBroker || !liveKey || !liveSecret}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-blue-500 text-white hover:bg-blue-600"
          >
            {connectingBroker ? <><Loader2 size={16} className="animate-spin" /> Connessione...</> : <><Wifi size={16} /> Collega Broker</>}
          </button>

          {/* Connection status detail */}
          {liveStatus && (
            <div className={`rounded-lg p-3 text-[11px] ${liveStatus.connected ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {liveStatus.connected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} />
                    <span>Broker connesso. Equity: <span className="font-mono font-bold">${liveStatus.equity?.toLocaleString('en-US')}</span></span>
                  </div>
                  <button onClick={() => setShowDisconnect(true)} className="text-[10px] text-red-400 hover:underline">Disconnetti</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle size={14} />
                  <span>{liveStatus.error ?? 'Keys non configurate'}</span>
                </div>
              )}
            </div>
          )}

          {/* Disconnect confirmation dialog */}
          {showDisconnect && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-red-400">Conferma disconnessione</p>
              <p className="text-[10px] text-n-dim">Inserisci la password del tuo account per confermare la rimozione delle API keys.</p>
              <input
                type="password"
                value={disconnectPassword}
                onChange={e => setDisconnectPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-red-500/50 focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={disconnectBroker} disabled={disconnecting} className="flex-1 rounded-lg bg-red-500/20 py-2 text-xs font-bold text-red-400 hover:bg-red-500/30 disabled:opacity-50">
                  {disconnecting ? 'Disconnessione...' : 'Conferma disconnessione'}
                </button>
                <button onClick={() => { setShowDisconnect(false); setDisconnectPassword(''); }} className="rounded-lg border border-n-border px-4 py-2 text-xs text-n-dim hover:text-n-text">
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ═══ AI ENGINE ═══ */}
        <Section
          title="AI Engine"
          icon={Pickaxe}
          badge={
            <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${engineEnabled ? 'bg-green-500/10 text-green-400' : 'bg-n-bg-s text-n-dim'}`}>
              {engineEnabled ? 'ATTIVO' : 'SPENTO'}
            </span>
          }
        >
          <div className="space-y-3">
            <Toggle
              label="Mine Engine"
              description="L'AI apre operazioni automatiche basate sui segnali"
              checked={engineEnabled}
              onChange={toggleEngine}
            />
            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-n-dim">Profilo di rischio</label>
              <div className="flex rounded-lg border border-n-border">
                {(['conservative', 'moderate', 'aggressive'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => changeProfile(p)}
                    className={`flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors ${riskProfile === p ? 'bg-n-accent-dim text-n-text' : 'text-n-dim hover:text-n-text'}`}
                  >
                    {p === 'conservative' ? 'Prudente' : p === 'moderate' ? 'Moderato' : 'Aggressivo'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[9px] text-n-dim">
                {riskProfile === 'conservative' && 'Max 5% equity, 3 posizioni, alta confidenza richiesta'}
                {riskProfile === 'moderate' && 'Max 10% equity, 5 posizioni, confidenza media'}
                {riskProfile === 'aggressive' && 'Max 20% equity, 8 posizioni, soglia bassa'}
              </p>
            </div>
          </div>
        </Section>

        {/* ═══ NOTIFICATIONS ═══ */}
        <Section title="Notifiche" icon={Bell}>
          <div className="space-y-1">
            <Toggle label="Notifiche Trade" description="Quando un bot apre o chiude una posizione" checked={tradeNotifications} onChange={setTradeNotifications} />
            <Toggle label="Notifiche Segnali" description="Quando l'AI identifica un'opportunità" checked={signalNotifications} onChange={setSignalNotifications} />
          </div>
        </Section>

        {/* ═══ PROFILE ═══ */}
        <Section title="Profilo" icon={User}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Nome</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Il tuo nome"
                className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text placeholder:text-n-dim focus:border-n-border-b focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
                className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text placeholder:text-n-dim focus:border-n-border-b focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Timezone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                <option value="Europe/Rome">Europe/Rome (CET)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
          </div>
        </Section>

        {/* ═══ TICKER ═══ */}
        <TickerSettings />
      </div>

      {/* ═══ ACCOUNT ═══ */}
      <div className="flex items-center justify-between rounded-xl border border-n-border bg-n-card p-4">
        <div>
          <p className="text-xs font-medium text-n-text">{email || displayName || 'Account'}</p>
          <p className="text-[10px] text-n-dim">Sessione attiva</p>
        </div>
        <button
          onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }}
          className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-all"
        >
          <LogOut size={13} /> Logout
        </button>
      </div>
    </div>
  );
}
