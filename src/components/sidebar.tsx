'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useModeStore } from '@/stores/mode-store';
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Zap,
  Bot, Brain, FlaskConical, Microscope, Activity,
  Settings, Plug, Menu, X, Rocket, ArrowRightLeft,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const MAIN_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/operazioni', label: 'Operazioni', icon: ArrowLeftRight },
  { href: '/segnali', label: 'Segnali', icon: Zap },
];

const TOOLS_NAV = [
  { href: '/strategy', label: 'Strategy', icon: Bot },
  { href: '/intelligence', label: 'Intelligence', icon: Brain },
  { href: '/backtest', label: 'Backtest', icon: FlaskConical },
  { href: '/rnd', label: 'R&D Lab', icon: Microscope },
];

const SYSTEM_NAV = [
  { href: '/impostazioni', label: 'Impostazioni', icon: Settings },
  { href: '/connections', label: 'Connessioni', icon: Plug },
  { href: '/status', label: 'Status', icon: Activity },
];

function NavLink({ href, label, icon: Icon, pathname, onClick }: {
  href: string; label: string; icon: React.ElementType; pathname: string; onClick?: () => void;
}) {
  const active = pathname === href;
  return (
    <Link href={href} onClick={onClick} className={clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all', active ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:bg-n-card hover:text-n-text')}>
      <Icon size={18} strokeWidth={active ? 2 : 1.6} />
      {label}
    </Link>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { mode, toggle } = useModeStore();
  const isDemo = mode === 'demo';

  const [botRunning, setBotRunning] = useState(false);
  useEffect(() => {
    fetch('/api/bot/status').then(r => r.ok ? r.json() : null).then(d => { if (d) setBotRunning(d.running); }).catch(() => {});
    const i = setInterval(() => { fetch('/api/bot/status').then(r => r.ok ? r.json() : null).then(d => { if (d) setBotRunning(d.running); }).catch(() => {}); }, 15000);
    return () => clearInterval(i);
  }, []);

  return (
    <aside className={clsx('flex h-full w-[240px] flex-col bg-n-bg-s', isDemo ? 'border-r-2 border-r-amber-500/50' : 'border-r-2 border-r-blue-500/50')}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', isDemo ? 'bg-amber-500/15' : 'bg-blue-500/15')}>
          <Rocket size={18} className={isDemo ? 'text-amber-400' : 'text-blue-400'} />
        </div>
        <div>
          <span className="text-[15px] font-semibold tracking-tight text-n-text">NEXUS PRO</span>
          {isDemo && <span className="ml-1.5 text-[9px] font-medium text-amber-400">DEMO</span>}
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 space-y-6 px-3 pt-2 overflow-y-auto">
        <div>
          <p className="label px-3 mb-1.5">Principale</p>
          <div className="space-y-0.5">
            {MAIN_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
          </div>
        </div>

        <div>
          <p className="label px-3 mb-1.5">Strumenti</p>
          <div className="space-y-0.5">
            {TOOLS_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
          </div>
        </div>

        <div>
          <p className="label px-3 mb-1.5">Sistema</p>
          <div className="space-y-0.5">
            {SYSTEM_NAV.map(item => <NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />)}
          </div>
        </div>
      </nav>

      {/* Mode switch + engine status */}
      <div className="border-t border-n-border p-3 space-y-2">
        <button onClick={() => { toggle(); onNavigate?.(); }} className={clsx('flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all min-h-[44px]', isDemo ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20')}>
          <ArrowRightLeft size={14} />
          {isDemo ? 'Passa a REAL' : 'Passa a DEMO'}
        </button>
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] text-n-dim">Engine</span>
          <span className={clsx('font-mono text-[10px] font-medium', botRunning ? 'text-n-green' : 'text-n-dim')}>{botRunning ? 'active' : 'idle'}</span>
        </div>
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
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="fixed left-3 top-3.5 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-n-border bg-n-bg-s text-n-dim md:hidden" aria-label="Menu">
        <Menu size={20} />
      </button>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-screen shrink-0">
        <SidebarContent pathname={pathname} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[260px] animate-fade-in">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-n-dim hover:text-n-text"><X size={18} /></button>
          </div>
        </div>
      )}
    </>
  );
}
