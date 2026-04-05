'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, TrendingUp, Bot, AlertTriangle, Zap, AlertCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: 'trade' | 'signal' | 'bot' | 'circuit_breaker' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  trade: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/15' },
  signal: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  bot: { icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  circuit_breaker: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/15' },
  error: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-500/15' },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleMarkRead = async (id: string) => {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ora';
    if (mins < 60) return `${mins}m fa`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h fa`;
    return `${Math.floor(hrs / 24)}g fa`;
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-lg border border-n-border bg-n-card p-2 text-n-dim hover:text-n-text transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-xl border border-n-border bg-n-bg-s shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-n-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-n-text">Notifiche</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                  {unreadCount} non lette
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-n-dim hover:text-n-text hover:bg-n-card transition-colors"
                >
                  <CheckCheck size={12} />
                  Leggi tutte
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-n-dim hover:text-n-text transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <div className="text-center">
                  <Bell size={20} className="mx-auto text-n-dim" />
                  <p className="mt-2 text-[11px] text-n-dim">Nessuna notifica</p>
                </div>
              </div>
            ) : (
              <div>
                {notifications.map((n) => {
                  const cfg = typeConfig[n.type] ?? typeConfig.bot;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => !n.read && handleMarkRead(n.id)}
                      className={`flex items-start gap-3 border-b border-n-border/50 px-4 py-3 transition-colors cursor-pointer ${
                        n.read ? 'opacity-60' : 'bg-n-card/30 hover:bg-n-card/60'
                      }`}
                    >
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                        <Icon size={14} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-n-text truncate">{n.title}</p>
                          <span className="shrink-0 text-[9px] text-n-dim">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-n-dim leading-relaxed">{n.message}</p>
                      </div>
                      {!n.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
