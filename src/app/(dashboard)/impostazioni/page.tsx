'use client';

import { useState, useEffect } from 'react';
import {
  Shield, DollarSign, Gauge, Bell, Key,
  Save, RotateCcw, User, Globe, AlertTriangle, LogOut,
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
  const [telegramAlerts, setTelegramAlerts] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);
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
        if (d.settings.telegramAlerts !== undefined) setTelegramAlerts(d.settings.telegramAlerts);
        if (d.settings.pushNotifications !== undefined) setPushNotifications(d.settings.pushNotifications);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName, email, timezone, emailAlerts, telegramAlerts, pushNotifications, tradeNotifications, signalNotifications }),
      });
      setToast(res.ok ? { msg: 'Impostazioni salvate', ok: true } : { msg: 'Errore nel salvataggio', ok: false });
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
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors">
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-n-text px-4 py-1.5 text-xs font-semibold text-n-bg hover:opacity-90 transition-all disabled:opacity-50">
            <Save size={13} /> {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
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
            <Toggle label="Telegram Alerts" description="Notifiche tramite bot Telegram" checked={telegramAlerts} onChange={setTelegramAlerts} />
            <Toggle label="Push Notifications" description="Notifiche browser in tempo reale" checked={pushNotifications} onChange={setPushNotifications} />
            <div className="my-2 border-t border-n-border" />
            <Toggle label="Notifiche Trade" description="Avvisi per apertura e chiusura posizioni" checked={tradeNotifications} onChange={setTradeNotifications} />
            <Toggle label="Notifiche Segnali" description="Avvisi per nuovi segnali generati" checked={signalNotifications} onChange={setSignalNotifications} />
          </div>
        </Section>

        {/* Broker: Alpaca Paper */}
        <Section title="Broker — Paper Trading" icon={Key}>
          <div className="space-y-3">
            {brokerStatus?.paper.connected && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-2.5">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-[10px] font-semibold text-green-400">Connesso — Equity: ${brokerStatus.paper.equity?.toLocaleString('en-US') ?? '—'}</span>
              </div>
            )}
            <InputField label="Paper API Key" value={alpacaKey} onChange={setAlpacaKey} placeholder="PK..." />
            <InputField label="Paper Secret" value={alpacaSecret} onChange={setAlpacaSecret} type="password" placeholder="Secret Key" />
            <p className="text-[9px] text-n-dim">paper-api.alpaca.markets — usato per /demo/*</p>
          </div>
        </Section>

        {/* Broker: Alpaca Live */}
        <Section title="Broker — Live Trading" icon={Key}>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-red-300/80">
                Attenzione: il live trading usa fondi reali. Configura solo se sei pronto a operare con denaro vero.
              </p>
            </div>

            {brokerStatus?.live.connected ? (
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 p-2.5">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-[10px] font-semibold text-blue-400">Connesso — Equity: ${brokerStatus.live.equity?.toLocaleString('en-US') ?? '—'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-n-bg/60 p-2.5">
                <span className="h-2 w-2 rounded-full bg-n-dim" />
                <span className="text-[10px] text-n-dim">{brokerStatus?.live.error ?? 'Non configurato'}</span>
              </div>
            )}

            <InputField label="Live API Key" value={alpacaLiveKey} onChange={setAlpacaLiveKey} placeholder="AK..." />
            <InputField label="Live Secret" value={alpacaLiveSecret} onChange={setAlpacaLiveSecret} type="password" placeholder="Secret Key" />
            <Toggle label="Abilita Live Trading" description="Permette al bot di operare con fondi reali su /real/*" checked={liveEnabled} onChange={setLiveEnabled} />
            <p className="text-[9px] text-n-dim">api.alpaca.markets — usato per /real/* | <a href="https://app.alpaca.markets" target="_blank" rel="noopener" className="text-blue-400 hover:underline">Gestisci fondi su Alpaca</a></p>
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

        {/* Preferences */}
        <Section title="Preferenze" icon={Shield}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Tema</label>
              <div className="flex rounded-lg border border-n-border">
                {(['dark', 'system'] as const).map((t) => (
                  <button key={t} className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${t === 'dark' ? 'bg-n-accent-dim text-n-text' : 'text-n-dim hover:text-n-text'}`}>
                    {t === 'dark' ? 'Dark' : 'System'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Lingua</label>
              <select className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-n-dim">Formato valuta</label>
              <select className="w-full rounded-lg border border-n-border bg-n-input px-3 py-2 text-xs text-n-text focus:border-n-border-b focus:outline-none">
                <option value="usd">USD ($)</option>
                <option value="eur">EUR (&euro;)</option>
              </select>
            </div>
          </div>
        </Section>
      </div>

      {/* Ticker assets */}
      <div className="rounded-xl border border-n-border bg-n-card p-5">
        <h3 className="text-sm font-medium text-n-text mb-3">Ticker Wall Street</h3>
        <p className="text-xs text-n-dim mb-3">Seleziona gli asset da mostrare nel ticker in alto.</p>
        <div className="flex flex-wrap gap-2">
          {['BTC', 'ETH', 'SOL', 'LINK', 'AVAX', 'DOT', 'AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT', 'META', 'AMD', 'SPY', 'QQQ'].map(a => (
            <button key={a} className="rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text hover:border-n-accent transition-all min-h-[36px]">{a}</button>
          ))}
        </div>
      </div>

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
