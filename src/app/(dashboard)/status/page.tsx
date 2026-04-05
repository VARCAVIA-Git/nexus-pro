'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle, XCircle, RefreshCw, Activity, Server,
  Database, Radio, Wifi, Bot, Clock,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'ok' | 'error' | 'checking';
  details?: string;
  latency?: number;
}

interface BotInfo {
  running: boolean;
  startedAt: string | null;
  tickCount: number;
  positions: number;
  closedTrades: number;
  lastTick: string | null;
  equity: number;
  accountEquity: number;
  totalPnl: number;
  error: string | null;
}

export default function StatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Alpaca Markets', status: 'checking' },
    { name: 'Twelve Data', status: 'checking' },
    { name: 'CoinGecko', status: 'checking' },
    { name: 'Upstash Redis', status: 'checking' },
  ]);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [checking, setChecking] = useState(true);

  const checkAll = async () => {
    setChecking(true);
    const results: ServiceStatus[] = [];

    // Alpaca
    try {
      const t0 = Date.now();
      const res = await fetch('/api/bot/status');
      const latency = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        setBotInfo(data);
        results.push({
          name: 'Alpaca Markets',
          status: data.accountEquity > 0 || data.running ? 'ok' : 'ok',
          details: data.running
            ? `Running | $${data.accountEquity.toLocaleString()} equity`
            : `Idle | Last equity: $${data.accountEquity.toLocaleString()}`,
          latency,
        });
      } else {
        results.push({ name: 'Alpaca Markets', status: 'error', details: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      results.push({ name: 'Alpaca Markets', status: 'error', details: e.message });
    }

    // Twelve Data
    try {
      const t0 = Date.now();
      const res = await fetch('/api/prices');
      const latency = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        const stocks = data.prices?.filter((p: any) => p.type === 'stock') ?? [];
        results.push({
          name: 'Twelve Data',
          status: stocks.length > 0 ? 'ok' : 'error',
          details: stocks.length > 0 ? `${stocks.length} stocks | AAPL $${stocks.find((s: any) => s.symbol === 'AAPL')?.price?.toFixed(2) ?? '—'}` : 'No data',
          latency,
        });
      } else {
        results.push({ name: 'Twelve Data', status: 'error', details: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      results.push({ name: 'Twelve Data', status: 'error', details: e.message });
    }

    // CoinGecko
    try {
      const t0 = Date.now();
      const res = await fetch('/api/prices');
      const latency = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        const crypto = data.prices?.filter((p: any) => p.type === 'crypto') ?? [];
        results.push({
          name: 'CoinGecko',
          status: crypto.length > 0 ? 'ok' : 'error',
          details: crypto.length > 0 ? `${crypto.length} coins | BTC $${crypto.find((s: any) => s.symbol === 'BTC/USD')?.price?.toLocaleString() ?? '—'}` : 'No data',
          latency,
        });
      } else {
        results.push({ name: 'CoinGecko', status: 'error', details: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      results.push({ name: 'CoinGecko', status: 'error', details: e.message });
    }

    // Upstash Redis
    try {
      const t0 = Date.now();
      const res = await fetch('/api/notifications');
      const latency = Date.now() - t0;
      results.push({
        name: 'Upstash Redis',
        status: res.ok ? 'ok' : 'error',
        details: res.ok ? `Connected | ${latency}ms` : `HTTP ${res.status}`,
        latency,
      });
    } catch (e: any) {
      results.push({ name: 'Upstash Redis', status: 'error', details: e.message });
    }

    setServices(results);

    // Load recent signals
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signalLog?.slice(0, 50) ?? []);
      }
    } catch {}

    setChecking(false);
  };

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const allOk = services.every((s) => s.status === 'ok');
  const uptime = botInfo?.startedAt
    ? Math.floor((Date.now() - new Date(botInfo.startedAt).getTime()) / 60000)
    : 0;

  return (
    <div className="space-y-5 stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-n-text">System Status</h1>
          <p className="text-xs text-n-dim">Health check di tutti i servizi</p>
        </div>
        <button onClick={checkAll} disabled={checking} className="flex items-center gap-1.5 rounded-lg border border-n-border px-3 py-1.5 text-xs text-n-dim hover:text-n-text transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> Check
        </button>
      </div>

      {/* Overall status */}
      <div className={`flex items-center gap-3 rounded-xl border-2 p-4 ${allOk ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        {allOk ? <CheckCircle size={24} className="text-green-400" /> : <XCircle size={24} className="text-red-400" />}
        <div>
          <p className={`text-sm font-bold ${allOk ? 'text-green-400' : 'text-red-400'}`}>
            {allOk ? 'Tutti i servizi operativi' : 'Alcuni servizi non disponibili'}
          </p>
          <p className="text-[10px] text-n-dim">{services.filter((s) => s.status === 'ok').length}/{services.length} online</p>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {services.map((s) => {
          const icons: Record<string, React.ElementType> = {
            'Alpaca Markets': Wifi, 'Twelve Data': Radio, 'CoinGecko': Radio, 'Upstash Redis': Database,
          };
          const Icon = icons[s.name] ?? Server;
          return (
            <div key={s.name} className="rounded-xl border border-n-border bg-n-card p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon size={15} className="text-n-dim" />
                {s.status === 'ok' ? <CheckCircle size={14} className="text-green-400" /> :
                 s.status === 'error' ? <XCircle size={14} className="text-red-400" /> :
                 <RefreshCw size={14} className="text-n-dim animate-spin" />}
              </div>
              <p className="text-xs font-bold text-n-text">{s.name}</p>
              <p className="mt-0.5 text-[10px] text-n-dim">{s.details ?? 'Checking...'}</p>
              {s.latency !== undefined && <p className="mt-0.5 font-mono text-[9px] text-n-dim">{s.latency}ms</p>}
            </div>
          );
        })}
      </div>

      {/* Bot status */}
      <div className="rounded-xl border border-n-border bg-n-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot size={15} className="text-n-text-s" />
          <h3 className="text-xs font-bold text-n-text">Trading Bot</h3>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold ${botInfo?.running ? 'bg-green-500/15 text-green-400' : 'bg-n-border text-n-dim'}`}>
            {botInfo?.running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">Uptime</p>
            <p className="font-mono text-sm font-bold text-n-text">{botInfo?.running ? `${uptime}m` : '—'}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">Ticks</p>
            <p className="font-mono text-sm font-bold text-n-text">{botInfo?.tickCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">Posizioni</p>
            <p className="font-mono text-sm font-bold text-n-text">{botInfo?.positions ?? 0}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">Trades</p>
            <p className="font-mono text-sm font-bold text-n-text">{botInfo?.closedTrades ?? 0}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">Equity</p>
            <p className="font-mono text-sm font-bold text-n-text">${(botInfo?.accountEquity ?? 0).toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-n-bg/60 p-2.5">
            <p className="text-[9px] text-n-dim">P&L</p>
            <p className={`font-mono text-sm font-bold ${(botInfo?.totalPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(botInfo?.totalPnl ?? 0) >= 0 ? '+' : ''}${(botInfo?.totalPnl ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
        {botInfo?.lastTick && (
          <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-n-dim">
            <Clock size={10} /> Ultimo tick: {new Date(botInfo.lastTick).toLocaleString('it-IT')}
          </p>
        )}
        {botInfo?.error && (
          <p className="mt-2 text-[10px] text-red-400">Errore: {botInfo.error}</p>
        )}
      </div>

      {/* Recent bot log */}
      {signals.length > 0 && (
        <div className="rounded-xl border border-n-border bg-n-card p-4">
          <h3 className="mb-3 text-xs font-bold text-n-text">Log Operazioni Bot (ultimi 50)</h3>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {signals.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-n-bg/40 px-3 py-1.5 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${s.signal === 'BUY' ? 'text-green-400' : s.signal === 'SELL' ? 'text-red-400' : 'text-n-dim'}`}>{s.signal}</span>
                  <span className="font-mono font-semibold text-n-text">{s.symbol}</span>
                  <span className="font-mono text-n-dim">${s.price?.toFixed(2)}</span>
                  <span className="font-mono text-n-dim">{(s.confidence * 100).toFixed(0)}%</span>
                  <span className="text-n-dim">{s.strategy}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.acted && <span className="rounded bg-green-500/15 px-1 py-0.5 text-[8px] font-bold text-green-400">EXEC</span>}
                  {s.reason && <span className="text-n-dim">{s.reason}</span>}
                  <span className="text-n-dim">{s.time ? new Date(s.time).toLocaleTimeString('it-IT') : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
