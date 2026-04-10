'use client';

import { useState, useEffect } from 'react';
import {
  Bell, Key, Pickaxe,
  Save, User, Globe, AlertTriangle, LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={15} className="text-n-text-s" />
        <h3 className="text-sm font-bold text-n-text">{title}</h3>
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
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-all ${checked ? 'bg-green-500' : 'bg-n-border-b'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-n-dim">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 font-mono text-xs text-n-text placeholder:text-n-dim focus:border-n-border-b focus:outline-none"
      />
    </div>
  );
}

const ALL_TICKER_ASSETS = {
  crypto: ['BTC', 'ETH', 'SOL', 'LINK', 'ADA', 'DOT', 'AVAX', 'MATIC', 'DOGE', 'XRP'],
  stocks: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ', 'AMD'],
};
const DEFAULT_TICKER = ['BTC', 'ETH', 'SOL', 'AAPL', 'NVDA', 'SPY', 'QQQ'];

function TickerSettings() {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_TICKER));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings?section=ticker').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.assets && Array.isArray(d.assets)) setSelected(new Set(d.assets));
    }).catch(() => {});
  }, []);

  const toggle = (a: string) => {
    const s = new Set(selected);
    if (s.has(a)) s.delete(a); else s.add(a);
    setSelected(s);
  };

  const save = async () => {
    setSaving(true);
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'ticker', assets: Array.from(selected) }) }).catch(() => {});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-xl border border-n-border bg-n-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-n-text">Ticker Wall Street</h3>
        <button onClick={save} disabled={saving} className="rounded-lg bg-n-text px-3 py-1.5 text-xs font-medium text-n-bg min-h-[36px] disabled:opacity-50">
          {saved ? '✓ Salvato' : saving ? '...' : 'Salva'}
        </button>
      </div>
      <p className="text-xs text-n-dim">Crypto</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_TICKER_ASSETS.crypto.map(a => (
          <button key={a} onClick={() => toggle(a)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${selected.has(a) ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-n-border text-n-dim'}`}>{a}</button>
        ))}
      </div>
      <p className="text-xs text-n-dim">Stocks</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_TICKER_ASSETS.stocks.map(a => (
          <button key={a} onClick={() => toggle(a)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${selected.has(a) ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-n-border text-n-dim'}`}>{a}</button>
        ))}
      </div>
    </div>
  );
}

function MineEngineSettings() {
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [profile, setProfile] = useState<string>('conservative');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/mine/engine').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setEngineEnabled(d.enabled ?? false);
    }).catch(() => {});
    fetch('/api/config/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.profile?.name) setProfile(d.profile.name);
    }).catch(() => {});
  }, []);

  const toggleEngine = async (v: boolean) => {
    setSaving(true);
    await fetch('/api/mine/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: v ? 'start' : 'stop' }),
    }).catch(() => {});
    setEngineEnabled(v);
    setSaving(false);
  };

  const changeProfile = async (p: string) => {
    setSaving(true);
    await fetch('/api/config/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: p }),
    }).catch(() => {});
    setProfile(p);
    setSaving(false);
  };

  return (
    <Section title="Mine Engine" icon={Pickaxe}>
      <div className="space-y-3">
        <Toggle
          label="Mine Engine Attivo"
          description="Abilita l'apertura automatica di mine basate sui segnali AI"
          checked={engineEnabled}
          onChange={toggleEngine}
        />
        <div>
          <label className="mb-1 block text-[10px] font-medium text-n-dim">Profilo di rischio</label>
          <div className="flex rounded-lg border border-n-border">
            {(['conservative', 'moderate', 'aggressive'] as const).map((p) => (
              <button
                key={p}
                onClick={() => changeProfile(p)}
                disabled={saving}
                className={`flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  profile === p ? 'bg-n-accent-dim text-n-text' : 'text-n-dim hover:text-n-text'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-n-dim">
            {profile === 'conservative' && 'Max 5% equity a rischio, 3 mine, alta confidenza richiesta'}
            {profile === 'moderate' && 'Max 10% equity a rischio, 5 mine, confidenza media'}
            {profile === 'aggressive' && 'Max 20% equity a rischio, 8 mine, bassa soglia confidenza'}
          </p>
        </div>
      </div>
    </Section>
  );
}

export default function ImpostazioniPage() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // Profile
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Europe/Rome');

  // Notifications
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [tradeNotifications, setTradeNotifications] = useState(true);
  const [signalNotifications, setSignalNotifications] = useState(true);

  // API Keys — Paper
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');
  // API Keys — Live
  const [alpacaLiveKey, setAlpacaLiveKey] = useState('');
  const [alpacaLiveSecret, setAlpacaLiveSecret] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(false);

  // Broker status
  const [brokerStatus, setBrokerStatus] = useState<{ paper: { connected: boolean; equity?: number }; live: { connected: boolean; equity?: number; error?: string }; liveConfigured: boolean } | null>(null);

  // Market data providers
  const [twelveDataKey, setTwelveDataKey] = useState('');
  const [coinGeckoKey, setCoinGeckoKey] = useState('');

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/broker/status').then(r => r.json()).then(setBrokerStatus).catch(() => {});
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => { if (d?.user) { setDisplayName(d.user.name || ''); setEmail(d.user.email || ''); } }).catch(() => {});
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.settings) {
        if (d.settings.timezone) setTimezone(d.settings.timezone);
        if (d.settings.emailAlerts !== undefined) setEmailAlerts(d.settings.emailAlerts);
      }
    }).catch(() => {});
    // Load saved broker keys (masked)
    fetch('/api/settings?section=broker').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        if (d.paperKey) setAlpacaKey(d.paperKey);
        if (d.liveKey) setAlpacaLiveKey(d.liveKey);
        if (d.liveEnabled !== undefined) setLiveEnabled(d.liveEnabled);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const errors: string[] = [];
    try {
      // 1. Save profile & notifications
      const res = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName, email, timezone, emailAlerts, tradeNotifications, signalNotifications }),
      });
      if (!res.ok) errors.push('profilo');

      // 2. Save broker keys (only if user entered them)
      if (alpacaKey || alpacaSecret || alpacaLiveKey || alpacaLiveSecret) {
        const brokerRes = await fetch('/api/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: 'broker',
            paperKey: alpacaKey || undefined,
            paperSecret: alpacaSecret || undefined,
            liveKey: alpacaLiveKey || undefined,
            liveSecret: alpacaLiveSecret || undefined,
            liveEnabled,
          }),
        });
        if (!brokerRes.ok) errors.push('broker');
      }

      // 3. Save market data keys
      if (twelveDataKey || coinGeckoKey) {
        const dataRes = await fetch('/api/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: 'market_data',
            twelveDataKey: twelveDataKey || undefined,
            coinGeckoKey: coinGeckoKey || undefined,
          }),
        });
        if (!dataRes.ok) errors.push('market data');
      }

      if (errors.length === 0) {
        setToast({ msg: 'Impostazioni salvate', ok: true });
        // Refresh broker status
        fetch('/api/broker/status').then(r => r.json()).then(setBrokerStatus).catch(() => {});
      } else {
        setToast({ msg: `Errore nel salvataggio: ${errors.join(', ')}`, ok: false });
      }
    } catch { setToast({ msg: 'Errore di connessione', ok: false }); }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-fade-in ${toast.ok ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">Impostazioni</h1>
          <p className="text-xs text-n-dim">Profilo, notifiche, API keys e preferenze</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-n-text px-4 py-2 text-xs font-semibold text-n-bg hover:opacity-90 transition-all disabled:opacity-50 min-h-[36px]">
          <Save size={13} /> {saving ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Profile */}
        <Section title="Profilo" icon={User}>
          <div className="space-y-3">
            <InputField label="Nome" value={displayName} onChange={setDisplayName} placeholder="Il tuo nome" />
            <InputField label="Email" value={email} onChange={setEmail} type="email" placeholder="email@example.com" />
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none"
              >
                <option value="Europe/Rome">Europe/Rome (CET)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifiche" icon={Bell}>
          <div className="space-y-1">
            <Toggle label="Email Alerts" description="Ricevi avvisi via email per segnali e trade" checked={emailAlerts} onChange={setEmailAlerts} />
            <div className="my-2 border-t border-n-border" />
            <Toggle label="Notifiche Trade" description="Avvisi per apertura e chiusura posizioni" checked={tradeNotifications} onChange={setTradeNotifications} />
            <Toggle label="Notifiche Segnali" description="Avvisi per nuovi segnali generati" checked={signalNotifications} onChange={setSignalNotifications} />
          </div>
        </Section>

        {/* Broker: Alpaca — single section with both environments */}
        <Section title="Broker Alpaca" icon={Key}>
          <div className="space-y-4">
            {/* Paper (active) */}
            <div className="rounded-lg bg-n-bg/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-n-text">Ambiente Simulato (Paper)</p>
                {brokerStatus?.paper.connected && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span className="text-[10px] font-semibold text-green-400">${brokerStatus.paper.equity?.toLocaleString('en-US') ?? '—'}</span>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-n-dim">I bot operano qui con soldi virtuali. Nessun rischio reale.</p>
              <InputField label="API Key" value={alpacaKey} onChange={setAlpacaKey} placeholder="PK..." />
              <InputField label="Secret" value={alpacaSecret} onChange={setAlpacaSecret} type="password" placeholder="Secret Key" />
            </div>

            {/* Live (optional) */}
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-n-text">Fondi Reali (Live)</p>
                {brokerStatus?.live.connected ? (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-[10px] font-semibold text-blue-400">${brokerStatus.live.equity?.toLocaleString('en-US') ?? '—'}</span>
                  </div>
                ) : (
                  <span className="text-[9px] text-n-dim">Non attivo</span>
                )}
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-[9px] text-red-300/80">Configura solo quando sei pronto a rischiare capitale reale.</p>
              </div>
              <InputField label="API Key" value={alpacaLiveKey} onChange={setAlpacaLiveKey} placeholder="AK..." />
              <InputField label="Secret" value={alpacaLiveSecret} onChange={setAlpacaLiveSecret} type="password" placeholder="Secret Key" />
              <Toggle label="Abilita Fondi Reali" description="I bot opereranno con denaro vero" checked={liveEnabled} onChange={setLiveEnabled} />
              <p className="text-[9px] text-n-dim"><a href="https://app.alpaca.markets" target="_blank" rel="noopener" className="text-blue-400 hover:underline">Gestisci fondi su Alpaca</a></p>
            </div>
          </div>
        </Section>

        {/* Market Data */}
        <Section title="Market Data" icon={Globe}>
          <div className="space-y-4">
            <div className="rounded-lg bg-n-bg/60 p-3">
              <p className="text-[11px] font-semibold text-n-text mb-2">Twelve Data — Azioni</p>
              <InputField label="API Key" value={twelveDataKey} onChange={setTwelveDataKey} placeholder="Inserisci Twelve Data API Key" />
              <p className="mt-1 text-[9px] text-n-dim">Dati OHLCV e prezzi per azioni (AAPL, NVDA, TSLA...)</p>
            </div>
            <div className="rounded-lg bg-n-bg/60 p-3">
              <p className="text-[11px] font-semibold text-n-text mb-2">CoinGecko — Crypto</p>
              <InputField label="API Key" value={coinGeckoKey} onChange={setCoinGeckoKey} placeholder="Inserisci CoinGecko API Key (opzionale)" />
              <p className="mt-1 text-[9px] text-n-dim">Prezzi e dati di mercato crypto. La chiave API è opzionale ma aumenta i rate limits.</p>
            </div>
          </div>
        </Section>

        {/* Mine Engine */}
        <MineEngineSettings />

        {/* empty slot for grid balance */}
      </div>

      {/* Ticker assets */}
      <TickerSettings />

      {/* Account section */}
      <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-5 space-y-3">
        <h3 className="text-sm font-medium text-n-text">Account</h3>
        <p className="text-xs text-n-dim">{email || 'Non autenticato'}</p>
        <button onClick={handleLogout} className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-all min-h-[44px]">
          <LogOut size={14} /> Logout
        </button>
      </div>
    </div>
  );
}
