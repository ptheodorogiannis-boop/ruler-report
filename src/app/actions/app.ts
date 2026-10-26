'use server';

import { revalidatePath } from 'next/cache';
import { isLocale } from '@/lib/i18n';
import { isMediaOrHttps } from '@/lib/media/url';
import { checkIntegration } from '@/lib/services/health';
import { regenerateSource } from '@/lib/engine/report';
import { scopeSchema, type CampaignScope } from '@/lib/engine/campaigns';
import { listCampaignsFor } from '@/lib/services/campaigns';
import { deliverRun } from '@/lib/services/automations';
import type { Campaign } from '@/lib/engine/types';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertProject, canAdmin, canWrite, hashPassword, requirePrincipal, type Principal } from '@/lib/auth';
import { findWidget } from '@/lib/catalog/build';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { randomToken, sha256 } from '@/lib/crypto';
import { db } from '@/lib/db';
import { analyse, analyseBlock } from '@/lib/ai/insights';
import { TONE_LABEL, isTone, type Tone } from '@/lib/ai/tones';
import { connectIntegration, refreshColumns } from '@/lib/services/integrations';
import { convertReport, createReport, duplicateReport } from '@/lib/services/reports';
import { snapshotReport, liveDashboardData } from '@/lib/engine/report';
import { createGoalsShare, setGoalsPassword, stopGoalsShare } from '@/lib/services/goals-share';
import { ROLLING_PRESETS } from '@/lib/services/dashboards';
import { reportView } from '@/lib/layout/service';
import { runAutomation, scheduleNext } from '@/lib/services/automations';
import { evaluateGoals } from '@/lib/services/goals';
import { WEBHOOK_EVENTS, WEBHOOK_SOURCES, emitEvent, newWebhookSecret } from '@/lib/services/webhooks';
import { sendEmail } from '@/lib/services/messaging';
import type { AnalysisCard, ReportData, TemplateSection } from '@/lib/engine/types';
import { isDate } from '@/lib/util/dates';
import { formulaRefs } from '@/lib/engine/formula';
import { textToHtml } from '@/lib/util/sanitize';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function writer(): Promise<Principal> {
  const p = await requirePrincipal();
  if (!canWrite(p)) throw new Error('Your role is read-only.');
  return p;
}
async function admin(): Promise<Principal> {
  const p = await requirePrincipal();
  if (!canAdmin(p)) throw new Error('Admin access required.');
  return p;
}

// ───────────── projects ─────────────
export async function createProjectAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const r = z.object({ name: z.string().min(1), timezone: z.string().min(1), currency: z.string().length(3), decimal: z.enum(['comma_dot', 'dot_comma']) }).parse({ name: fd.get('name'), timezone: fd.get('timezone') || 'UTC', currency: String(fd.get('currency') || 'EUR').toUpperCase(), decimal: fd.get('decimal') || 'comma_dot' });
    // a new project speaks the company's language until its settings say otherwise (spec v3 §5)
    const company = await db.company.findUnique({ where: { id: p.companyId }, select: { locale: true } });
    const proj = await db.project.create({ data: { companyId: p.companyId, name: r.name, timezone: r.timezone, currency: r.currency, decimalSeparatorFormat: r.decimal, locale: company?.locale ?? 'en' } });
    redirect(`/projects/${proj.id}?tab=integrations`);
  } catch (e) {
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    return { error: (e as Error).message };
  }
}
export async function updateProjectAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const id = Number(fd.get('id'));
    await assertProject(p, id);
    const r = z
      .object({
        name: z.string().min(1).max(120),
        timezone: z.string().min(1).max(64),
        currency: z.string().length(3),
        dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
        decimal: z.enum(['comma_dot', 'dot_comma']),
        locale: z.enum(['en', 'el']),
        // an upload of ours or an https address, never anything else (it ends up in an <img src>)
        logo: z.string().max(500).refine(isMediaOrHttps, 'The logo must be an uploaded image or an https:// address'),
      })
      .parse({ name: fd.get('name'), timezone: fd.get('timezone') || 'UTC', currency: String(fd.get('currency') ?? '').toUpperCase(), dateFormat: fd.get('dateFormat') || 'DD/MM/YYYY', decimal: fd.get('decimal') || 'comma_dot', locale: fd.get('locale') || 'en', logo: String(fd.get('logo') ?? '').trim() });
    await db.project.update({ where: { id }, data: { name: r.name, timezone: r.timezone, currency: r.currency, dateFormat: r.dateFormat, decimalSeparatorFormat: r.decimal, locale: r.locale, logo: r.logo || null } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/projects/${fd.get('id')}`);
  revalidatePath('/projects');
  revalidatePath('/overview');
  return { error: null as string | null, saved: true };
}
export async function deleteProjectAction(fd: FormData) {
  const p = await admin();
  const id = Number(fd.get('id'));
  const proj = await assertProject(p, id);
  await db.project.delete({ where: { id: proj.id } });
  redirect('/projects');
}

// ───────────── integrations ─────────────
export async function connectIntegrationAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const projectId = Number(fd.get('projectId'));
    await assertProject(p, projectId);
    const slug = String(fd.get('slug'));
    const def = getIntegrationDef(slug);
    if (!def) throw new Error('Unknown integration');
    const credentials: Record<string, string> = {};
    for (const f of def.fields ?? []) {
      const v = String(fd.get(`cred_${f.name}`) ?? '').trim();
      if (v) credentials[f.name] = v;
    }
    const rt = String(fd.get('cred_refreshToken') ?? '').trim();
    if (rt) {
      if (rt.startsWith('ya29.')) credentials.accessToken = rt;
      else credentials.refreshToken = rt;
    }
    const demo = fd.get('demo') === 'on';
    if (demo) Object.assign(credentials, { demo: true });
    const headers = String(fd.get('headers') ?? '').trim();
    const config: Record<string, any> = {};
    if (headers) {
      try {
        config.headers = JSON.parse(headers);
      } catch {
        throw new Error('Headers must be valid JSON, e.g. {"Authorization":"Bearer …"}');
      }
    }
    await connectIntegration({ companyId: p.companyId, projectId, slug, replaceId: Number(fd.get('replaceId')) || undefined, name: String(fd.get('name') ?? '') || undefined, sourceId: String(fd.get('sourceId') ?? '').trim() || (demo ? `demo-${randomToken(4)}` : ''), credentials, config });
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/projects/${fd.get('projectId')}?tab=integrations`);
}
export async function removeIntegrationAction(fd: FormData) {
  const p = await writer();
  const i = await db.integration.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (i) await db.integration.delete({ where: { id: i.id } });
  revalidatePath(`/projects/${i?.projectId}`);
}
export async function toggleIntegrationAction(fd: FormData) {
  const p = await writer();
  const i = await db.integration.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (i) await db.integration.update({ where: { id: i.id }, data: { status: i.status === 'active' ? 'inactive' : 'active' } });
  revalidatePath(`/projects/${i?.projectId}`);
}
export async function refreshColumnsAction(fd: FormData) {
  const p = await writer();
  const i = await db.integration.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (i) await refreshColumns(i.id).catch(() => null);
  revalidatePath(`/projects/${i?.projectId}`);
}

// ───────────── reports / dashboards ─────────────
export async function createReportAction(input: {
  projectId: number;
  kind: 'report' | 'dashboard';
  title: string;
  subtitle?: string;
  start?: string;
  end?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
  preset?: string;
  templateId: number;
  integrationIds: number[];
  withAi?: boolean;
  campaigns?: Record<number, CampaignScope>;
}): Promise<Result<{ id: number; kind: string }>> {
  try {
    const p = await writer();
    await assertProject(p, input.projectId);
    if (input.start && !isDate(input.start)) throw new Error('Invalid start date');
    const r = await createReport({ companyId: p.companyId, projectId: input.projectId, kind: input.kind, title: input.title, subtitle: input.subtitle, start: input.start, end: input.end, comparisonStart: input.comparisonStart || null, comparisonEnd: input.comparisonEnd || null, preset: input.preset as any, templateId: input.templateId, integrationIds: input.integrationIds, createdBy: p.userId, withAi: input.withAi, campaigns: input.campaigns });
    return { ok: true, id: r.id, kind: r.kind };
  } catch (e) {
    return fail(e);
  }
}
export async function deleteReportAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (r) await db.report.delete({ where: { id: r.id } });
  redirect(r?.kind === 'dashboard' ? '/dashboards' : '/reports');
}
/** Duplicate / convert (spec v3 §3.6): both land on the resulting page. */
export async function duplicateReportAction(fd: FormData) {
  const p = await writer();
  const copy = await duplicateReport(Number(fd.get('id')), p.companyId);
  redirect(`/${copy.kind === 'report' ? 'reports' : 'dashboards'}/${copy.id}`);
}
export async function convertReportAction(fd: FormData) {
  const p = await writer();
  const kind = String(fd.get('kind')) === 'dashboard' ? 'dashboard' : 'report';
  const r = await convertReport(Number(fd.get('id')), p.companyId, kind);
  revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
  redirect(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
}
export async function refreshReportAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId }, include: { project: true } });
  if (!r) return;
  if (r.kind === 'report') {
    const data = await snapshotReport(r);
    await db.report.update({ where: { id: r.id }, data: { data: data as any, dataSyncedAt: new Date() } });
  } else await liveDashboardData(r, { force: true });
  revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
}
export async function updateShareAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (!r) return;
  const op = String(fd.get('op'));
  if (op === 'toggle') await db.report.update({ where: { id: r.id }, data: { shareEnabled: !r.shareEnabled } });
  if (op === 'rotate') await db.report.update({ where: { id: r.id }, data: { shareToken: randomToken(24) } });
  if (op === 'password') {
    const pw = String(fd.get('password') ?? '');
    await db.report.update({ where: { id: r.id }, data: { password: pw ? sha256(pw) : null } });
  }
  revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
}
/** Public goals page (spec v3 §3.4): mint the link, set or remove its password, or stop sharing. Admins only. */
export async function shareGoalsAction(fd: FormData) {
  const p = await admin();
  const projectId = Number(fd.get('projectId'));
  await assertProject(p, projectId);
  const op = String(fd.get('op'));
  if (op === 'share') await createGoalsShare(projectId);
  if (op === 'password') await setGoalsPassword(projectId, String(fd.get('password') ?? '') || null);
  if (op === 'stop') await stopGoalsShare(projectId);
  revalidatePath(`/projects/${projectId}`);
}
export async function updateDashboardPresetAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId, kind: 'dashboard' } });
  if (!r) return;
  const preset = String(fd.get('preset'));
  // the presets the client may switch to (spec v3 §3.5); the saved one is always allowed and never repeated
  const clientPresets = fd.getAll('clientPresets').map(String).filter((x, i, a) => (ROLLING_PRESETS as string[]).includes(x) && x !== preset && a.indexOf(x) === i);
  await db.report.update({ where: { id: r.id }, data: { preset, clientPresets } });
  revalidatePath(`/dashboards/${r.id}`);
}
export async function emailReportAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  const to = String(fd.get('to') ?? '').split(/[,\s;]+/).filter((x) => /.+@.+/.test(x));
  if (!r || !to.length) return;
  const base = process.env.APP_URL || 'http://localhost:3100';
  const url = `${base}/${r.kind === 'report' ? 'r' : 'd'}/${r.shareToken}`;
  await sendEmail(to, r.title, `<p>${r.title} is ready.</p><p><a href="${url}">Open the ${r.kind}</a></p>`, { companyId: p.companyId });
  revalidatePath(`/reports/${r.id}`);
}

// analysis cards
async function loadCards(id: number, p: Principal) {
  const r = await db.report.findFirst({ where: { id, companyId: p.companyId }, include: { project: true } });
  if (!r) throw new Error('Not found');
  return { r, cards: ((r.analysis as unknown as AnalysisCard[]) ?? []) as AnalysisCard[] };
}
export async function saveAnalysisAction(input: { reportId: number; cardId?: string; title: string; html: string }): Promise<Result> {
  try {
    const p = await writer();
    const { r, cards } = await loadCards(input.reportId, p);
    const now = new Date().toISOString();
    const next = input.cardId ? cards.map((c) => (c.id === input.cardId ? { ...c, title: input.title, html: textToHtml(input.html), author: 'human' as const, updatedAt: now } : c)) : [...cards, { id: randomToken(6), title: input.title, html: textToHtml(input.html), author: 'human' as const, updatedAt: now }];
    await db.report.update({ where: { id: r.id }, data: { analysis: next as any } });
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
export async function deleteAnalysisAction(input: { reportId: number; cardId: string }): Promise<Result> {
  try {
    const p = await writer();
    const { r, cards } = await loadCards(input.reportId, p);
    await db.report.update({ where: { id: r.id }, data: { analysis: cards.filter((c) => c.id !== input.cardId) as any } });
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
/** Per-block AI analysis (spec v3 §4.4): one card per block and tone, placed after its block; a re-run replaces the block's earlier AI card of that tone. */
export async function generateBlockAnalysisAction(input: { reportId: number; blockId: string; tone: Tone; language?: string; notes?: string }): Promise<Result<{ ai: boolean }>> {
  try {
    const p = await writer();
    if (!isTone(input.tone)) throw new Error('Unknown tone');
    const { r, cards } = await loadCards(input.reportId, p);
    const data = (await reportView(r)).data;
    const sec = data.sections.find((s) => s.id === input.blockId);
    if (!sec) throw new Error('This block no longer exists');
    const a = await analyseBlock(data, input.blockId, { tone: input.tone, language: input.language, notes: input.notes, projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
    const card: AnalysisCard = { id: randomToken(6), title: `${sec.title} — ${TONE_LABEL[input.tone]}`, html: a.html, author: 'ai', updatedAt: new Date().toISOString(), blockId: input.blockId, tone: input.tone };
    const kept = cards.filter((c) => !(c.author === 'ai' && c.blockId === input.blockId && (c.tone ?? 'general') === input.tone));
    await db.report.update({ where: { id: r.id }, data: { analysis: [...kept, card] as any } });
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true, ai: a.ai };
  } catch (e) {
    return fail(e);
  }
}
/** "Analyse all blocks": the general tone for every layout block, replacing earlier general block cards. */
export async function generateAllBlocksAction(input: { reportId: number; language?: string }): Promise<Result<{ ai: boolean; blocks: number }>> {
  try {
    const p = await writer();
    const { r, cards } = await loadCards(input.reportId, p);
    const data = (await reportView(r)).data;
    const sections = data.sections.filter((s) => s.blocks.length > 0);
    let ai = false;
    const fresh: AnalysisCard[] = [];
    for (const sec of sections) {
      const a = await analyseBlock(data, sec.id, { tone: 'general', language: input.language, projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
      ai = ai || a.ai;
      fresh.push({ id: randomToken(6), title: `${sec.title} — ${TONE_LABEL.general}`, html: a.html, author: 'ai', updatedAt: new Date().toISOString(), blockId: sec.id, tone: 'general' });
    }
    const kept = cards.filter((c) => !(c.author === 'ai' && c.blockId && (c.tone ?? 'general') === 'general' && sections.some((s) => s.id === c.blockId)));
    await db.report.update({ where: { id: r.id }, data: { analysis: [...kept, ...fresh] as any } });
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true, ai, blocks: fresh.length };
  } catch (e) {
    return fail(e);
  }
}
export async function generateAnalysisAction(input: { reportId: number; language?: string; notes?: string }): Promise<Result<{ ai: boolean }>> {
  try {
    const p = await writer();
    const { r, cards } = await loadCards(input.reportId, p);
    const data = (await reportView(r)).data;
    const a = await analyse(data, r.project.name, { language: input.language, notes: input.notes, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
    const card: AnalysisCard = { id: randomToken(6), title: a.ai ? 'AI analysis' : 'Automatic analysis', html: a.html, author: 'ai', updatedAt: new Date().toISOString() };
    await db.report.update({ where: { id: r.id }, data: { analysis: [...cards, card] as any } });
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true, ai: a.ai };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── templates ─────────────
export async function saveTemplateAction(input: { id?: number; title: string; description: string; kind: 'report' | 'dashboard'; sections: TemplateSection[] }): Promise<Result<{ id: number }>> {
  try {
    const p = await writer();
    if (!input.title.trim()) throw new Error('Title is required');
    const sections = input.sections.filter((s) => s.widgets.length > 0).map((s, i) => ({ id: s.id || `s${i + 1}`, title: s.title || `Section ${i + 1}`, widgets: s.widgets }));
    if (!sections.length) throw new Error('Add at least one widget');
    if (input.id) {
      const t = await db.template.findFirst({ where: { id: input.id, companyId: p.companyId } });
      if (!t) throw new Error('Template not found (platform templates are read-only — duplicate them first).');
      await db.template.update({ where: { id: t.id }, data: { title: input.title, description: input.description, sections: sections as any } });
      return { ok: true, id: t.id };
    }
    const t = await db.template.create({ data: { companyId: p.companyId, title: input.title, description: input.description, kind: input.kind, sections: sections as any } });
    return { ok: true, id: t.id };
  } catch (e) {
    return fail(e);
  }
}
export async function duplicateTemplateAction(fd: FormData) {
  const p = await writer();
  const t = await db.template.findFirst({ where: { id: Number(fd.get('id')), OR: [{ companyId: null }, { companyId: p.companyId }] } });
  if (!t) return;
  const c = await db.template.create({ data: { companyId: p.companyId, title: `${t.title} (copy)`, description: t.description, kind: t.kind, sections: t.sections as any } });
  redirect(`/templates/${c.id}`);
}
export async function deleteTemplateAction(fd: FormData) {
  const p = await writer();
  const t = await db.template.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (t) await db.template.delete({ where: { id: t.id } });
  redirect('/templates');
}

// ───────────── automations ─────────────
export async function saveAutomationAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const projectId = Number(fd.get('projectId'));
    const proj = await assertProject(p, projectId);
    const channels = fd.getAll('channels').map(String);
    if (!channels.length) throw new Error('Pick at least one delivery channel');
    const emails = String(fd.get('emails') ?? '').split(/[,\s;]+/).filter(Boolean);
    if (channels.includes('email') && !emails.length) throw new Error('Add at least one email recipient');
    const integrationIds = fd.getAll('integrationIds').map(Number);
    if (!integrationIds.length) throw new Error('Select at least one integration');
    const data = {
      title: String(fd.get('title') || 'Automated report'),
      frequency: String(fd.get('frequency') || 'monthly'),
      dayOfWeek: Number(fd.get('dayOfWeek') ?? 1),
      dayOfMonth: Math.min(28, Math.max(1, Number(fd.get('dayOfMonth') ?? 1))),
      hour: Math.min(23, Math.max(0, Number(fd.get('hour') ?? 8))),
      weekdaysOnly: fd.get('weekdaysOnly') === 'on',
      monthlyRule: /^(day|(first|last):[0-6])$/.test(String(fd.get('monthlyRule') ?? '')) ? String(fd.get('monthlyRule')) : 'day',
      holdOnFailure: fd.get('holdOnFailure') === 'on',
      attachPdf: fd.get('attachPdf') === 'on',
      templateId: Number(fd.get('templateId')) || null,
      integrationIds,
      comparison: fd.get('comparison') === 'on',
      channels,
      emails,
      whatsappUrl: String(fd.get('whatsappUrl') ?? '') || null,
      whatsappType: String(fd.get('whatsappType') ?? '') || null,
      slackUrl: String(fd.get('slackUrl') ?? '') || null,
      teamsUrl: String(fd.get('teamsUrl') ?? '') || null,
      discordUrl: String(fd.get('discordUrl') ?? '') || null,
      telegramBotToken: String(fd.get('telegramBotToken') ?? '') || null,
      telegramChatId: String(fd.get('telegramChatId') ?? '') || null,
      attachAnalysis: fd.get('attachAnalysis') === 'on',
    };
    const id = Number(fd.get('id'));
    const a = id ? await db.automation.update({ where: { id }, data }) : await db.automation.create({ data: { ...data, projectId } });
    await scheduleNext(a, proj.timezone);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/projects/${fd.get('projectId')}?tab=automations`);
}
export async function toggleAutomationAction(fd: FormData) {
  const p = await writer();
  const a = await db.automation.findFirst({ where: { id: Number(fd.get('id')), project: { companyId: p.companyId } }, include: { project: true } });
  if (!a) return;
  const r = await db.automation.update({ where: { id: a.id }, data: { enabled: !a.enabled } });
  await scheduleNext(r, a.project.timezone);
  revalidatePath('/automations');
  revalidatePath(`/projects/${a.projectId}`);
}
export async function runAutomationAction(fd: FormData) {
  const p = await writer();
  const a = await db.automation.findFirst({ where: { id: Number(fd.get('id')), project: { companyId: p.companyId } } });
  if (!a) return;
  let target = `/projects/${a.projectId}?tab=automations`;
  try {
    const { report } = await runAutomation(a.id, { manual: true });
    target = `/reports/${report.id}`;
  } catch {
    /* error is stored on the automation and shown in the UI */
  }
  redirect(target);
}
export async function deleteAutomationAction(fd: FormData) {
  const p = await writer();
  const a = await db.automation.findFirst({ where: { id: Number(fd.get('id')), project: { companyId: p.companyId } } });
  if (a) await db.automation.delete({ where: { id: a.id } });
  revalidatePath('/automations');
  revalidatePath(`/projects/${a?.projectId}`);
}

// ───────────── goals ─────────────
export async function saveGoalAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const projectId = Number(fd.get('projectId'));
    await assertProject(p, projectId);
    const integrationId = Number(fd.get('integrationId'));
    const integ = await db.integration.findFirst({ where: { id: integrationId, projectId } });
    if (!integ) throw new Error('Pick an integration of this project');
    const key = String(fd.get('referenceKey'));
    const short = key.includes(':') ? key.split(':').slice(1).join(':') : key;
    const w = findWidget(integ.slug, short, integ.config as any);
    if (!w || w.component !== 'number_v1') throw new Error('Goals need a single-number metric');
    const target = Number(fd.get('target'));
    if (!(target > 0)) throw new Error('Target must be greater than 0');
    const alertEmails = String(fd.get('alertEmails') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (alertEmails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new Error('Alert e-mails must be valid addresses, separated by commas');
    await db.goal.create({ data: { projectId, integrationId, referenceKey: w.reference_key, title: String(fd.get('title') || w.title), frequency: String(fd.get('frequency') || 'monthly'), target, direction: String(fd.get('direction') || 'higher_better'), alert: fd.get('alert') === 'on', alertEmails } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/projects/${fd.get('projectId')}?tab=goals`);
}
export async function deleteGoalAction(fd: FormData) {
  const p = await writer();
  const g = await db.goal.findFirst({ where: { id: Number(fd.get('id')), project: { companyId: p.companyId } } });
  if (g) await db.goal.delete({ where: { id: g.id } });
  revalidatePath(`/projects/${g?.projectId}`);
  revalidatePath('/goals');
}
export async function evaluateGoalsAction() {
  const p = await writer();
  await evaluateGoals(p.companyId);
  revalidatePath('/goals');
}

// ───────────── timeline ─────────────
export async function addTimelineAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const projectId = Number(fd.get('projectId'));
    await assertProject(p, projectId);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) throw new Error('Title is required');
    const date = String(fd.get('date') || new Date().toISOString().slice(0, 10));
    const image = String(fd.get('image') ?? '').trim();
    if (!isMediaOrHttps(image)) throw new Error('The image must be an uploaded file or an https:// address');
    const t = await db.timelineEvent.create({ data: { projectId, title, content: `<p>${String(fd.get('content') ?? '').replace(/</g, '&lt;')}</p>`, date, image: image || null } });
    await emitEvent(p.companyId, projectId, 'timeline_milestone_added', { id: t.id, title: t.title, date: t.date });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/projects/${fd.get('projectId')}`);
  return { error: null as string | null };
}
export async function deleteTimelineAction(fd: FormData) {
  const p = await writer();
  const t = await db.timelineEvent.findFirst({ where: { id: Number(fd.get('id')), project: { companyId: p.companyId } } });
  if (t) await db.timelineEvent.delete({ where: { id: t.id } });
  revalidatePath(`/projects/${t?.projectId}`);
}

// ───────────── blended metrics ─────────────
export async function saveCustomMetricAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const formula = String(fd.get('formula') ?? '').trim();
    formulaRefs(formula);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) throw new Error('Name is required');
    await db.customMetric.create({ data: { companyId: p.companyId, name, formula, format: String(fd.get('format') || 'number'), diff: String(fd.get('diff') || 'positive_good') } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath('/custom-metrics');
  return { error: null as string | null };
}
export async function deleteCustomMetricAction(fd: FormData) {
  const p = await writer();
  await db.customMetric.deleteMany({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  revalidatePath('/custom-metrics');
}

// ───────────── settings: branding, tokens, webhooks, team ─────────────
export async function saveBrandingAction(_: unknown, fd: FormData) {
  try {
    const p = await admin();
    const color = String(fd.get('brandColor') ?? '#4f46e5');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Brand colour must be a hex value like #4f46e5');
    const domain = String(fd.get('customDomain') ?? '').trim().toLowerCase();
    await db.company.update({ where: { id: p.companyId }, data: { name: String(fd.get('name') || 'Agency'), brandColor: color, accentColor: String(fd.get('accentColor') || '#0ea5e9'), logo: String(fd.get('logo') ?? '') || null, customDomain: domain || null, hidePoweredBy: fd.get('hidePoweredBy') === 'on', showDataNotes: fd.get('showDataNotes') === 'on', emailFromName: String(fd.get('emailFromName') ?? '') || null, locale: isLocale(fd.get('locale')) ? String(fd.get('locale')) : 'en' } });
  } catch (e) {
    return { error: (e as Error).message, saved: false };
  }
  revalidatePath('/', 'layout');
  return { error: null as string | null, saved: true };
}
/** The account menu's EN / EL switch (spec v3 §5): a personal override of the company language. */
export async function setUserLocaleAction(fd: FormData) {
  const p = await requirePrincipal();
  const l = fd.get('locale');
  if (!p.userId || !isLocale(l)) return;
  await db.user.update({ where: { id: p.userId }, data: { locale: l } });
  revalidatePath('/', 'layout');
}
export async function createTokenAction(_: unknown, fd: FormData) {
  try {
    const p = await admin();
    const token = `rr_${randomToken(24)}`;
    await db.apiToken.create({ data: { companyId: p.companyId, name: String(fd.get('name') || 'API token'), prefix: token.slice(0, 7), tokenHash: sha256(token) } });
    revalidatePath('/settings');
    return { token, error: null as string | null };
  } catch (e) {
    return { token: null, error: (e as Error).message };
  }
}
export async function revokeTokenAction(fd: FormData) {
  const p = await admin();
  await db.apiToken.deleteMany({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  revalidatePath('/settings');
}
export async function saveWebhookAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const r = z.object({ url: z.string().url(), eventType: z.enum(WEBHOOK_EVENTS), source: z.enum(WEBHOOK_SOURCES), projectId: z.number().nullable() }).parse({ url: fd.get('url'), eventType: fd.get('eventType'), source: fd.get('source') || 'custom', projectId: fd.get('projectId') ? Number(fd.get('projectId')) : null });
    if (r.projectId) await assertProject(p, r.projectId);
    await db.webhook.create({ data: { companyId: p.companyId, url: r.url, eventType: r.eventType, source: r.source, projectId: r.projectId, secret: newWebhookSecret() } });
    revalidatePath('/settings');
    return { error: null as string | null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function deleteWebhookAction(fd: FormData) {
  const p = await writer();
  await db.webhook.deleteMany({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  revalidatePath('/settings');
}
export async function toggleWebhookAction(fd: FormData) {
  const p = await writer();
  const w = await db.webhook.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (w) await db.webhook.update({ where: { id: w.id }, data: { status: w.status === 'active' ? 'inactive' : 'active' } });
  revalidatePath('/settings');
}
export async function testWebhookAction(fd: FormData) {
  const p = await writer();
  const w = await db.webhook.findFirst({ where: { id: Number(fd.get('id')), companyId: p.companyId } });
  if (!w) return;
  const wasInactive = w.status !== 'active';
  if (wasInactive) await db.webhook.update({ where: { id: w.id }, data: { status: 'active' } });
  await emitEvent(p.companyId, w.projectId, w.eventType as any, { title: 'Test event from Ruler Reports', message: 'This is a test delivery.', test: true });
  if (wasInactive) await db.webhook.update({ where: { id: w.id }, data: { status: 'inactive' } });
  revalidatePath('/settings');
}
export async function inviteUserAction(_: unknown, fd: FormData) {
  try {
    const p = await admin();
    const email = String(fd.get('email') ?? '').toLowerCase().trim();
    const role = String(fd.get('role') || 'editor');
    if (!['admin', 'editor', 'viewer', 'client'].includes(role)) throw new Error('Invalid role');
    if (await db.user.findUnique({ where: { email } })) throw new Error('Email already in use');
    const pw = String(fd.get('password') ?? '');
    if (pw.length < 8) throw new Error('Password must be at least 8 characters');
    const u = await db.user.create({ data: { companyId: p.companyId, email, name: String(fd.get('name') || email), passwordHash: await hashPassword(pw), role } });
    const projectIds = fd.getAll('projectIds').map(Number).filter(Boolean);
    for (const projectId of projectIds) await db.projectAccess.create({ data: { userId: u.id, projectId } });
    revalidatePath('/settings');
    return { error: null as string | null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
export async function removeUserAction(fd: FormData) {
  const p = await admin();
  const id = Number(fd.get('id'));
  if (id === p.userId) return;
  await db.user.deleteMany({ where: { id, companyId: p.companyId, role: { not: 'owner' } } });
  revalidatePath('/settings');
}

// ───────────── notifications ─────────────
export async function markNotificationsReadAction() {
  const p = await requirePrincipal();
  await db.notification.updateMany({ where: { companyId: p.companyId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath('/notifications');
}
/** "Check now" on an integration row (spec v3 §1.1): one health check, written to the row, no alert. */
export async function checkIntegrationAction(fd: FormData) {
  try {
    const p = await writer();
    const id = Number(fd.get('integrationId'));
    const row = await db.integration.findFirst({ where: { id, companyId: p.companyId } });
    if (!row) throw new Error('Integration not found');
    await assertProject(p, row.projectId);
    const res = await checkIntegration(row);
    await db.integration.update({ where: { id }, data: { health: res.health, healthError: res.error, healthCheckedAt: new Date(), tokenExpiresAt: res.tokenExpiresAt } });
  } catch {
    // the chip shows the stored state; a failed manual check is not an error page
  }
  revalidatePath(`/projects/${fd.get('projectId')}`);
}
/** "Retry" on a failed source of a report (spec v3 §1.3): regenerates that account only. */
export async function retrySourceAction(fd: FormData) {
  const p = await writer();
  const r = await db.report.findFirst({ where: { id: Number(fd.get('reportId')), companyId: p.companyId }, include: { project: true } });
  if (!r || r.kind !== 'report') return;
  await assertProject(p, r.projectId);
  try {
    await regenerateSource(r, Number(fd.get('integrationId')));
  } catch {
    // the status list keeps showing the stored error; nothing else to do
  }
  revalidatePath(`/reports/${r.id}`);
}
/** The campaigns of one of the caller's ads accounts (spec v3 §2): feeds the scope editor in the block gear and the wizard. */
export async function listCampaignsAction(integrationId: number): Promise<Campaign[]> {
  const p = await requirePrincipal();
  const i = await db.integration.findFirst({ where: { id: integrationId, companyId: p.companyId }, include: { project: true } });
  if (!i) throw new Error('Integration not found');
  await assertProject(p, i.projectId);
  return listCampaignsFor(i, i.project);
}

/** The account's default campaign scope, saved into config.campaigns. */
export async function updateIntegrationCampaignsAction(_: unknown, fd: FormData) {
  try {
    const p = await writer();
    const i = await db.integration.findFirst({ where: { id: Number(fd.get('integrationId')), companyId: p.companyId } });
    if (!i) throw new Error('Integration not found');
    await assertProject(p, i.projectId);
    let raw: unknown;
    try {
      raw = JSON.parse(String(fd.get('scope') ?? ''));
    } catch {
      throw new Error('The campaign scope is malformed');
    }
    const parsed = scopeSchema.safeParse(raw);
    if (!parsed.success) throw new Error((raw as { mode?: string })?.mode === 'pick' ? 'Pick at least one campaign' : 'Each rule needs some text');
    await db.integration.update({ where: { id: i.id }, data: { config: { ...((i.config as Record<string, unknown>) ?? {}), campaigns: parsed.data } as any } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/projects/${fd.get('projectId')}`);
  return { error: null as string | null };
}
/** "Send now" on a held automation run (spec v3 §3.2). */
export async function sendHeldRunAction(fd: FormData) {
  const p = await writer();
  const run = await db.automationRun.findFirst({ where: { id: Number(fd.get('runId')), automation: { project: { companyId: p.companyId } } }, include: { automation: true } });
  if (!run) return;
  await assertProject(p, run.automation.projectId);
  try {
    await deliverRun(run.id);
  } catch {
    // the row keeps its status; nothing else to do
  }
  revalidatePath(`/projects/${run.automation.projectId}`);
  revalidatePath('/automations');
}
