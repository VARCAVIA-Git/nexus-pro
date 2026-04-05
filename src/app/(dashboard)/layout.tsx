import { Sidebar } from '@/components/sidebar';
import { NotificationBell } from '@/components/notification-bell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex-1 overflow-y-auto bg-n-bg">
        {/* Top bar: hamburger space on mobile + notification bell */}
        <div className="sticky top-0 z-40 flex items-center justify-end px-4 pt-3 pb-0 md:px-6 md:pt-4 pointer-events-none">
          {/* Spacer for hamburger on mobile */}
          <div className="w-12 md:hidden" />
          <div className="flex-1" />
          <div className="pointer-events-auto">
            <NotificationBell />
          </div>
        </div>
        <main className="px-4 pb-6 -mt-4 md:px-6 md:-mt-6">{children}</main>
      </div>
    </div>
  );
}
