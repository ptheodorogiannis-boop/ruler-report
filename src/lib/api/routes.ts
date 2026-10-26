// REST API v2 — endpoint-compatible with Reportei's v2 (docs/EVIDENCE.md §4) plus extensions marked [ext].
import { z } from 'zod';
import type { Integration, Project, Report, Template, Webhook, TimelineEvent, Automation, Goal, CustomMetric } from '@prisma/client';
import { assertProject, canAdmin, canWrite, projectScope, type Principal } from '@/lib/auth';
import { getCatalog, findWidget, toDefinition } from '@/lib/catalog/build';
import { INTEGRATIONS, getIntegrationDef } from '@/lib/catalog/integrations';
import { connectorFor } from '@/lib/connectors';
import { randomToken, sha256 } from '@/lib/crypto';
import { db } from '@/lib/db';
import { containsText } from '@/lib/platform';
import { FetchSession, resolveWidget } from '@/lib/engine/resolve';
import { toCtx } from '@/lib/engine/report';
import { reportView } from '@/lib/layout/service';
import { analyse, ask, analyseBlock } from '@/lib/ai/insights';
import { TONES, TONE_LABEL } from '@/lib/ai/tones';
import { connectIntegration } from '@/lib/services/integrations';
import { convertReport, createReport, duplicateReport, shareUrl } from '@/lib/services/reports';
import { WEBHOOK_EVENTS, WEBHOOK_SOURCES, emitEvent, newWebhookSecret } from '@/lib/services/webhooks';
import { goalProgress, loadGoal } from '@/lib/services/goals';
import { deliverRun, runAutomation, scheduleNext } from '@/lib/services/automations';
import { invalidateRows } from '@/lib/connectors/custom';
import { ApiError, RATE_LIMITS, forbidden, invalid, notFound, pageParams, paginated } from './http';
import { isDate } from '@/lib/util/dates';
import { isMediaOrHttps } from '@/lib/media/url';
import { scopeSchema } from '@/lib/engine/campaigns';
import { campaignScopeOf, listCampaignsFor } from '@/lib/services/campaigns';
import type { ReportData, TemplateSection } from '@/lib/engine/types';

export interface Ctx {
  p: Principal;
  query: URLSearchParams;
  params: Record<string, string>;
  body: any;
}
export type Handler = (c: Ctx) => Promise<unknown | { __status: number; body: unknown }>;
interface Route {
  method: string;
  pattern: string;
  re: RegExp;
  keys: string[];
  fn: Handler;
}
const routes: Route[] = [];
function add(method: string, pattern: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/gi, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, pattern, re, keys, fn });
}
export function match(method: string, path: string) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
export const status = (code: number, body: unknown) => ({ __status: code, body });

const base = () => process.env.APP_URL || 'http://localhost:3100';
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const num = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n)) throw notFound();
  return n;
};
const need = (p: Principal) => {
  if (!canWrite(p)) throw forbidden('Your role is read-only');
};
function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const errors: Record<string, string[]> = {};
  for (const i of r.error.issues) (errors[i.path.join('.') || '_'] ??= []).push(i.message);
  throw invalid(errors);
}

// ───────────── serializers ─────────────
const sProject = (p: Project) => ({ id: p.id, name: p.name, logo: p.logo ?? '', timezone: p.timezone, locale: p.locale, date_format: p.dateFormat, decimal_separator_format: p.decimalSeparatorFormat, currency: p.currency });
const sIntegration = (i: Integration & { project?: { name: string } }) => ({ id: i.id, source_id: i.sourceId, name: i.name, slug: i.slug, status: i.status, project_id: i.projectId, project_name: i.project?.name ?? null, created_at: iso(i.createdAt), updated_at: iso(i.updatedAt), last_sync_at: iso(i.lastSyncAt), last_error: i.lastError, campaigns: campaignScopeOf(i) ?? { mode: 'all' } });
const sReport = (r: Report) => ({
  id: r.id,
  title: r.title,
  subtitle: r.subtitle,
  start_date: r.startDate,
  end_date: r.endDate,
  comparison_start_date: r.comparisonStart,
  comparison_end_date: r.comparisonEnd,
  template_id: r.templateId,
  preset: r.preset,
  client_presets: (r.clientPresets as string[] | null) ?? [],
  client_id: r.projectId,
  views: r.views,
  created_at: iso(r.createdAt),
  internal_url: `${base()}/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`,
  external_url: r.shareEnabled ? shareUrl(r.kind, r.shareToken) : null,
});
const sTemplate = (t: Template, detail = false) => ({ id: t.id, title: t.title, description: t.description, kind: t.kind, is_default: t.isDefault, used_count: t.usedCount, created_at: iso(t.createdAt), updated_at: iso(t.updatedAt), ...(detail ? { sections: (t.sections as unknown as TemplateSection[]).map((s) => ({ id: s.id, title: s.title, widgets: s.widgets })) } : {}) });
const sWebhook = (w: Webhook) => ({ id: w.id, url: w.url, event_type: w.eventType, source: w.source, company_id: w.companyId, project_id: w.projectId, status: w.status, created_at: iso(w.createdAt), updated_at: iso(w.updatedAt) });
const sTimeline = (t: TimelineEvent) => ({ id: t.id, title: t.title, content: t.content, project_id: t.projectId, report_id: t.reportId, date: t.date, image: t.image ?? null, created_at: iso(t.createdAt), updated_at: iso(t.updatedAt) });
const sAutomation = (a: Automation) => ({ id: a.id, project_id: a.projectId, title: a.title, status: a.enabled ? 'enabled' : 'disabled', frequency: a.frequency, notification_channels: a.channels, emails: a.emails, whatsapp_url: a.whatsappUrl, template_id: a.templateId, integration_ids: a.integrationIds, comparison: a.comparison, day_of_week: a.dayOfWeek, day_of_month: a.dayOfMonth, hour: a.hour, weekdays_only: a.weekdaysOnly, monthly_rule: a.monthlyRule, hold_on_failure: a.holdOnFailure, attach_pdf: a.attachPdf, next_run_at: iso(a.nextRunAt), last_run_at: iso(a.lastRunAt), last_report_id: a.lastReportId, last_error: a.lastError });
const sCustomMetric = (m: CustomMetric) => ({ id: m.id, name: m.name, formula: m.formula, format: m.format, diff_type: m.diff, project_id: m.projectId });

const orderBy = (sortBy: string | undefined, desc: boolean, map: Record<string, string>) => ({ [map[sortBy ?? ''] ?? 'createdAt']: desc ? 'desc' : 'asc' }) as any;

// ───────────── company ─────────────
add('GET', '/companies/settings', async ({ p }) => {
  const c = await db.company.findUniqueOrThrow({ where: { id: p.companyId } });
  const total = await db.project.count({ where: { companyId: p.companyId } });
  return { id: c.id, name: c.name, logo: c.logo ?? '', type: c.type, total_clients: total, company_specialty: c.specialty, white_label: { brand_color: c.brandColor, accent_color: c.accentColor, custom_domain: c.customDomain, hide_powered_by: c.hidePoweredBy }, rate_limits: RATE_LIMITS };
});

// ───────────── projects ─────────────
add('GET', '/projects', async ({ p, query }) => {
  const pg = pageParams(query, ['name', 'created_at', 'updated_at']);
  const where = { ...projectScope(p), ...(query.get('q') ? { name: containsText(query.get('q')!) } : {}) };
  const [items, total] = await Promise.all([db.project.findMany({ where, orderBy: orderBy(pg.sortBy, pg.descending, { name: 'name', created_at: 'createdAt', updated_at: 'updatedAt' }), skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.project.count({ where })]);
  return paginated(items.map(sProject), total, pg, '/projects', query);
});
add('GET', '/projects/:id', async ({ p, params }) => ({ data: sProject(await assertProject(p, num(params.id)).catch(() => { throw notFound('Project'); })) }));
add('POST', '/projects', async ({ p, body }) => {
  need(p);
  const b = parse(z.object({ name: z.string().min(1), timezone: z.string().default('UTC'), locale: z.string().default('en'), currency: z.string().length(3).default('EUR'), date_format: z.string().default('DD/MM/YYYY'), decimal_separator_format: z.enum(['comma_dot', 'dot_comma']).default('comma_dot'), logo: z.string().optional() }), body);
  const r = await db.project.create({ data: { companyId: p.companyId, name: b.name, timezone: b.timezone, locale: b.locale, currency: b.currency.toUpperCase(), dateFormat: b.date_format, decimalSeparatorFormat: b.decimal_separator_format, logo: b.logo } });
  return status(201, { data: sProject(r) });
});
add('PUT', '/projects/:id', async ({ p, params, body }) => {
  need(p);
  const proj = await assertProject(p, num(params.id)).catch(() => { throw notFound('Project'); });
  const b = parse(z.object({ name: z.string().min(1).optional(), timezone: z.string().optional(), locale: z.string().optional(), currency: z.string().length(3).optional(), date_format: z.string().optional(), decimal_separator_format: z.enum(['comma_dot', 'dot_comma']).optional(), logo: z.string().nullable().optional() }), body);
  const r = await db.project.update({ where: { id: proj.id }, data: { name: b.name, timezone: b.timezone, locale: b.locale, currency: b.currency?.toUpperCase(), dateFormat: b.date_format, decimalSeparatorFormat: b.decimal_separator_format, logo: b.logo } });
  return { data: sProject(r) };
});
add('DELETE', '/projects/:id', async ({ p, params }) => {
  if (!canAdmin(p)) throw forbidden();
  const proj = await assertProject(p, num(params.id)).catch(() => { throw notFound('Project'); });
  await db.project.delete({ where: { id: proj.id } });
  return { success: true, message: 'Project deleted.' };
});

// ───────────── integrations ─────────────
add('GET', '/integrations', async ({ p, query }) => {
  const pg = pageParams(query, ['name', 'created_at', 'updated_at', 'source_name']);
  const pid = query.get('project_id');
  const where: any = { AND: [{ companyId: p.companyId }, p.projectIds ? { projectId: { in: p.projectIds } } : {}, pid ? { projectId: num(pid) } : {}, query.get('slug') ? { slug: query.get('slug')! } : {}, query.get('name') ? { name: containsText(query.get('name')!) } : {}] };
  const [items, total] = await Promise.all([db.integration.findMany({ where, include: { project: { select: { name: true } } }, orderBy: orderBy(pg.sortBy, pg.descending, { name: 'name', source_name: 'name', created_at: 'createdAt', updated_at: 'updatedAt' }), skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.integration.count({ where })]);
  return paginated(items.map(sIntegration), total, pg, '/integrations', query);
});
add('GET', '/integrations/catalog', async () => ({ data: INTEGRATIONS.map((i) => ({ slug: i.slug, name: i.name, category: i.category, connector: i.connector, live: i.connector !== 'demo', auth: i.auth, in_reportei: i.inReportei, source_id_label: i.sourceIdLabel ?? 'Account ID', fields: i.fields ?? [] })) }));
add('GET', '/integrations/:id', async ({ p, params }) => {
  const i = await db.integration.findFirst({ where: { id: num(params.id), companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: { select: { name: true } } } });
  if (!i) throw notFound('Integration');
  return { data: sIntegration(i) };
});
add('POST', '/integrations', async ({ p, body }) => {
  need(p);
  const b = parse(z.object({ project_id: z.number().int(), slug: z.string(), name: z.string().optional(), source_id: z.string().min(1), credentials: z.record(z.any()).optional(), config: z.record(z.any()).optional(), skip_validation: z.boolean().optional() }), body);
  await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
  try {
    const r = await connectIntegration({ companyId: p.companyId, projectId: b.project_id, slug: b.slug, name: b.name, sourceId: b.source_id, credentials: b.credentials, config: b.config, skipValidation: b.skip_validation });
    return status(201, { data: sIntegration(r) });
  } catch (e) {
    throw new ApiError(422, (e as Error).message, { source_id: [(e as Error).message] });
  }
});
add('DELETE', '/integrations/:id', async ({ p, params }) => {
  need(p);
  const i = await db.integration.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!i) throw notFound('Integration');
  await db.integration.delete({ where: { id: i.id } });
  return { success: true, message: 'Integration removed.' };
});
add('PUT', '/integrations/:id', async ({ p, params, body }) => {
  need(p);
  const i = await db.integration.findFirst({ where: { id: num(params.id), companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) } });
  if (!i) throw notFound('Integration');
  const b = parse(z.object({ name: z.string().optional(), status: z.enum(['active', 'inactive']).optional(), campaigns: scopeSchema.optional() }), body);
  const { campaigns, ...rest } = b;
  const r = await db.integration.update({ where: { id: i.id }, data: { ...rest, ...(campaigns ? { config: { ...((i.config as Record<string, unknown>) ?? {}), campaigns } as any } : {}) } });
  return { data: sIntegration(r) };
});
// the campaigns a scope can pick from (spec v3 §2.1); [] for accounts without campaigns
add('GET', '/integrations/:id/campaigns', async ({ p, params }) => {
  const i = await db.integration.findFirst({ where: { id: num(params.id), companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!i) throw notFound('Integration');
  return { data: await listCampaignsFor(i, i.project) };
});

// ───────────── metrics ─────────────
add('GET', '/metrics', async ({ p, query }) => {
  const slug = query.get('integration_slug');
  if (slug === 'custom') {
    const cms = await db.customMetric.findMany({ where: { companyId: p.companyId }, orderBy: { createdAt: 'desc' } });
    const data = cms.map((m) => ({ id: `cm_${m.id}`, reference_key: `custom:cm_${m.id}`, component: 'number_v1', metrics: [], calculated: true, references: { title: m.name, description: m.formula, diff_type: m.diff, formatting_function: m.format, can_be_aggregated: false, tags: {}, group: 'Blended metrics' } }));
    return paginated(data, data.length, { page: 1, perPage: 100, descending: false }, '/metrics', query);
  }
  if (!slug || !getIntegrationDef(slug)) throw invalid({ integration_slug: ['A valid integration_slug is required.'] });
  let config: any = null;
  const iid = query.get('integration_id');
  if (iid) {
    const i = await db.integration.findFirst({ where: { id: num(iid), companyId: p.companyId } });
    config = i?.config ?? null;
  }
  const pg = pageParams(query, [], 'x');
  const all = getCatalog(slug, config).map(toDefinition);
  const search = (query.get('search') ?? '').toLowerCase();
  const filtered = search ? all.filter((w) => `${w.reference_key} ${w.references.title}`.toLowerCase().split(' ').some((_, __, a) => search.split(/\s+/).every((t) => a.join(' ').includes(t)))) : all;
  const per = Math.min(100, Number(query.get('per_page')) || 100);
  const page = Math.max(1, Number(query.get('page')) || 1);
  const slice = filtered.slice((page - 1) * per, page * per);
  void pg;
  return paginated(slice, filtered.length, { page, perPage: per, descending: false }, '/metrics', query);
});
add('POST', '/metrics/get-data', async ({ p, body }) => {
  const b = parse(z.object({ start: z.string().refine(isDate, 'YYYY-MM-DD'), end: z.string().refine(isDate, 'YYYY-MM-DD'), integration_id: z.number().int(), metrics: z.array(z.object({ id: z.string().optional(), reference_key: z.string() }).passthrough()).min(1), comparison_start: z.string().refine(isDate).optional(), comparison_end: z.string().refine(isDate).optional() }), body);
  if (b.start > b.end) throw invalid({ start: ['start must be on or before end'] });
  const row = await db.integration.findFirst({ where: { id: b.integration_id, companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!row) throw notFound('Integration');
  const ctx = toCtx(row, row.project);
  const session = new FetchSession();
  const comparison = b.comparison_start && b.comparison_end ? { start: b.comparison_start, end: b.comparison_end } : null;
  const out: Record<string, unknown> = {};
  for (const m of b.metrics) {
    const w = findWidget(row.slug, m.reference_key, ctx.config as any);
    const id = m.id ?? m.reference_key;
    if (!w) {
      out[id] = { error: { type: 'invalid_metrics_combination', message: `Unknown metric ${m.reference_key} for ${row.slug}` } };
      continue;
    }
    const v = await resolveWidget({ integration: ctx, widget: w, range: { start: b.start, end: b.end }, comparison, session });
    if (v.type === 'error') out[id] = { error: { type: v.code, message: v.message } };
    else if (v.type === 'number') out[id] = { values: v.value, ...(v.comparison ? { comparison: { values: v.comparison.value, difference: v.comparison.change_pct, absoluteDifference: v.comparison.absolute } } : {}) };
    else if (v.type === 'chart') out[id] = { values: { labels: v.labels, series: v.series, series_labels: v.seriesLabels }, ...(v.comparison ? { comparison: { values: { series: v.comparison.series } } } : {}) };
    else if (v.type === 'table') out[id] = { values: { columns: v.columns, rows: v.rows, total_rows: v.total_rows } };
    else if (v.type === 'funnel') out[id] = { values: { steps: v.steps } };
    else if (v.type === 'text') out[id] = { values: { html: v.html } };
    else if (v.type === 'tile') out[id] = { values: { kind: v.kind, value: v.value ?? null, target: v.target ?? null, items: v.items ?? [] } };
    else if (v.type === 'container') out[id] = { values: { metrics: v.metrics.map((m) => m.key), rows: v.rows.map((r) => ({ id: r.id, name: r.name, status: r.status, ...Object.fromEntries(v.metrics.map((m, i) => [m.key, r.values[i]])) })), truncated: v.truncated } };
    else out[id] = { values: { url: v.url, alt: v.alt, caption: v.caption ?? '' } };
  }
  return out;
});

// ───────────── templates ─────────────
add('GET', '/templates', async ({ p, query }) => {
  const pg = pageParams(query, ['title', 'created_at', 'updated_at']);
  const where: any = { OR: [{ companyId: null }, { companyId: p.companyId }], ...(query.get('kind') ? { kind: query.get('kind')! } : {}) };
  const [items, total] = await Promise.all([db.template.findMany({ where, orderBy: [{ isDefault: 'desc' }, orderBy(pg.sortBy, pg.descending, { title: 'title', created_at: 'createdAt', updated_at: 'updatedAt' })], skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.template.count({ where })]);
  return paginated(items.map((t) => sTemplate(t)), total, pg, '/templates', query);
});
add('GET', '/templates/:id', async ({ p, params }) => {
  const t = await db.template.findFirst({ where: { id: num(params.id), OR: [{ companyId: null }, { companyId: p.companyId }] } });
  if (!t) throw notFound('Template');
  return { data: sTemplate(t, true) };
});
const sectionsSchema = z.array(z.object({ id: z.string().optional(), title: z.string(), widgets: z.array(z.object({ slug: z.string(), key: z.string() })) })).min(1);
add('POST', '/templates', async ({ p, body }) => {
  need(p);
  const b = parse(z.object({ title: z.string().min(1), description: z.string().default(''), kind: z.enum(['report', 'dashboard']).default('report'), sections: sectionsSchema }), body);
  const sections = b.sections.map((s, i) => ({ id: s.id ?? `s${i + 1}`, ...s }));
  const t = await db.template.create({ data: { companyId: p.companyId, title: b.title, description: b.description, kind: b.kind, sections: sections as any } });
  return status(201, { data: sTemplate(t, true) });
});
add('PUT', '/templates/:id', async ({ p, params, body }) => {
  need(p);
  const t = await db.template.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!t) throw notFound('Template');
  const b = parse(z.object({ title: z.string().min(1).optional(), description: z.string().optional(), sections: sectionsSchema.optional() }), body);
  const r = await db.template.update({ where: { id: t.id }, data: { title: b.title, description: b.description, ...(b.sections ? { sections: b.sections.map((s, i) => ({ id: s.id ?? `s${i + 1}`, ...s })) as any } : {}) } });
  return { data: sTemplate(r, true) };
});
add('POST', '/templates/:id/duplicate', async ({ p, params }) => {
  need(p);
  const t = await db.template.findFirst({ where: { id: num(params.id), OR: [{ companyId: null }, { companyId: p.companyId }] } });
  if (!t) throw notFound('Template');
  const r = await db.template.create({ data: { companyId: p.companyId, title: `${t.title} (copy)`, description: t.description, kind: t.kind, sections: t.sections as any } });
  return status(201, { data: sTemplate(r, true) });
});
add('DELETE', '/templates/:id', async ({ p, params }) => {
  need(p);
  const t = await db.template.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!t) throw notFound('Template');
  await db.template.delete({ where: { id: t.id } });
  return { success: true, message: 'Template deleted.' };
});

// ───────────── reports & dashboards ─────────────
for (const kind of ['report', 'dashboard'] as const) {
  const path = kind === 'report' ? '/reports' : '/dashboards';
  add('GET', path, async ({ p, query }) => {
    const pg = pageParams(query, ['title', 'created_at', 'updated_at']);
    const pid = query.get('project_id');
    const where: any = {
      AND: [
        { companyId: p.companyId, kind },
        p.projectIds ? { projectId: { in: p.projectIds } } : {},
        pid ? { projectId: num(pid) } : {},
        query.get('created_at') ? { createdAt: { gte: new Date(query.get('created_at')!) } } : {},
        query.get('updated_at') ? { updatedAt: { gte: new Date(query.get('updated_at')!) } } : {},
        query.get('search') ? { OR: [{ title: containsText(query.get('search')!) }, { subtitle: containsText(query.get('search')!) }] } : {},
      ],
    };
    const [items, total] = await Promise.all([db.report.findMany({ where, orderBy: orderBy(pg.sortBy, pg.descending, { title: 'title', created_at: 'createdAt', updated_at: 'updatedAt' }), skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.report.count({ where })]);
    return paginated(items.map(sReport), total, pg, path, query);
  });
  add('GET', `${path}/:id`, async ({ p, params }) => {
    const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, kind, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) } });
    if (!r) throw notFound(kind === 'report' ? 'Report' : 'Dashboard');
    return { data: sReport(r) };
  });
  add('GET', `${path}/:id/data`, async ({ p, params }) => {
    const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, kind, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
    if (!r) throw notFound(kind === 'report' ? 'Report' : 'Dashboard');
    const { data, layout } = await reportView(r);
    return { data: { report: sReport(r), analysis: r.analysis ?? [], layout, ...data } };
  });
  add('POST', path, async ({ p, body }) => {
    need(p);
    const b = parse(z.object({ title: z.string().min(1), subtitle: z.string().default('Performance analysis'), start: z.string().refine(isDate, 'YYYY-MM-DD').optional(), end: z.string().refine(isDate, 'YYYY-MM-DD').optional(), template_id: z.number().int(), campaigns: z.record(z.string(), scopeSchema).optional(), integration_ids: z.array(z.number().int()).min(1), project_id: z.number().int(), comparison_start: z.string().refine(isDate).optional(), comparison_end: z.string().refine(isDate).optional(), preset: z.string().optional(), client_presets: z.array(z.string()).max(8).optional(), with_ai: z.boolean().optional() }), body);
    await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
    if (kind === 'report' && (!b.start || !b.end)) throw invalid({ start: ['start and end are required for reports'] });
    // creation limit: 30 per 24h, or 2 per active project — whichever is greater
    const since = new Date(Date.now() - 86400000);
    const [made, projects] = await Promise.all([db.report.count({ where: { companyId: p.companyId, kind, createdAt: { gte: since } } }), db.project.count({ where: { companyId: p.companyId } })]);
    if (p.kind === 'token' && made >= Math.max(30, projects * 2)) throw new ApiError(429, `Daily limit for creating ${kind}s reached.`);
    try {
      const r = await createReport({ companyId: p.companyId, projectId: b.project_id, kind, title: b.title, subtitle: b.subtitle, start: b.start, end: b.end, comparisonStart: b.comparison_start, comparisonEnd: b.comparison_end, templateId: b.template_id, campaigns: b.campaigns, integrationIds: b.integration_ids, preset: b.preset as any, clientPresets: b.client_presets, createdBy: p.userId, withAi: b.with_ai });
      return status(201, { data: sReport(r) });
    } catch (e) {
      throw new ApiError(422, (e as Error).message);
    }
  });
  add('DELETE', `${path}/:id`, async ({ p, params }) => {
    need(p);
    const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, kind } });
    if (!r) throw notFound();
    await db.report.delete({ where: { id: r.id } });
    return { success: true, message: 'Deleted.' };
  });
  // [ext] duplicate / convert (spec v3 §3.6)
  add('POST', `${path}/:id/duplicate`, async ({ p, params }) => {
    need(p);
    const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, kind, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) } });
    if (!r) throw notFound(kind === 'report' ? 'Report' : 'Dashboard');
    return status(201, { data: sReport(await duplicateReport(r.id, p.companyId)) });
  });
  add('POST', `${path}/:id/convert`, async ({ p, params, body }) => {
    need(p);
    const b = parse(z.object({ kind: z.enum(['report', 'dashboard']) }), body);
    const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, kind, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) } });
    if (!r) throw notFound(kind === 'report' ? 'Report' : 'Dashboard');
    return { data: sReport(await convertReport(r.id, p.companyId, b.kind)) };
  });
}
add('POST', '/reports/:id/analysis', async ({ p, params, body }) => {
  need(p);
  const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId }, include: { project: true } });
  if (!r) throw notFound('Report');
  const b = parse(z.object({ title: z.string().default('Analysis'), html: z.string().optional(), generate: z.boolean().optional(), language: z.string().optional(), notes: z.string().optional(), block_id: z.string().max(64).optional(), tone: z.enum(TONES).optional() }), body);
  let html = b.html ?? '';
  let author: 'human' | 'ai' = 'human';
  let title = b.title;
  if (b.generate) {
    const { data } = await reportView(r);
    if (b.block_id) {
      // per-block analysis with a tone (spec v3 §4.4)
      const sec = data.sections.find((s) => s.id === b.block_id);
      if (!sec) throw invalid({ block_id: ['Unknown block'] });
      const a = await analyseBlock(data, b.block_id, { tone: b.tone ?? 'general', language: b.language, notes: b.notes, projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
      html = a.html;
      author = 'ai';
      if (title === 'Analysis') title = `${sec.title} — ${TONE_LABEL[b.tone ?? 'general']}`;
    } else {
      const a = await analyse(data, r.project.name, { language: b.language, notes: b.notes, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
      html = a.html;
      author = 'ai';
    }
  }
  const card = { id: randomToken(6), title, html, author, updatedAt: new Date().toISOString(), ...(b.block_id ? { blockId: b.block_id, tone: b.tone ?? 'general' } : {}) };
  const prior = (((r.analysis as any[]) ?? []) as { author?: string; blockId?: string; tone?: string }[]);
  const kept = card.blockId ? prior.filter((c) => !(c.author === 'ai' && c.blockId === card.blockId && (c.tone ?? 'general') === card.tone)) : prior;
  const cards = [...kept, card];
  await db.report.update({ where: { id: r.id }, data: { analysis: cards as any } });
  return status(201, { data: cards, card: { ...card, block_id: card.blockId ?? null, tone: card.tone ?? null } });
});
add('POST', '/reports/:id/ask', async ({ p, params, body }) => {
  const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!r) throw notFound('Report');
  const b = parse(z.object({ question: z.string().min(2) }), body);
  const { data } = await reportView(r);
  return ask(data, r.project.name, b.question);
});

// ───────────── webhooks ─────────────
add('GET', '/webhooks/events', async () => ({ data: WEBHOOK_EVENTS, sources: WEBHOOK_SOURCES }));
add('GET', '/webhooks', async ({ p, query }) => {
  const pg = pageParams(query, ['url', 'event_type', 'created_at', 'updated_at']);
  const where: any = { companyId: p.companyId, ...(query.get('project_id') ? { projectId: num(query.get('project_id')!) } : {}), ...(query.get('event_type') ? { eventType: query.get('event_type')! } : {}), ...(query.get('source') ? { source: query.get('source')! } : {}), ...(query.get('status') ? { status: query.get('status')! } : {}) };
  const [items, total] = await Promise.all([db.webhook.findMany({ where, orderBy: orderBy(pg.sortBy, pg.descending, { url: 'url', event_type: 'eventType', created_at: 'createdAt', updated_at: 'updatedAt' }), skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.webhook.count({ where })]);
  return paginated(items.map(sWebhook), total, pg, '/webhooks', query);
});
add('GET', '/webhooks/:id', async ({ p, params }) => {
  const w = await db.webhook.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!w) throw notFound('Webhook');
  return { data: sWebhook(w) };
});
const hookSchema = z.object({ url: z.string().url(), event_type: z.enum(WEBHOOK_EVENTS), project_id: z.number().int().nullable().optional(), source: z.enum(WEBHOOK_SOURCES).optional(), status: z.enum(['active', 'inactive']).optional() });
add('POST', '/webhooks', async ({ p, body }) => {
  need(p);
  const b = parse(hookSchema, body);
  if (b.project_id) await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
  const w = await db.webhook.create({ data: { companyId: p.companyId, url: b.url, eventType: b.event_type, projectId: b.project_id ?? null, source: b.source ?? 'custom', status: b.status ?? 'active', secret: newWebhookSecret() } });
  return status(201, { data: { ...sWebhook(w), secret: w.secret } });
});
add('PUT', '/webhooks/:id', async ({ p, params, body }) => {
  need(p);
  const w = await db.webhook.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!w) throw notFound('Webhook');
  const b = parse(hookSchema.partial(), body);
  const r = await db.webhook.update({ where: { id: w.id }, data: { url: b.url, eventType: b.event_type, projectId: b.project_id, source: b.source, status: b.status } });
  return { data: sWebhook(r) };
});
add('DELETE', '/webhooks/:id', async ({ p, params }) => {
  need(p);
  const w = await db.webhook.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!w) throw notFound('Webhook');
  await db.webhook.delete({ where: { id: w.id } });
  return { success: true, message: 'Webhook deleted.' };
});
add('GET', '/webhooks/:id/deliveries', async ({ p, params }) => {
  const w = await db.webhook.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!w) throw notFound('Webhook');
  const d = await db.webhookDelivery.findMany({ where: { webhookId: w.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return { data: d.map((x) => ({ id: x.id, event: x.event, status_code: x.statusCode, error: x.error, created_at: iso(x.createdAt) })) };
});

// ───────────── timeline ─────────────
add('GET', '/timeline-events', async ({ p, query }) => {
  const pg = pageParams(query, ['date', 'title', 'created_at', 'updated_at'], 'date');
  const where: any = { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) }, ...(query.get('project_id') ? { projectId: num(query.get('project_id')!) } : {}), ...(query.get('report_id') ? { reportId: num(query.get('report_id')!) } : {}), ...(query.get('date') ? { date: query.get('date')! } : {}) };
  const [items, total] = await Promise.all([db.timelineEvent.findMany({ where, orderBy: orderBy(pg.sortBy, pg.descending, { date: 'date', title: 'title', created_at: 'createdAt', updated_at: 'updatedAt' }), skip: (pg.page - 1) * pg.perPage, take: pg.perPage }), db.timelineEvent.count({ where })]);
  return paginated(items.map(sTimeline), total, pg, '/timeline-events', query);
});
add('GET', '/timeline-events/:id', async ({ p, params }) => {
  const t = await db.timelineEvent.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!t) throw notFound('Timeline event');
  return { data: sTimeline(t) };
});
const tlSchema = z.object({ project_id: z.number().int(), title: z.string().min(1), content: z.string().default(''), report_id: z.number().int().nullable().optional(), date: z.string().refine(isDate).optional(), image: z.string().max(500).refine(isMediaOrHttps, 'image must be one of your uploads (/api/media/…) or an https URL').nullable().optional() });
add('POST', '/timeline-events', async ({ p, body }) => {
  need(p);
  const b = parse(tlSchema, body);
  await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
  const t = await db.timelineEvent.create({ data: { projectId: b.project_id, title: b.title, content: b.content, reportId: b.report_id ?? null, date: b.date ?? new Date().toISOString().slice(0, 10), image: b.image ?? null } });
  await emitEvent(p.companyId, b.project_id, 'timeline_milestone_added', { id: t.id, title: t.title, date: t.date });
  return status(201, { data: sTimeline(t) });
});
add('PUT', '/timeline-events/:id', async ({ p, params, body }) => {
  need(p);
  const t = await db.timelineEvent.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!t) throw notFound('Timeline event');
  const b = parse(tlSchema.partial(), body);
  const r = await db.timelineEvent.update({ where: { id: t.id }, data: { title: b.title, content: b.content, reportId: b.report_id, date: b.date, image: b.image } });
  return { data: sTimeline(r) };
});
add('DELETE', '/timeline-events/:id', async ({ p, params }) => {
  need(p);
  const t = await db.timelineEvent.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!t) throw notFound('Timeline event');
  await db.timelineEvent.delete({ where: { id: t.id } });
  return { success: true, message: 'Timeline event deleted.' };
});

// ───────────── [ext] automations ─────────────
/** The project filter every per-project route applies: the principal's company, narrowed to its projects when restricted (review F-I4). */
const projectOf = (p: Principal) => ({ companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) });
const autoSchema = z.object({
  project_id: z.number().int(),
  title: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).default('monthly'),
  weekdays_only: z.boolean().default(false),
  monthly_rule: z.string().regex(/^(day|(first|last):[0-6])$/, 'day, first:<0-6> or last:<0-6>').default('day'),
  hold_on_failure: z.boolean().default(true),
  attach_pdf: z.boolean().default(false),
  day_of_week: z.number().int().min(0).max(6).default(1),
  day_of_month: z.number().int().min(1).max(28).default(1),
  hour: z.number().int().min(0).max(23).default(8),
  template_id: z.number().int().nullable().optional(),
  integration_ids: z.array(z.number().int()).min(1),
  comparison: z.boolean().default(true),
  channels: z.array(z.enum(['email', 'in-app', 'whatsapp', 'slack', 'teams', 'discord', 'telegram'])).min(1),
  emails: z.array(z.string().email()).optional(),
  whatsapp_url: z.string().url().optional(),
  whatsapp_type: z.string().optional(),
  slack_url: z.string().url().optional(),
  teams_url: z.string().url().optional(),
  discord_url: z.string().url().optional(),
  telegram_bot_token: z.string().optional(),
  telegram_chat_id: z.string().optional(),
  attach_analysis: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
add('GET', '/automations', async ({ p, query }) => {
  const pid = query.get('project_id');
  const items = await db.automation.findMany({ where: { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) }, ...(pid ? { projectId: num(pid) } : {}) }, orderBy: { createdAt: 'desc' } });
  return { project_id: pid ? num(pid) : null, automations: items.map(sAutomation), total: items.length };
});
add('GET', '/automations/:id', async ({ p, params }) => {
  const a = await db.automation.findFirst({ where: { id: num(params.id), project: projectOf(p) }, include: { runs: { orderBy: { startedAt: 'desc' }, take: 10 } } });
  if (!a) throw notFound('Automation');
  return { data: { ...sAutomation(a), runs: a.runs.map((r) => ({ id: r.id, started_at: iso(r.startedAt), status: r.status, report_id: r.reportId, detail: r.detail })) } };
});
add('POST', '/automations', async ({ p, body }) => {
  need(p);
  const b = parse(autoSchema, body);
  const proj = await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
  if (b.channels.includes('email') && !b.emails?.length) throw invalid({ emails: ['At least one recipient is required for the email channel.'] });
  const a = await db.automation.create({ data: { projectId: b.project_id, title: b.title, enabled: b.enabled, frequency: b.frequency, dayOfWeek: b.day_of_week, dayOfMonth: b.day_of_month, hour: b.hour, weekdaysOnly: b.weekdays_only, monthlyRule: b.monthly_rule, holdOnFailure: b.hold_on_failure, attachPdf: b.attach_pdf, templateId: b.template_id ?? null, integrationIds: b.integration_ids, comparison: b.comparison, channels: b.channels, emails: b.emails ?? [], whatsappUrl: b.whatsapp_url, whatsappType: b.whatsapp_type, slackUrl: b.slack_url, teamsUrl: b.teams_url, discordUrl: b.discord_url, telegramBotToken: b.telegram_bot_token, telegramChatId: b.telegram_chat_id, attachAnalysis: b.attach_analysis } });
  return status(201, { data: sAutomation(await scheduleNext(a, proj.timezone)) });
});
add('PUT', '/automations/:id', async ({ p, params, body }) => {
  need(p);
  const a = await db.automation.findFirst({ where: { id: num(params.id), project: projectOf(p) }, include: { project: true } });
  if (!a) throw notFound('Automation');
  const b = parse(autoSchema.partial(), body);
  const r = await db.automation.update({ where: { id: a.id }, data: { title: b.title, enabled: b.enabled, frequency: b.frequency, dayOfWeek: b.day_of_week, dayOfMonth: b.day_of_month, hour: b.hour, weekdaysOnly: b.weekdays_only, monthlyRule: b.monthly_rule, holdOnFailure: b.hold_on_failure, attachPdf: b.attach_pdf, templateId: b.template_id, integrationIds: b.integration_ids, comparison: b.comparison, channels: b.channels, emails: b.emails, whatsappUrl: b.whatsapp_url, whatsappType: b.whatsapp_type, slackUrl: b.slack_url, teamsUrl: b.teams_url, discordUrl: b.discord_url, telegramBotToken: b.telegram_bot_token, telegramChatId: b.telegram_chat_id, attachAnalysis: b.attach_analysis } });
  return { data: sAutomation(await scheduleNext(r, a.project.timezone)) };
});
add('POST', '/automations/:id/toggle', async ({ p, params }) => {
  need(p);
  const a = await db.automation.findFirst({ where: { id: num(params.id), project: projectOf(p) }, include: { project: true } });
  if (!a) throw notFound('Automation');
  const r = await db.automation.update({ where: { id: a.id }, data: { enabled: !a.enabled } });
  return { data: sAutomation(await scheduleNext(r, a.project.timezone)) };
});
// "Send now" for a held run (spec v3 §3.2)
add('POST', '/automations/:id/runs/:runId/send', async ({ p, params }) => {
  need(p);
  const run = await db.automationRun.findFirst({ where: { id: num(params.runId), automationId: num(params.id), automation: { project: projectOf(p) } } });
  if (!run) throw notFound('Run');
  if (run.status !== 'held') throw invalid({ run: ['This run is not held.'] });
  const { detail } = await deliverRun(run.id);
  return { data: { id: run.id, status: 'ok' }, delivery: detail };
});
add('POST', '/automations/:id/run', async ({ p, params }) => {
  need(p);
  const a = await db.automation.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!a) throw notFound('Automation');
  const { report, detail } = await runAutomation(a.id, { manual: true });
  return status(201, { data: sReport(report), delivery: detail });
});
add('DELETE', '/automations/:id', async ({ p, params }) => {
  need(p);
  const a = await db.automation.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!a) throw notFound('Automation');
  await db.automation.delete({ where: { id: a.id } });
  return { success: true, message: 'Automation deleted.' };
});

// ───────────── [ext] goals ("Controle") ─────────────
const sGoal = (g: Goal) => ({ id: g.id, project_id: g.projectId, integration_id: g.integrationId, reference_key: g.referenceKey, title: g.title, frequency: g.frequency, target: g.target, direction: g.direction, alert: g.alert, alert_emails: (g.alertEmails as string[] | null) ?? [] });
const goalSchema = z.object({ project_id: z.number().int(), integration_id: z.number().int(), reference_key: z.string(), alert_emails: z.array(z.string().email()).max(10).optional(), title: z.string().min(1), frequency: z.enum(['weekly', 'monthly']).default('monthly'), target: z.number().positive(), direction: z.enum(['higher_better', 'lower_better']).default('higher_better'), alert: z.boolean().default(true) });
add('GET', '/goals', async ({ p, query }) => {
  const pid = query.get('project_id');
  const goals = await db.goal.findMany({ where: { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) }, ...(pid ? { projectId: num(pid) } : {}) }, include: { integration: { include: { project: true } } } });
  const progress = await Promise.all(goals.map((g) => goalProgress(g as any).catch(() => null)));
  return { project_id: pid ? num(pid) : null, goals: goals.map((g, i) => ({ ...sGoal(g), situation: progress[i]?.situation ?? 'no_data', current: progress[i]?.current ?? null, progress_pct: progress[i]?.progressPct ?? null, estimated_end: progress[i]?.estimatedEnd ?? null })) };
});
add('GET', '/goals/:id/progress', async ({ p, params }) => {
  const g = await loadGoal(num(params.id));
  if (!g || g.integration.project.companyId !== p.companyId) throw notFound('Goal');
  return { data: await goalProgress(g) };
});
add('POST', '/goals', async ({ p, body }) => {
  need(p);
  const b = parse(goalSchema, body);
  await assertProject(p, b.project_id).catch(() => { throw notFound('Project'); });
  const integ = await db.integration.findFirst({ where: { id: b.integration_id, projectId: b.project_id } });
  if (!integ) throw invalid({ integration_id: ['Integration does not belong to this project'] });
  const key = b.reference_key.includes(':') ? b.reference_key.split(':').slice(1).join(':') : b.reference_key;
  if (!findWidget(integ.slug, key, integ.config as any)) throw invalid({ reference_key: [`Unknown metric for ${integ.slug}`] });
  const g = await db.goal.create({ data: { alertEmails: b.alert_emails ?? [], projectId: b.project_id, integrationId: b.integration_id, referenceKey: b.reference_key, title: b.title, frequency: b.frequency, target: b.target, direction: b.direction, alert: b.alert } });
  return status(201, { data: sGoal(g) });
});
add('PUT', '/goals/:id', async ({ p, params, body }) => {
  need(p);
  const g = await db.goal.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!g) throw notFound('Goal');
  const b = parse(z.object({ title: z.string().optional(), target: z.number().positive().optional(), alert: z.boolean().optional(), direction: z.enum(['higher_better', 'lower_better']).optional(), frequency: z.enum(['weekly', 'monthly']).optional(), alert_emails: z.array(z.string().email()).max(10).optional() }), body);
  const { alert_emails, ...rest } = b;
  return { data: sGoal(await db.goal.update({ where: { id: g.id }, data: { ...rest, ...(alert_emails !== undefined ? { alertEmails: alert_emails } : {}) } })) };
});
add('DELETE', '/goals/:id', async ({ p, params }) => {
  need(p);
  const g = await db.goal.findFirst({ where: { id: num(params.id), project: projectOf(p) } });
  if (!g) throw notFound('Goal');
  await db.goal.delete({ where: { id: g.id } });
  return { success: true, message: 'Goal deleted.' };
});

// ───────────── [ext] custom / blended metrics ─────────────
const cmSchema = z.object({ name: z.string().min(1), formula: z.string().min(1), format: z.enum(['number', 'currency', 'percent', 'decimal']).default('number'), diff_type: z.enum(['positive_good', 'positive_bad', 'neutral']).default('positive_good'), project_id: z.number().int().nullable().optional() });
add('GET', '/custom-metrics', async ({ p }) => ({ data: (await db.customMetric.findMany({ where: { companyId: p.companyId }, orderBy: { createdAt: 'desc' } })).map(sCustomMetric) }));
add('POST', '/custom-metrics', async ({ p, body }) => {
  need(p);
  const b = parse(cmSchema, body);
  const { formulaRefs } = await import('@/lib/engine/formula');
  try {
    formulaRefs(b.formula);
  } catch (e) {
    throw invalid({ formula: [(e as Error).message] });
  }
  const m = await db.customMetric.create({ data: { companyId: p.companyId, name: b.name, formula: b.formula, format: b.format, diff: b.diff_type, projectId: b.project_id ?? null } });
  return status(201, { data: sCustomMetric(m) });
});
add('DELETE', '/custom-metrics/:id', async ({ p, params }) => {
  need(p);
  const m = await db.customMetric.findFirst({ where: { id: num(params.id), companyId: p.companyId } });
  if (!m) throw notFound('Custom metric');
  await db.customMetric.delete({ where: { id: m.id } });
  return { success: true, message: 'Deleted.' };
});

// ───────────── [ext] push API (ingest) ─────────────
add('POST', '/ingest/:integration_id', async ({ p, params, body }) => {
  need(p);
  const i = await db.integration.findFirst({ where: { id: num(params.integration_id), companyId: p.companyId } });
  if (!i) throw notFound('Integration');
  if (getIntegrationDef(i.slug)?.connector !== 'ingest') throw invalid({ integration_id: ['This integration does not accept pushed data. Create a "Push API" integration first.'] });
  const b = parse(z.object({ rows: z.array(z.record(z.any())).min(1).max(5000), date_field: z.string().default('date') }), body);
  const today = new Date().toISOString().slice(0, 10);
  const data = b.rows.map((r) => {
    const { [b.date_field]: d, ...rest } = r;
    const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : today;
    return { integrationId: i.id, date, data: rest as any };
  });
  await db.ingestRow.createMany({ data });
  invalidateRows(i.id);
  // re-detect columns so new fields appear in the widget catalog
  const { refreshColumns } = await import('@/lib/services/integrations');
  const cfg = await refreshColumns(i.id);
  return status(201, { success: true, inserted: data.length, columns: (cfg as any).columns?.map((c: any) => ({ name: c.name, kind: c.kind })) ?? [] });
});

// ───────────── [ext] overview ─────────────
add('GET', '/overview', async ({ p, query }) => {
  const { companyOverview } = await import('@/lib/services/overview');
  const days = Number(query.get('days')) || 30;
  return { data: await companyOverview(p, days) };
});

// ───────────── [ext] export ─────────────
add('GET', '/reports/:id/export.csv', async ({ p, params }) => {
  const r = await db.report.findFirst({ where: { id: num(params.id), companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!r) throw notFound('Report');
  const { data } = await reportView(r);
  const { reportToCsv } = await import('@/lib/services/export');
  const { localeForPublic } = await import('@/lib/i18n');
  return { __csv: reportToCsv(data, localeForPublic(r.project)), filename: `${r.title.replace(/[^\w-]+/g, '_')}.csv` };
});

void connectorFor;

export const listRoutes = () => routes.map((r) => ({ method: r.method, path: r.pattern, ext: !REPORTEI_PATHS.has(`${r.method} ${r.pattern}`) }));

/** Endpoints that exist in Reportei's public API v2 (docs/EVIDENCE.md §4). Everything else is an extension. */
const REPORTEI_PATHS = new Set([
  'GET /companies/settings',
  'GET /projects',
  'GET /projects/:id',
  'GET /integrations',
  'GET /integrations/:id',
  'GET /metrics',
  'POST /metrics/get-data',
  'GET /templates',
  'GET /templates/:id',
  'GET /reports',
  'GET /reports/:id',
  'POST /reports',
  'GET /dashboards',
  'GET /dashboards/:id',
  'POST /dashboards',
  'GET /webhooks',
  'GET /webhooks/events',
  'GET /webhooks/:id',
  'POST /webhooks',
  'PUT /webhooks/:id',
  'DELETE /webhooks/:id',
  'GET /timeline-events',
  'GET /timeline-events/:id',
  'POST /timeline-events',
  'PUT /timeline-events/:id',
  'DELETE /timeline-events/:id',
]);
