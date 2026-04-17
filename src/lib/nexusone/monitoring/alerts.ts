// ═══════════════════════════════════════════════════════════════
// NexusOne v2 — Alert Dispatcher
//
// Fire-and-forget webhook notifications. Ships to the URL in
// ALERT_WEBHOOK_URL (Slack-compatible JSON body with a `text`
// field). If no webhook is configured, alerts are logged to
// stderr instead — the call still succeeds.
// ═══════════════════════════════════════════════════════════════

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  severity: AlertSeverity;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

const NO_CACHE = {
  cache: 'no-store' as RequestCache,
  next: { revalidate: 0 },
};

export async function sendAlert(alert: AlertPayload): Promise<void> {
  const tag = `[nexusone/alert/${alert.severity}] ${alert.event}: ${alert.message}`;
  if (alert.severity === 'critical' || alert.severity === 'warning') {
    console.error(tag, alert.meta ?? {});
  } else {
    console.log(tag, alert.meta ?? {});
  }

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const body = {
    text: tag,
    attachments: [{ text: JSON.stringify(alert.meta ?? {}, null, 2) }],
  };
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...NO_CACHE,
    });
  } catch (e: any) {
    console.error('[nexusone/alert] webhook failed:', e?.message ?? e);
  }
}
