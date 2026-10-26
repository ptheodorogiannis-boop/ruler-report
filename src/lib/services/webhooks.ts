import { db } from '@/lib/db';
import { hmac, randomToken } from '@/lib/crypto';

export const WEBHOOK_EVENTS = [
  'report_viewed',
  'report_created',
  'dashboard_created',
  'automation_executed',
  'control_goal_met',
  'control_goal_not_met',
  'timeline_milestone_added',
  'integration_failing',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_SOURCES = ['custom', 'make', 'zapier', 'n8n', 'slack', 'teams', 'discord'] as const;
export const newWebhookSecret = () => `whsec_${randomToken(18)}`;

/** Slack / Teams / Discord incoming webhooks expect their own payload shape. */
function shapeFor(source: string, event: string, payload: Record<string, unknown>) {
  const text = `*${event.replace(/_/g, ' ')}* — ${String(payload.title ?? payload.message ?? '')}${payload.url ? `\n${payload.url}` : ''}`;
  if (source === 'slack') return { text };
  if (source === 'teams') return { '@type': 'MessageCard', '@context': 'https://schema.org/extensions', summary: event, text: text.replace(/\*/g, '**') };
  if (source === 'discord') return { content: text };
  return { event, created_at: new Date().toISOString(), data: payload };
}

export async function emitEvent(companyId: number, projectId: number | null, event: WebhookEvent, payload: Record<string, unknown>) {
  const hooks = await db.webhook.findMany({
    where: { companyId, eventType: event, status: 'active', OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])] },
  });
  await Promise.all(
    hooks.map(async (h) => {
      const body = JSON.stringify(shapeFor(h.source, event, { ...payload, project_id: projectId }));
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(h.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rulerreports-event': event,
            'x-rulerreports-signature': `sha256=${hmac(h.secret, body)}`,
            'user-agent': 'RulerReports-Webhook/1.0',
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        statusCode = res.status;
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await db.webhookDelivery.create({ data: { webhookId: h.id, event, payload: JSON.parse(body), statusCode, error } }).catch(() => null);
    })
  );
}
