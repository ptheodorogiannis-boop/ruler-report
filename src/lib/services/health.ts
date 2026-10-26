// Integration health (spec v3 §1.1): a daily check of every live connector, token expiry read from the OAuth credentials,
// and alerts (bell + e-mail + webhook) sent once per transition. The decisions are pure (alertFor) so they are testable;
// checkIntegration takes an optional connector so tests never touch the network.
import type { Integration } from '@prisma/client';
import { isLocale, t, type Locale } from '@/lib/i18n';
const localeOfCompany = (c: { locale: string } | null): Locale => (c && isLocale(c.locale) ? c.locale : 'en');
import { connectorFor } from '@/lib/connectors';
import { decryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';
import type { Connector } from '@/lib/engine/types';
import { notify, sendEmail } from './messaging';
import { emitEvent } from './webhooks';
import { reconnectUrl } from '@/lib/health-url';

export { reconnectUrl };

export type Health = 'unknown' | 'ok' | 'failing' | 'expiring';
export type Alert = 'failing' | 'expiring7' | 'expiring1' | 'recovered';
export interface HealthResult {
  health: Exclude<Health, 'unknown'>;
  error: string | null;
  tokenExpiresAt: Date | null;
}
export interface HealthSnapshot {
  health: Health;
  healthAlertKind: string | null;
  healthAlertAt: Date | null;
  tokenExpiresAt: Date | null;
}

export const FAILING_REALERT_MS = 7 * 86400000;
export const EXPIRING_DAYS = 7;
export const VALIDATE_TIMEOUT_MS = 15000;
export const CHECK_EVERY_MS = 20 * 3600000;

export type HealthRow = Pick<Integration, 'id' | 'slug' | 'name' | 'sourceId' | 'config' | 'credentials'>;

/** Which alert (if any) a transition from the stored snapshot to a fresh result deserves. */
export function alertFor(prev: HealthSnapshot, next: HealthResult, now: Date): Alert | null {
  if (next.health === 'failing') {
    if (prev.health !== 'failing') return 'failing';
    const last = prev.healthAlertKind === 'failing' ? (prev.healthAlertAt?.getTime() ?? 0) : 0;
    return now.getTime() - last >= FAILING_REALERT_MS ? 'failing' : null;
  }
  if (next.health === 'expiring' && next.tokenExpiresAt) {
    const left = next.tokenExpiresAt.getTime() - now.getTime();
    if (left <= 86400000) return prev.healthAlertKind === 'expiring1' ? null : 'expiring1';
    return prev.healthAlertKind === 'expiring7' || prev.healthAlertKind === 'expiring1' ? null : 'expiring7';
  }
  return prev.health === 'failing' || prev.health === 'expiring' ? 'recovered' : null;
}

/** One integration: demo rows are always ok; an expired token fails without a call; otherwise the connector's validate, with a timeout. */
export async function checkIntegration(row: HealthRow, opts: { connector?: Connector; now?: Date; timeoutMs?: number } = {}): Promise<HealthResult> {
  const now = opts.now ?? new Date();
  const creds = decryptJson<Record<string, any>>(row.credentials);
  if (creds?.demo) return { health: 'ok', error: null, tokenExpiresAt: null };
  const tokenExpiresAt = typeof creds?.expiresAt === 'number' ? new Date(creds.expiresAt) : null;
  if (tokenExpiresAt && tokenExpiresAt.getTime() <= now.getTime()) return { health: 'failing', error: 'The access token expired', tokenExpiresAt };
  const connector = opts.connector ?? connectorFor({ slug: row.slug, credentials: creds });
  const timeoutMs = opts.timeoutMs ?? VALIDATE_TIMEOUT_MS;
  const ctx = { integration: { id: row.id, slug: row.slug, name: row.name, sourceId: row.sourceId, config: ((row.config as Record<string, any>) ?? {}) as Record<string, any>, credentials: creds } };
  try {
    if (connector.validate) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
      });
      try {
        await Promise.race([connector.validate(ctx), timeout]);
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (e) {
    return { health: 'failing', error: String((e as Error)?.message ?? e).slice(0, 300), tokenExpiresAt };
  }
  const expiring = !!tokenExpiresAt && tokenExpiresAt.getTime() - now.getTime() <= EXPIRING_DAYS * 86400000;
  return { health: expiring ? 'expiring' : 'ok', error: null, tokenExpiresAt };
}

/** Owners and admins of the company get the e-mails. */
export async function alertRecipients(companyId: number): Promise<string[]> {
  const users = await db.user.findMany({ where: { companyId, role: { in: ['owner', 'admin'] } }, select: { email: true }, orderBy: { id: 'asc' } });
  return users.map((u) => u.email);
}

/** Alert titles in the company's language (spec v3 §5): email.failing / expiring7 / expiring1 / recovered. */
const alertTitle = (alert: Alert, name: string, loc: Locale = 'en') => t(loc, `email.${alert}`, { name });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function healthEmailHtml(i: { name: string; projectName: string }, alert: Alert, error: string | null, url: string, loc: Locale = 'en'): string {
  const what = alert === 'failing' ? t(loc, 'email.failingWhat', { error: error ? `: <em>${esc(error)}</em>` : '' }) : alert === 'expiring1' ? t(loc, 'email.expiring1What') : t(loc, 'email.expiring7What');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto"><h2 style="margin:0 0 8px">${esc(alertTitle(alert, i.name, loc))}</h2><p style="color:#475569;margin:0 0 12px">${esc(t(loc, 'email.project', { name: i.projectName }))}</p><p>${what}</p><p><a href="${esc(url)}" style="display:inline-block;background:#1a36e6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(t(loc, 'email.reconnectButton'))} ${esc(i.name)}</a></p><p style="color:#94a3b8;font-size:12px">${esc(t(loc, 'email.healthFooter'))}</p></div>`;
}

type DueRow = HealthRow & Pick<Integration, 'companyId' | 'projectId' | 'health' | 'healthAlertKind' | 'healthAlertAt' | 'tokenExpiresAt'> & { project: { name: string } };

async function sendAlert(row: DueRow, alert: Alert, next: HealthResult): Promise<void> {
  const base = process.env.APP_URL || 'http://localhost:3100';
  const path = reconnectUrl(row);
  const loc = localeOfCompany(await db.company.findUnique({ where: { id: row.companyId }, select: { locale: true } }));
  const title = alertTitle(alert, row.name, loc);
  const body = alert === 'failing' ? (next.error ?? '') : alert === 'recovered' ? '' : t(loc, 'email.reconnectBefore', { date: next.tokenExpiresAt?.toISOString().slice(0, 10) ?? '…' });
  await notify(row.companyId, row.projectId, title, body, path);
  if (alert === 'recovered') return;
  const to = await alertRecipients(row.companyId);
  if (to.length) await sendEmail(to, `[Ruler Reports] ${title}`, healthEmailHtml({ name: row.name, projectName: row.project.name }, alert, next.error, `${base}${path}`, loc), { companyId: row.companyId });
  if (alert === 'failing') await emitEvent(row.companyId, row.projectId, 'integration_failing', { integration_id: row.id, name: row.name, slug: row.slug, error: next.error, url: `${base}${path}` });
}

/** The daily pass (from the cron tick): rows not checked in the last 20 hours, oldest first, each in its own try/catch. */
export async function checkAll(opts: { now?: Date; limit?: number; connectorFor?: (row: HealthRow) => Connector; companyId?: number } = {}): Promise<{ checked: number; alerts: { integrationId: number; alert: Alert }[] }> {
  const now = opts.now ?? new Date();
  const due = new Date(now.getTime() - CHECK_EVERY_MS);
  const rows: DueRow[] = await db.integration.findMany({
    where: { status: 'active', ...(opts.companyId ? { companyId: opts.companyId } : {}), OR: [{ healthCheckedAt: null }, { healthCheckedAt: { lt: due } }] },
    orderBy: { healthCheckedAt: 'asc' },
    take: opts.limit ?? 50,
    include: { project: { select: { name: true } } },
  });
  const alerts: { integrationId: number; alert: Alert }[] = [];
  let checked = 0;
  for (const row of rows) {
    try {
      const next = await checkIntegration(row, { now, connector: opts.connectorFor?.(row) });
      checked++;
      const alert = alertFor({ health: row.health as Health, healthAlertKind: row.healthAlertKind, healthAlertAt: row.healthAlertAt, tokenExpiresAt: row.tokenExpiresAt }, next, now);
      await db.integration.update({
        where: { id: row.id },
        data: { health: next.health, healthError: next.error, healthCheckedAt: now, tokenExpiresAt: next.tokenExpiresAt, ...(alert ? { healthAlertKind: alert, healthAlertAt: now } : {}) },
      });
      if (alert) {
        alerts.push({ integrationId: row.id, alert });
        await sendAlert(row, alert, next);
      }
    } catch {
      // a broken row never stops the pass; the next tick tries again
    }
  }
  return { checked, alerts };
}
