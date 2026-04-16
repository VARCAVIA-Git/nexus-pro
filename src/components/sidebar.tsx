'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, FlaskConical, Activity, Wallet,
  Settings, Plug, HeartPulse, Menu, X, Shield, LogOut,
  Database,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const CORE_NAV = [
  { href: '/dashboard', label: 'Control Room', icon: LayoutDashboard },
  { href: '/strategies', label: 'Strategy Lab', icon: FlaskConical },
];

const TRADING_NAV = [
  { href: '/operazioni', label: 'Trades', icon: Activity },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
];

const INFRA_NAV = [
  { href: '/data-health', label: 'Data Health', icon: Database },
  { href: '/status', label: 'Runtime', icon: HeartPulse },
  { href: '/connections', label: 'Broker', icon: Plug },
  { href: '/impostazioni', label: 'Settings', icon: Settings },
];

function NavLink({ href, label, icon: Icon, pathname, onClick }: {
  href: string; label: string; icon: React.ElementType; pathname: string; onClick?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} onClick={onClick} className={clsx(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all',
      active ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
    )}>
      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
      {label}
    </Link>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<string>('...');

  useEffect(() => {
    const check = () => fetch('/api/nexusone/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMode(d.mode ?? 'offline'); })
      .catch(() => setMode('offline'));
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, []);

  const modeColor = mode === 'paper' ? 'text-amber-400' : mode === 'live_guarded' ? 'text-emerald-400' : 'text-zinc-600';
  const modeLabel = mode === 'paper' ? 'PAPER' : mode === 'live_guarded' ? 'LIVE' : mode === 'disabled' ? 'OFF' : mode;

  return (
    <aside className="flex h-full w-[220px] flex-col bg-zinc-950 border-r border-zinc-800/60">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/15">
          <Shield size={14} className="text-cyan-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold tracking-tight text-zinc-200">NexusOne</span>
          <span className={clsx('text-[9px] font-mono font-bold tracking-widest', modeColor)}>{modeLabel}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-4 px-2 pt-1 overflow-y-auto">
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Core</p>
          {CORE_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
        </div>
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Trading</p>
          {TRADING_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
        </div>
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Infrastructure</p>
          {INFRA_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
        </div>
      </nav>

      <div className="border-t border-zinc-800/60 p-2">
        <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); onNavigate?.(); }}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
          <LogOut size={12} /> Logout
        </button>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-500 md:hidden">
        <Menu size={18} />
      </button>
      <div className="hidden md:block h-screen shrink-0">
        <SidebarContent pathname={pathname} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[240px]">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 rounded-md p-1 text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}
