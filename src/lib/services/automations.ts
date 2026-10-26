import type { Automation, Project, Report } from '@prisma/client';
import { db } from '@/lib/db';
import { analyse } from '@/lib/ai/insights';
import { createReport, shareUrl } from './reports';
import { emitEvent } from './webhooks';
import { notify, sendChat, sendEmail, type EmailAttachment } from './messaging';
import { pdfAvailable, pdfFilename, pdfPageUrl, renderPdf } from './pdf';
import { metricLabel } from '@/lib/catalog/labels';
import { addDays, fmtDate, parseDate, previousPeriod, today } from '@/lib/util/dates';
import type { ReportData, SourceStatus } from '@/lib/engine/types';
import { alertRecipients } from './health';
import { reconnectUrl } from '@/lib/health-url';
import { localeForPublic, t } from '@/lib/i18n';
import { regenerateSource } from '@/lib/engine/report';
import { formatValue } from '@/lib/util/format';

export const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export const CHANNELS = ['email', 'in-app', 'whatsapp', 'slack', 'teams', 'discord', 'telegram'] as const;

function tzOffsetMs(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}
/** The UTC instant at which wall-clock `hour:00` on y-m-d happens in `tz`. */
export function zonedToUtc(y: number, m0: number, d: number, hour: number, tz: string) {
  const guess = Date.UTC(y, m0, d, hour);
  let tzv = tz;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    tzv = 'UTC';
  }
  return new Date(guess - tzOffsetMs(new Date(guess), tzv));
}

type A = Pick<Automation, 'frequency' | 'dayOfWeek' | 'dayOfMonth' | 'hour'> & { weekdaysOnly?: boolean; monthlyRule?: string | null };

/** `day` (the day-of-month field), `first:<dow>` or `last:<dow>` (0 = Sunday) — spec v3 §3.1. Anything else means `day`. */
export type MonthlyRule = { kind: 'day' } | { kind: 'first' | 'last'; dow: number };
export function parseMonthlyRule(s: string | null | undefined): MonthlyRule {
  const m = /^(first|last):([0-6])$/.exec(s ?? '');
  return m ? { kind: m[1] as 'first' | 'last', dow: Number(m[2]) } : { kind: 'day' };
}
/** Day of month of the first/last given weekday (0 = Sunday) in a month (m0 = 0-based). */
export function nthWeekday(y: number, m0: number, dow: number, which: 'first' | 'last'): number {
  if (which === 'first') {
    const d0 = new Date(Date.UTC(y, m0, 1)).getUTCDay();
    return 1 + ((dow - d0 + 7) % 7);
  }
  const last = new Date(Date.UTC(y, m0 + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7);
}
const localDow = (d: Date, tz: string) => new Date(d.getTime() + tzOffsetMs(d, tz)).getUTCDay();

/** Next run strictly after `from`. */
export function nextRunAfter(a: A, tz: string, from: Date, lastRun?: Date | null): Date {
  const hour = a.hour;
  if (a.frequency === 'daily') {
    // the next local `hour:00` after `from`, skipping Saturday and Sunday when asked; DST is handled by zonedToUtc per day
    for (let i = 0; i < 10; i++) {
      const day = new Date(from.getTime() + i * 86400000);
      const local = new Date(day.getTime() + tzOffsetMs(day, tz));
      const cand = zonedToUtc(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, tz);
      if (a.weekdaysOnly && [0, 6].includes(localDow(cand, tz))) continue;
      if (cand > from) return cand;
    }
    return new Date(from.getTime() + 86400000);
  }
  if (a.frequency === 'monthly') {
    const rule = parseMonthlyRule(a.monthlyRule);
    let y = from.getUTCFullYear();
    let m = from.getUTCMonth();
    for (let i = 0; i < 3; i++) {
      const dom = rule.kind === 'day' ? Math.min(28, Math.max(1, a.dayOfMonth)) : nthWeekday(y, m, rule.dow, rule.kind);
      const cand = zonedToUtc(y, m, dom, hour, tz);
      if (cand > from) return cand;
      m++;
      if (m > 11) (m = 0, y++);
    }
  }
  // weekly / biweekly: next matching weekday
  for (let i = 0; i < 15; i++) {
    const day = new Date(from.getTime() + i * 86400000);
    const cand = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, tz);
    const localDow = new Date(cand.getTime() + tzOffsetMs(cand, tz)).getUTCDay();
    if (localDow === a.dayOfWeek && cand > from) {
      if (a.frequency === 'biweekly' && lastRun && cand.getTime() - lastRun.getTime() < 13 * 86400000) continue;
      return cand;
    }
  }
  return new Date(from.getTime() + 7 * 86400000);
}

/** The period an automation reports on when it fires on `day` (YYYY-MM-DD, local). */
export function periodForRun(frequency: string, day: string) {
  const d = parseDate(day);
  if (frequency === 'daily') {
    const y = addDays(day, -1);
    return { start: y, end: y, label: y };
  }
  if (frequency === 'monthly') {
    const start = fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    const end = fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
    return { start, end, label: new Date(start + 'T00:00:00Z').toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  const len = frequency === 'biweekly' ? 14 : 7;
  const end = addDays(day, -1);
  const start = addDays(end, -(len - 1));
  return { start, end, label: `${start} → ${end}` };
}

function emailHtml(project: Project, title: string, url: string, data: ReportData, analysisHtml?: string) {
  const loc = localeForPublic(project);
  const nums = data.sections.flatMap((s) => s.blocks).filter((b) => b.widget.value.type === 'number').slice(0, 8);
  const cells = nums
    .map((b) => {
      const v = b.widget.value as any;
      const ch = v.comparison?.change_pct;
      const good = ch == null ? null : b.widget.diff_type === 'positive_bad' ? ch < 0 : ch > 0;
      return `<td style="padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:11px;color:#64748b">${b.platform} · ${metricLabel({ reference_key: b.widget.reference_key, title: b.widget.label }, loc)}</div><div style="font-size:20px;font-weight:700">${formatValue(v.value, b.widget.format, { currency: b.widget.currency })}</div>${ch != null ? `<div style="font-size:12px;color:${good ? '#16a34a' : '#dc2626'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</div>` : ''}</td>`;
    })
    .reduce<string[][]>((rows, c, i) => (i % 2 === 0 ? [...rows, [c]] : (rows[rows.length - 1].push(c), rows)), [])
    .map((r) => `<tr>${r.join('')}</tr>`)
    .join('');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto"><h2>${title}</h2><p style="color:#475569">${data.range.start} → ${data.range.end}</p><table cellspacing="8" style="width:100%">${cells}</table>${analysisHtml ?? ''}<p style="margin-top:20px"><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${t(loc, 'email.openFullReport')}</a></p></div>`;
}

/** The sources whose fetch failed in a generated report (spec v3 §3.2). */
export function failedSources(data: ReportData | null | undefined): SourceStatus[] {
  return (data?.sources ?? []).filter((s) => s.data_status === 'error');
}

type AutomationFull = Automation & { project: Project };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Sends the stored report through the automation's channels; returns the per-channel detail. */
async function deliverChannels(a: AutomationFull, report: Report): Promise<Record<string, unknown>> {
  const project = a.project;
  const url = shareUrl('report', report.shareToken);
  const data = report.data as unknown as ReportData;
  const analysis = (report.analysis as any)?.[0]?.html as string | undefined;
  const channels = (a.channels as string[]) ?? [];
  const detail: Record<string, unknown> = {};
  // the PDF attachment (spec v3 §4.1): only when asked, only when the service is up, never for a password-protected report
  let attachments: EmailAttachment[] | undefined;
  if (a.attachPdf && channels.includes('email')) {
    if (!pdfAvailable()) detail.pdf = 'not attached: PDF service unavailable';
    else if (report.password) detail.pdf = 'not attached: password-protected';
    else {
      try {
        const buf = await renderPdf({ url: pdfPageUrl('report', report.shareToken, { layout: 'flow' }) });
        if (buf.length > 15 * 1024 * 1024) detail.pdf = 'not attached: larger than 15 MB';
        else {
          const filename = pdfFilename(report.title, { ascii: false });
          attachments = [{ filename, content: buf, contentType: 'application/pdf' }];
          detail.pdf = `attached (${filename})`;
        }
      } catch (e) {
        detail.pdf = `not attached: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
  const msg = { title: report.title, text: t(localeForPublic(project), 'email.reportReady', { frequency: t(localeForPublic(project), `automations.${a.frequency}`), start: report.startDate, end: report.endDate }), url };
  if (channels.includes('email') && Array.isArray(a.emails) && (a.emails as string[]).length) detail.email = await sendEmail(a.emails as string[], report.title, emailHtml(project, report.title, url, data, analysis), { companyId: project.companyId, attachments });
  if (channels.includes('in-app')) await notify(project.companyId, project.id, t(localeForPublic(project), 'email.reportReadyTitle', { title: report.title }), msg.text, `/reports/${report.id}`);
  const chat = async (kind: 'whatsapp' | 'slack' | 'teams' | 'discord' | 'telegram', cfg: Parameters<typeof sendChat>[1]) => {
    try {
      await sendChat(kind, cfg, msg);
      detail[kind] = 'sent';
    } catch (e) {
      detail[kind] = `error: ${(e as Error).message}`;
    }
  };
  if (channels.includes('whatsapp') && a.whatsappUrl) await chat('whatsapp', { url: a.whatsappUrl, type: a.whatsappType });
  if (channels.includes('slack') && a.slackUrl) await chat('slack', { url: a.slackUrl });
  if (channels.includes('teams') && a.teamsUrl) await chat('teams', { url: a.teamsUrl });
  if (channels.includes('discord') && a.discordUrl) await chat('discord', { url: a.discordUrl });
  if (channels.includes('telegram') && a.telegramBotToken && a.telegramChatId) await chat('telegram', { botToken: a.telegramBotToken, chatId: a.telegramChatId });
  return detail;
}

/** Owners and admins hear about failed sources (spec v3 §3.2): the report was held, or went out with gaps. */
async function failureAlert(a: AutomationFull, report: Report, failed: SourceStatus[], held: boolean) {
  const project = a.project;
  const base = process.env.APP_URL || 'http://localhost:3100';
  const loc = localeForPublic(project);
  const title = held ? t(loc, 'email.heldSubject', { title: report.title }) : t(loc, 'email.sentMissingSubject', { title: report.title });
  const list = failed
    .map((s) => `<li><strong>${esc(s.platform)}</strong> · ${esc(s.account_name)}: ${esc(s.error ?? t(loc, 'email.failedToLoad'))} — <a href="${base}${reconnectUrl({ id: s.integrationId, projectId: project.id, slug: s.slug })}">${t(loc, 'email.reconnect')}</a></li>`)
    .join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto"><h2 style="margin:0 0 8px">${esc(held ? t(loc, 'email.heldTitle') : t(loc, 'email.sentMissingTitle'))}</h2><p style="color:#475569">${esc(project.name)} · ${esc(report.title)}</p><p>${t(loc, held ? 'email.heldIntro' : 'email.sentMissingIntro')}</p><ul>${list}</ul><p><a href="${base}/reports/${report.id}">${t(loc, 'email.openReport')}</a>${held ? t(loc, 'email.heldOutro') : '.'}</p></div>`;
  await notify(project.companyId, project.id, title, failed.map((s) => `${s.platform} · ${s.account_name}`).join(', '), `/projects/${project.id}?tab=automations`);
  const to = await alertRecipients(project.companyId);
  if (to.length) await sendEmail(to, `[Ruler Reports] ${title}`, html, { companyId: project.companyId });
}

export async function runAutomation(id: number, opts: { manual?: boolean } = {}) {
  const a = await db.automation.findUnique({ where: { id }, include: { project: true } });
  if (!a) throw new Error('Automation not found');
  const project = a.project;
  const run = await db.automationRun.create({ data: { automationId: a.id, status: 'ok' } });
  try {
    const day = today(project.timezone);
    const period = periodForRun(a.frequency, day);
    const comp = a.comparison ? previousPeriod(period) : null;
    const tpl = a.templateId ?? (await db.template.findFirst({ where: { kind: 'report', isDefault: true, companyId: null } }))?.id;
    if (!tpl) throw new Error('No template available');
    const report = await createReport({
      companyId: project.companyId,
      projectId: project.id,
      kind: 'report',
      title: `${project.name} | ${period.label}`,
      subtitle: `${a.title}`,
      start: period.start,
      end: period.end,
      comparisonStart: comp?.start,
      comparisonEnd: comp?.end,
      templateId: tpl,
      integrationIds: (a.integrationIds as number[]) ?? [],
      automationId: a.id,
      withAi: a.attachAnalysis,
    });
    // a report with failed sources is held (spec v3 §3.2): the agency is told, the client waits for "Send now"
    const failed = failedSources(report.data as unknown as ReportData);
    const hold = failed.length > 0 && a.holdOnFailure;
    const detail: Record<string, unknown> = hold ? { held: failed.map((s) => `${s.platform} · ${s.account_name}`) } : await deliverChannels(a, report);
    if (failed.length) await failureAlert(a, report, failed, hold);

    const now = new Date();
    const next = nextRunAfter(a, project.timezone, now, now);
    await db.automation.update({ where: { id: a.id }, data: { lastRunAt: now, lastReportId: report.id, lastError: null, nextRunAt: a.enabled || opts.manual ? next : null } });
    await db.automationRun.update({ where: { id: run.id }, data: { reportId: report.id, status: hold ? 'held' : 'ok', detail: detail as any } });
    await emitEvent(project.companyId, project.id, 'automation_executed', { automation_id: a.id, title: a.title, report_id: report.id, url: shareUrl('report', report.shareToken), ...(hold ? { held: true } : {}) });
    return { report, detail, status: hold ? ('held' as const) : ('ok' as const) };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.automationRun.update({ where: { id: run.id }, data: { status: 'error', detail: { error } } });
    await db.automation.update({ where: { id: a.id }, data: { lastError: error } });
    throw e;
  }
}

/**
 * "Send now" on a held run (spec v3 §3.2). The run is claimed atomically (status held → sending) so two clicks deliver
 * once (review I2); the sources that failed are refreshed through `regenerateSource` before the stored report goes out
 * (review I1) — one that still fails is delivered as is and named in the run detail. The whole report is never regenerated.
 */
export async function deliverRun(runId: number) {
  const claimed = await db.automationRun.updateMany({ where: { id: runId, status: 'held' }, data: { status: 'sending' } });
  if (!claimed.count) {
    if (!(await db.automationRun.findUnique({ where: { id: runId }, select: { id: true } }))) throw new Error('Run not found');
    throw new Error('This run is not held');
  }
  try {
    const run = await db.automationRun.findUniqueOrThrow({ where: { id: runId }, include: { automation: { include: { project: true } } } });
    let report = run.reportId ? await db.report.findUnique({ where: { id: run.reportId }, include: { project: true } }) : null;
    if (!report) throw new Error('The held report no longer exists');
    const extra: Record<string, unknown> = {};
    const failedBefore = failedSources(report.data as unknown as ReportData);
    if (failedBefore.length) {
      let data = report.data as unknown as ReportData;
      for (const s of failedBefore) {
        try {
          data = await regenerateSource({ ...report, data: data as any }, s.integrationId);
        } catch {
          // the source keeps its error; the report is delivered as the agency asked
        }
      }
      await db.report.update({ where: { id: report.id }, data: { data: data as any, dataSyncedAt: new Date() } });
      report = { ...report, data: data as any };
      const still = new Set(failedSources(data).map((s) => s.integrationId));
      const label = (s: SourceStatus) => `${s.platform} · ${s.account_name}`;
      extra.refreshed = failedBefore.filter((s) => !still.has(s.integrationId)).map(label);
      extra.still_failing = failedBefore.filter((s) => still.has(s.integrationId)).map(label);
    }
    const detail = await deliverChannels(run.automation, report);
    await db.automationRun.update({ where: { id: run.id }, data: { status: 'ok', detail: { ...((run.detail as object) ?? {}), ...detail, ...extra, sent_at: new Date().toISOString() } as any } });
    return { detail: { ...detail, ...extra } };
  } catch (e) {
    await db.automationRun.update({ where: { id: runId }, data: { status: 'held' } }).catch(() => null);
    throw e;
  }
}

/** Called by the scheduler (and `npm run tick`). */
export async function tick(now = new Date()) {
  const due = await db.automation.findMany({ where: { enabled: true, nextRunAt: { lte: now } } });
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const a of due) {
    try {
      await runAutomation(a.id);
      results.push({ id: a.id, ok: true });
    } catch (e) {
      // push next run forward so a broken automation does not retry every minute
      const proj = await db.project.findUnique({ where: { id: a.projectId } });
      await db.automation.update({ where: { id: a.id }, data: { nextRunAt: nextRunAfter(a, proj?.timezone ?? 'UTC', now, now) } });
      results.push({ id: a.id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

export async function scheduleNext(a: Automation, tz: string) {
  const next = a.enabled ? nextRunAfter(a, tz, new Date(), a.lastRunAt) : null;
  return db.automation.update({ where: { id: a.id }, data: { nextRunAt: next } });
}
