import { Sidebar } from '@/components/sidebar';
import { NotificationBell } from '@/components/notification-bell';
import { Ticker } from '@/components/ticker';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* Ticker bar */}
        <Ticker />
        {/* Mobile topbar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-n-border/30 bg-n-bg/95 backdrop-blur px-4 md:justify-end md:border-0 md:h-12 md:px-6">
          <div className="w-10 md:hidden" />
          <span className="text-sm font-semibold tracking-tight text-n-text md:hidden">NEXUS PRO</span>
          <NotificationBell />
        </div>
        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6 md:pt-5">{children}</main>
      </div>
    </div>
  );
}
