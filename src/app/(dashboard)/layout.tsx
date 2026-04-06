import { Sidebar } from '@/components/sidebar';
import { NotificationBell } from '@/components/notification-bell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex-1 overflow-y-auto bg-n-bg">
        {/* Mobile topbar */}
        <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-n-border/50 bg-n-bg/95 backdrop-blur px-4 md:justify-end md:border-0 md:h-auto md:pt-4 md:px-6">
          {/* Hamburger space on mobile */}
          <div className="w-10 md:hidden" />
          <span className="text-sm font-bold tracking-tight text-n-text md:hidden">NEXUS PRO</span>
          <NotificationBell />
        </div>
        <main className="px-4 pb-6 pt-2 md:px-6 md:pt-0 md:-mt-2">{children}</main>
      </div>
    </div>
  );
}
