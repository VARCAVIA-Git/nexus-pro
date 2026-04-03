'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, LineChart, FlaskConical, ArrowLeftRight,
  Briefcase, Bell, Settings, LogOut,
} from 'lucide-react';

const nav = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/analysis', label: 'Analysis', icon: LineChart },
  { href: '/backtest', label: 'Backtest', icon: FlaskConical },
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/alerts', label: 'Alerts', icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-nexus-border bg-nexus-card">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-nexus-accent to-nexus-green" />
        <span className="text-lg font-bold tracking-tight text-white">NEXUS PRO</span>
        <span className="ml-1 rounded bg-nexus-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-nexus-accent">v5</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-nexus-accent/10 text-nexus-accent'
                  : 'text-nexus-dim hover:bg-nexus-bg hover:text-nexus-text',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-nexus-border p-2">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-nexus-dim hover:bg-nexus-bg hover:text-nexus-text"
        >
          <Settings size={18} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
