'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Zap as ZapIcon,
  FlaskConical, Settings, ChevronDown, Bot, Rocket, Activity, Menu, X, Brain, Microscope,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { getBotStatus } from '@/lib/engine/live-runner';

const demoNav = [
  { href: '/demo/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/demo/operazioni', label: 'Operazioni', icon: ArrowLeftRight },
  { href: '/demo/segnali', label: 'Segnali', icon: ZapIcon },
];

const realNav = [
  { href: '/real/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/real/operazioni', label: 'Operazioni', icon: ArrowLeftRight },
  { href: '/real/segnali', label: 'Segnali', icon: ZapIcon },
];

function NavLink({ href, label, icon: Icon, pathname, onClick }: {
  href: string; label: string; icon: React.ElementType; pathname: string; onClick?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} onClick={onClick} className={clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all md:py-1.5 md:text-[12px]', active ? 'bg-n-accent-dim text-accent' : 'text-n-dim hover:bg-n-card hover:text-n-text')}>
      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  );
}

function NavSection({ title, items, pathname, color, expanded, onToggle, onNavigate }: {
  title: string; items: typeof demoNav; pathname: string; color: 'amber' | 'blue'; expanded: boolean; onToggle: () => void; onNavigate?: () => void;
}) {
  const isActive = items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const dotColor = color === 'amber' ? 'bg-amber-400' : 'bg-blue-400';
  const textColor = color === 'amber' ? 'text-amber-400' : 'text-blue-400';
  const borderColor = color === 'amber' ? 'border-amber-500/20' : 'border-blue-500/20';

  return (
    <div>
      <button onClick={onToggle} className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all', isActive ? textColor : 'text-n-dim hover:text-n-text-s')}>
        <div className="flex items-center gap-2">
          <span className={clsx('h-1.5 w-1.5 rounded-full', isActive ? dotColor + ' animate-pulse-dot' : 'bg-n-dim')} />
          {title}
        </div>
        <ChevronDown size={12} className={clsx('transition-transform', expanded ? 'rotate-180' : '')} />
      </button>
      {expanded && (
        <div className={clsx('ml-2 space-y-0.5 border-l pl-2', borderColor)}>
          {items.map((item) => (<NavLink key={item.href} {...item} pathname={pathname} onClick={onNavigate} />))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const inDemo = pathname.startsWith('/demo');
  const inReal = pathname.startsWith('/real');
  const [demoExpanded, setDemoExpanded] = useState(true);
  const [realExpanded, setRealExpanded] = useState(true);
  const [botRunning, setBotRunning] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/bot/status');
        if (res.ok) { const d = await res.json(); setBotRunning(d.running); }
      } catch {}
    };
    check();
    const i = setInterval(check, 10000);
    return () => clearInterval(i);
  }, []);

  const borderClass = inDemo ? 'border-l-2 border-l-amber-500' : inReal ? 'border-l-2 border-l-blue-500' : 'border-l-0';
  const logoSuffix = inDemo ? 'DEMO' : inReal ? 'LIVE' : null;
  const logoSuffixColor = inDemo ? 'text-amber-400' : inReal ? 'text-blue-400' : '';

  return (
    <aside className={clsx('flex h-full w-[240px] flex-col border-r border-n-border bg-n-bg-s md:w-[220px]', borderClass)}>
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', inDemo ? 'bg-amber-500/20' : inReal ? 'bg-blue-500/20' : 'bg-slate-500/20')}>
          <Rocket size={16} className={inDemo ? 'text-amber-400' : inReal ? 'text-blue-400' : 'text-slate-400'} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold tracking-tight text-n-text">NEXUS</span>
          <span className="text-[10px] font-semibold tracking-wider text-n-dim">PRO</span>
          {logoSuffix && (<><span className="text-[8px] text-n-dim">·</span><span className={clsx('text-[10px] font-bold tracking-wider', logoSuffixColor)}>{logoSuffix}</span></>)}
        </div>
      </div>

      <div className="px-2 pb-1"><NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} pathname={pathname} onClick={onNavigate} /></div>
      <div className="mx-4 my-2 border-t border-n-border" />
      <div className="px-2 space-y-0.5"><NavSection title="Demo" items={demoNav} pathname={pathname} color="amber" expanded={demoExpanded} onToggle={() => setDemoExpanded(!demoExpanded)} onNavigate={onNavigate} /></div>
      <div className="px-2 mt-1 space-y-0.5"><NavSection title="Real" items={realNav} pathname={pathname} color="blue" expanded={realExpanded} onToggle={() => setRealExpanded(!realExpanded)} onNavigate={onNavigate} /></div>
      <div className="mx-4 my-2 border-t border-n-border" />
      <div className="px-2">
        <p className="mb-1 px-3 text-[9px] font-bold uppercase tracking-widest text-n-dim">Strumenti</p>
        <div className="space-y-0.5">
          <NavLink href="/strategy" label="Strategy" icon={Bot} pathname={pathname} onClick={onNavigate} />
          <NavLink href="/intelligence" label="Intelligence" icon={Brain} pathname={pathname} onClick={onNavigate} />
          <NavLink href="/backtest" label="Backtest" icon={FlaskConical} pathname={pathname} onClick={onNavigate} />
          <NavLink href="/rnd" label="R&D Lab" icon={Microscope} pathname={pathname} onClick={onNavigate} />
          <NavLink href="/status" label="Status" icon={Activity} pathname={pathname} onClick={onNavigate} />
          <NavLink href="/impostazioni" label="Impostazioni" icon={Settings} pathname={pathname} onClick={onNavigate} />
        </div>
      </div>

      <div className="flex-1" />
      <div className="border-t border-n-border px-4 py-3">
        <p className="font-mono text-[10px] text-n-dim">Nexus Pro v5.0</p>
        <p className="font-mono text-[10px] text-n-dim">
          Engine: <span className={botRunning ? 'text-n-green' : 'text-n-red'}>{botRunning ? 'active' : 'stopped'}</span>
        </p>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button onClick={() => setMobileOpen(true)} className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-n-border bg-n-bg-s text-n-dim md:hidden" aria-label="Menu">
        <Menu size={20} />
      </button>

      {/* Desktop sidebar — always visible */}
      <div className="hidden md:block h-screen shrink-0">
        <SidebarContent pathname={pathname} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[260px] animate-fade-in">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-lg p-1 text-n-dim hover:text-n-text" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
