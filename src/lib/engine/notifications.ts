// ═══════════════════════════════════════════════════════════════
// NEXUS PRO — Notification System
// Channels: In-App + Redis (persistent), Discord Webhook (optional)
// ═══════════════════════════════════════════════════════════════

import { redisLpush, redisLrange, redisSet, redisGet, KEYS } from '@/lib/db/redis';

export type NotificationType = 'trade' | 'signal' | 'bot' | 'circuit_breaker' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ── In-memory cache (survives HMR, fast reads) ───────────

const G = globalThis as any;
if (!G.__nexusNotifications) G.__nexusNotifications = [] as AppNotification[];
if (!G.__nexusNotifLoaded) G.__nexusNotifLoaded = false;
const cache: AppNotification[] = G.__nexusNotifications;

let _idCounter = Date.now();
function nextId(): string { return `n_${++_idCounter}`; }

/** Load from Redis into memory cache (once) */
async function ensureLoaded(): Promise<void> {
  if (G.__nexusNotifLoaded) return;
  try {
    const stored = await redisLrange<AppNotification>(KEYS.notifications, 0, 199);
    if (stored.length > 0 && cache.length === 0) {
      cache.push(...stored);
    }
    G.__nexusNotifLoaded = true;
  } catch { /* Redis unavailable — use in-memory only */ }
}

/** Add notification to both cache and Redis */
async function addNotification(type: NotificationType, title: string, message: string): Promise<AppNotification> {
  const notif: AppNotification = {
    id: nextId(), type, title, message, read: false,
    createdAt: new Date().toISOString(),
  };
  cache.unshift(notif);
  if (cache.length > 200) cache.length = 200;

  // Persist to Redis (fire-and-forget)
  redisLpush(KEYS.notifications, notif, 200).catch(() => {});
  const unread = cache.filter((n) => !n.read).length;
  redisSet(KEYS.notifUnread, unread).catch(() => {});

  return notif;
}

/** Get all notifications (newest first) */
export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  await ensureLoaded();
  return cache.slice(0, limit);
}

/** Get count of unread notifications */
export async function getUnreadCount(): Promise<number> {
  await ensureLoaded();
  return cache.filter((n) => !n.read).length;
}

/** Mark a single notification as read */
export async function markRead(id: string): Promise<void> {
  await ensureLoaded();
  const n = cache.find((x) => x.id === id);
  if (n) n.read = true;
  // We don't re-persist the full list for a single read — acceptable trade-off
}

/** Mark all notifications as read */
export async function markAllRead(): Promise<void> {
  await ensureLoaded();
  for (const n of cache) n.read = true;
  redisSet(KEYS.notifUnread, 0).catch(() => {});
}

// ── Discord Webhook ───────────────────────────────────────

const DISCORD_COLORS = {
  trade_buy: 0x22c55e, trade_sell: 0xef4444, bot: 0x3b82f6,
  signal: 0xf59e0b, circuit_breaker: 0xef4444, error: 0x6b7280,
};

async function sendDiscord(title: string, message: string, color: number): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title, description: message, color, timestamp: new Date().toISOString(), footer: { text: 'Nexus Pro v5' } }],
      }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Public Notification API ───────────────────────────────

export async function notify(type: NotificationType, title: string, message: string): Promise<void> {
  await addNotification(type, title, message);

  let discordColor = DISCORD_COLORS.bot;
  if (type === 'trade' && title.includes('BUY')) discordColor = DISCORD_COLORS.trade_buy;
  else if (type === 'trade') discordColor = DISCORD_COLORS.trade_sell;
  else if (type === 'signal') discordColor = DISCORD_COLORS.signal;
  else if (type === 'circuit_breaker') discordColor = DISCORD_COLORS.circuit_breaker;
  else if (type === 'error') discordColor = DISCORD_COLORS.error;

  await sendDiscord(title, message, discordColor);
  const prefix: Record<string, string> = { trade: '💰', signal: '📊', bot: '🤖', circuit_breaker: '🛑', error: '❌' };
  console.log(`${prefix[type] ?? '📌'} [NOTIFY] ${title}: ${message}`);
}

// ── Convenience helpers ───────────────────────────────────

export async function notifyTrade(action: 'BUY' | 'SELL', symbol: string, price: number, confidence: number, strategy: string, extra?: { botName?: string; regime?: string; score?: number }): Promise<void> {
  const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const emoji = action === 'BUY' ? '🟢' : '🔴';
  const title = extra?.botName ? `${emoji} ${extra.botName}: ${action} ${symbol} @ $${priceStr}` : `${emoji} ${action} ${symbol} @ $${priceStr}`;
  const parts = [`Score: ${extra?.score ?? (confidence * 100).toFixed(0)}%`, `Strategy: ${strategy}`];
  if (extra?.regime) parts.push(`Regime: ${extra.regime}`);
  await notify('trade', title, parts.join(' | '));
}

export async function notifyTradeClose(side: string, symbol: string, price: number, pnl: number, reason: string, extra?: { botName?: string; pnlPct?: number }): Promise<void> {
  const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  const pctStr = extra?.pnlPct != null ? ` (${extra.pnlPct >= 0 ? '+' : ''}${extra.pnlPct.toFixed(1)}%)` : '';
  const emoji = pnl >= 0 ? '✅' : '❌';
  const title = extra?.botName ? `${emoji} ${extra.botName}: CLOSED ${side} ${symbol}` : `${emoji} CLOSED ${side} ${symbol}`;
  await notify('trade', title, `P&L: ${pnlStr}${pctStr} | Exit: ${reason}`);
}

export async function notifyBot(action: 'started' | 'stopped' | 'circuit_breaker', details?: string): Promise<void> {
  const titles: Record<string, string> = { started: 'Bot Avviato', stopped: 'Bot Fermato', circuit_breaker: 'Circuit Breaker Attivato' };
  const type: NotificationType = action === 'circuit_breaker' ? 'circuit_breaker' : 'bot';
  await notify(type, titles[action], details ?? '');
}
