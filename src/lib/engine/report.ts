import type { CustomMetric, Integration, Project, Report, Template } from '@prisma/client';
import { findWidget, type CatalogWidget } from '@/lib/catalog/build';
import { getIntegrationDef, isAdsSlug } from '@/lib/catalog/integrations';
import { decryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';
import { evalFormula, formulaRefs } from './formula';
import { FetchSession, planFetches, resolveWidget, type IntegrationCtx } from './resolve';
import type { CampaignScopeInfo, DateRange, ErrorValue, NumberValue, RenderedBlock, RenderedSection, ReportData, SourceStatus, TemplateSection } from './types';
import { applyScope, campaignScopeOf, scopeHash, scopeSchema, type CampaignScope } from './campaigns';
import { presetRange, previousPeriod, type Preset } from '@/lib/util/dates';
import { clientPreset } from '@/lib/services/dashboards';
import { createHash } from 'node:crypto';
import { comparisonFor, indexValues, layoutToSections, storeKey, valueKey } from '@/lib/layout/compose';
import type { ReportLayout } from '@/lib/layout/types';
import { widgetRefs } from '@/lib/layout/refs';
import { resolveContainer } from '@/lib/layout/container';
import { connectorFor } from '@/lib/connectors';

export function toCtx(row: Integration, project: Pick<Project, 'currency'>): IntegrationCtx {
  const config = (row.config as Record<string, any> | null) ?? {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sourceId: row.sourceId,
    config,
    credentials: decryptJson(row.credentials),
    currency: (config.currency as string) || project.currency || 'EUR',
  };
}

export interface GenInput {
  project: Pick<Project, 'id' | 'name' | 'currency' | 'timezone'>;
  integrations: Integration[];
  sections: TemplateSection[];
  range: DateRange;
  comparison?: DateRange | null;
  customMetrics?: CustomMetric[];
  persistStatus?: boolean;
  /** per-report campaign scope per ads account (Report.campaignScopes), chosen in the wizard or the API; wins over the account config */
  campaignScopes?: unknown;
}

/** The stored per-report scopes, each validated (a malformed entry is ignored). */
export function scopesFromJson(j: unknown): Record<string, CampaignScope> | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const out: Record<string, CampaignScope> = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    const r = scopeSchema.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return Object.keys(out).length ? out : undefined;
}

async function pool<T>(tasks: (() => Promise<T>)[], size = 6): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    })
  );
  return out;
}

/** A scope resolved against the account's campaign list (spec v3 §2.2). */
export interface ResolvedScope {
  ids?: string[];
  info?: CampaignScopeInfo;
  empty: boolean;
  error?: string;
}
export async function resolveScope(ctx: IntegrationCtx, scope: CampaignScope | undefined, session: FetchSession): Promise<ResolvedScope> {
  if (!scope || scope.mode === 'all') return { empty: false };
  let list;
  try {
    list = await session.getCampaigns(ctx);
  } catch {
    // the list could not be read: a picked list still applies by id, a name rule cannot be evaluated
    if (scope.mode === 'pick') return { ids: scope.ids, info: { scope, names: [], missing: 0, unresolved: true }, empty: false };
    return { info: { scope, names: [], missing: 0 }, empty: true, error: 'Could not load the campaign list to apply the rule' };
  }
  const kept = applyScope(list, scope);
  const missing = scope.mode === 'pick' ? scope.ids.length - kept.length : 0;
  return { ids: kept.map((c) => c.id), info: { scope, names: kept.map((c) => c.name), missing }, empty: kept.length === 0 };
}
/** Memoised per session: one campaign list and one scope resolution per (account, scope). */
function scopeResolver(session: FetchSession) {
  const memo = new Map<string, Promise<ResolvedScope>>();
  return (c: IntegrationCtx, scope?: CampaignScope): Promise<ResolvedScope> => {
    if (!isAdsSlug(c.slug) || !scope || scope.mode === 'all') return Promise.resolve({ empty: false });
    const k = `${c.id}|${scopeHash(scope)}`;
    let p = memo.get(k);
    if (!p) memo.set(k, (p = resolveScope(c, scope, session)));
    return p;
  };
}
export const noCampaign = (r: ResolvedScope): ErrorValue => ({ type: 'error', code: 'no_campaigns', message: r.error ?? (r.info?.scope.mode === 'pick' ? 'None of the selected campaigns exists any more' : 'No campaign matches the rule') });
/** What the snapshot records per ads account: the scope as resolved, or an explicit "all" so compose never has to guess (review C2). */
const scopeFields = (r: ResolvedScope | undefined, ads: boolean) =>
  r?.info ? { campaigns: r.info.scope, campaignNames: r.info.names, missingCampaigns: r.info.missing, ...(r.info.unresolved ? { campaignsUnresolved: true } : {}) } : ads ? { campaigns: { mode: 'all' as const }, campaignNames: [], missingCampaigns: 0 } : {};
const scopeArgs = (r: ResolvedScope) => (r.ids ? { campaignIds: r.ids } : {});

export async function generateReportData(inp: GenInput): Promise<ReportData> {
  const ctxs = inp.integrations.map((r) => toCtx(r, inp.project));
  const session = new FetchSession();
  const rowById = new Map(inp.integrations.map((r) => [r.id, r]));
  const scopeFor = scopeResolver(session);
  const fromReport = scopesFromJson(inp.campaignScopes);
  const defaultScopeOf = (c: IntegrationCtx) => {
    const row = rowById.get(c.id);
    return fromReport?.[String(c.id)] ?? (row ? campaignScopeOf(row) : undefined);
  };

  // plan batched fetches: one plan per (account, scope), so a scoped section is fetched in as few calls as an unscoped one (review I2)
  for (const c of ctxs) {
    const groups = new Map<string, { ids?: string[]; ws: CatalogWidget[] }>();
    for (const s of inp.sections) {
      const ws: CatalogWidget[] = [];
      for (const ref of s.widgets) if (ref.slug === c.slug) {
        const w = findWidget(c.slug, ref.key, c.config as any);
        if (w) ws.push(w);
      }
      if (!ws.length) continue;
      const sc = await scopeFor(c, s.campaigns ?? defaultScopeOf(c));
      const k = sc.ids ? sc.ids.join(',') : '';
      const g = groups.get(k) ?? { ids: sc.ids, ws: [] };
      g.ws.push(...ws);
      groups.set(k, g);
    }
    for (const g of groups.values()) planFetches(session, c, g.ws, inp.range, inp.comparison, g.ids);
  }

  type Slot = { si: number; bi: number; run: () => Promise<RenderedBlock | null> };
  const sections: RenderedSection[] = inp.sections.map((s) => ({ id: s.id, title: s.title, blocks: [] }));
  const slots: Slot[] = [];
  const stats = new Map<number, { ok: number; err: number; nonZero: number; firstErr?: string }>();
  const bump = (id: number, v: RenderedBlock['widget']['value']) => {
    const s = stats.get(id) ?? { ok: 0, err: 0, nonZero: 0 };
    if (v.type === 'error' && v.code === 'no_campaigns') {
      // a scope that matches nothing is an outcome of the scope, not a failure of the account (review I9)
      s.ok++;
    } else if (v.type === 'error') {
      s.err++;
      s.firstErr ??= v.message;
    } else {
      s.ok++;
      if (v.type === 'number' ? (v.value ?? 0) !== 0 : v.type === 'chart' ? v.series.some((a) => a.some((x) => x)) : v.type === 'table' ? v.rows.length > 0 : v.type === 'funnel' ? v.steps.some((x) => x.value) : true) s.nonZero++;
    }
    stats.set(id, s);
  };

  inp.sections.forEach((s, si) => {
    s.widgets.forEach((ref, wi) => {
      if (ref.slug === 'custom') return; // handled below
      for (const c of ctxs) {
        if (c.slug !== ref.slug) continue;
        const w = findWidget(c.slug, ref.key, c.config as any);
        if (!w) continue;
        const def = getIntegrationDef(c.slug)!;
        slots.push({
          si,
          bi: wi * 1000 + c.id % 1000,
          run: async () => {
            // the section's scope (a layout block) or the account's default; an empty scope means every widget says so
            const sc = await scopeFor(c, s.campaigns ?? defaultScopeOf(c));
            const value = sc.empty ? noCampaign(sc) : await resolveWidget({ integration: c, widget: w, range: inp.range, comparison: inp.comparison, session, ...scopeArgs(sc) });
            bump(c.id, value);
            return {
              integrationId: c.id,
              platform: def.name,
              slug: c.slug,
              account_name: c.name,
              widget: { reference_key: w.reference_key, key: w.key, label: w.title, description: w.description, format: w.format, diff_type: w.diff, currency: c.currency, value },
              ...(sc.info ? { campaignScope: sc.info } : {}),
            };
          },
        });
      }
    });
  });

  const results = await pool(slots.map((s) => s.run), 6);
  const ordered = slots.map((s, i) => ({ s, r: results[i] })).sort((a, b) => a.s.si - b.s.si || a.s.bi - b.s.bi);
  for (const { s, r } of ordered) if (r) sections[s.si].blocks.push(r);

  // blended / custom metrics
  inp.sections.forEach((s, si) => {
    for (const ref of s.widgets) {
      if (ref.slug !== 'custom') continue;
      const cm = inp.customMetrics?.find((m) => `cm_${m.id}` === ref.key);
      if (!cm) continue;
      sections[si].blocks.push({ integrationId: 0, platform: 'Blended', slug: 'custom', account_name: 'All sources', widget: { reference_key: `custom:${ref.key}`, key: ref.key, label: cm.name, description: cm.formula, format: cm.format as any, diff_type: cm.diff as any, currency: inp.project.currency, value: { type: 'error', code: 'no_data_in_period', message: 'pending' } } });
    }
  });
  await resolveCustom(inp, ctxs, sections, session);

  // the account defaults as used in this run, frozen with the snapshot so compose never depends on the live config
  const defaults = new Map<number, ResolvedScope>();
  for (const c of ctxs) if (isAdsSlug(c.slug)) defaults.set(c.id, await scopeFor(c, defaultScopeOf(c)));
  const sources: SourceStatus[] = ctxs.map((c) => {
    const st = stats.get(c.id) ?? { ok: 0, err: 0, nonZero: 0 };
    const def = getIntegrationDef(c.slug)!;
    const status: SourceStatus['data_status'] = st.ok === 0 && st.err > 0 ? 'error' : st.ok > 0 && st.nonZero === 0 ? 'no_data' : 'ok';
    return { integrationId: c.id, source_id: c.sourceId, platform: def.name, slug: c.slug, account_name: c.name, currency: c.currency, data_status: status, ...scopeFields(defaults.get(c.id), isAdsSlug(c.slug)), ...(st.firstErr && status === 'error' ? { error: st.firstErr } : {}) };
  });

  if (inp.persistStatus !== false) {
    await Promise.all(
      sources.map((s) =>
        db.integration.update({ where: { id: s.integrationId }, data: { lastSyncAt: new Date(), lastError: s.data_status === 'error' ? s.error ?? 'error' : null } }).catch(() => null)
      )
    );
  }

  return { range: inp.range, comparison: inp.comparison ?? null, sections: sections.filter((s) => s.blocks.length > 0 || inp.sections.length === 1), sources, generated_at: new Date().toISOString() };
}

async function resolveCustom(inp: GenInput, ctxs: IntegrationCtx[], sections: RenderedSection[], session: FetchSession) {
  for (const sec of sections) {
    for (const b of sec.blocks) {
      if (b.slug !== 'custom') continue;
      const cm = inp.customMetrics?.find((m) => `cm_${m.id}` === b.widget.key);
      if (!cm) continue;
      b.widget.value = await evalCustomMetric(cm, ctxs, inp.range, inp.comparison, session);
    }
  }
}

export async function evalCustomMetric(cm: Pick<CustomMetric, 'formula'>, ctxs: IntegrationCtx[], range: DateRange, comparison: DateRange | null | undefined, session: FetchSession): Promise<NumberValue | { type: 'error'; code: 'invalid_metrics_combination'; message: string }> {
  let refs: string[];
  try {
    refs = formulaRefs(cm.formula);
  } catch (e) {
    return { type: 'error', code: 'invalid_metrics_combination', message: `Formula error: ${(e as Error).message}` };
  }
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const ref of refs) {
    const [prefix, key] = ref.split(':');
    let c = 0;
    let p = 0;
    let found = false;
    for (const ctx of ctxs) {
      const def = getIntegrationDef(ctx.slug);
      if (!def || def.prefix !== prefix) continue;
      const w = findWidget(ctx.slug, key, ctx.config as any);
      if (!w) continue;
      const v = await resolveWidget({ integration: ctx, widget: w, range, comparison, session });
      if (v.type === 'number') {
        found = true;
        c += v.value ?? 0;
        p += v.comparison?.value ?? 0;
      }
    }
    if (!found) return { type: 'error', code: 'invalid_metrics_combination', message: `No connected integration provides ${ref}` };
    cur.set(ref, c);
    prev.set(ref, p);
  }
  const value = evalFormula(cm.formula, (k) => cur.get(k) ?? null);
  const out: NumberValue = { type: 'number', value };
  if (comparison) {
    const pv = evalFormula(cm.formula, (k) => prev.get(k) ?? null);
    out.comparison = { value: pv, change_pct: pv == null || value == null ? null : pv === 0 ? (value === 0 ? 0 : null) : Number((((value - pv) / Math.abs(pv)) * 100).toFixed(2)), absolute: pv == null || value == null ? null : value - pv };
  }
  return out;
}

// ───────────── persistence-level helpers ─────────────
export async function loadTemplateSections(templateId: number | null | undefined): Promise<TemplateSection[]> {
  if (!templateId) return DEFAULT_FALLBACK;
  const t = await db.template.findUnique({ where: { id: templateId } });
  return (t?.sections as unknown as TemplateSection[]) ?? DEFAULT_FALLBACK;
}
const DEFAULT_FALLBACK: TemplateSection[] = [];

type ReportFull = Report & { project: Project };

/** The editor layout stored on a report, or null when it has never been edited. */
export function layoutOf(report: Pick<Report, 'layout'>): ReportLayout | null {
  const l = report.layout as unknown as ReportLayout | null;
  return l && l.version === 1 && Array.isArray(l.blocks) ? l : null;
}

/** Widgets to generate: the edited layout when there is one, otherwise the template. */
export async function sectionsFor(report: Pick<Report, 'layout' | 'templateId'>): Promise<TemplateSection[]> {
  const l = layoutOf(report);
  if (l) return layoutToSections(l, { keepLayout: false });
  return loadTemplateSections(report.templateId);
}

export interface EnsureInput {
  layout: ReportLayout;
  data: ReportData;
  project: Pick<Project, 'id' | 'name' | 'currency' | 'timezone'>;
  integrations: Integration[];
  customMetrics: CustomMetric[];
  range: DateRange;
  comparison?: DateRange | null;
}

/**
 * Resolve the values the layout needs that the generated data does not have yet: widgets added in the editor,
 * custom periods, the metrics a calculated widget refers to. Stored in `data.widgets` keyed by
 * "integrationId:key[@start..end]" so layout edits never re-fetch what is already there.
 */
export async function ensureWidgetValues(inp: EnsureInput): Promise<{ data: ReportData; added: number }> {
  const idx = indexValues(inp.data);
  const widgets: Record<string, RenderedBlock> = { ...(inp.data.widgets ?? {}) };
  const ctxs = inp.integrations.map((r) => toCtx(r, inp.project));
  const session = new FetchSession();
  const needed = new Set<string>();
  const scopeFor = scopeResolver(session);
  // the account default as frozen at generation (data.sources) — never the live config, which compose cannot see (review C2)
  const frozenDefault = (id: number) => inp.data.sources?.find((s) => s.integrationId === id)?.campaigns;
  let added = 0;

  const store = (k: string, b: RenderedBlock) => {
    widgets[k] = b;
    idx.set(k, b);
    added++;
  };
  const need = async (integrationId: number, key: string, period?: DateRange, scope?: CampaignScope) => {
    const k = storeKey(integrationId, key, period, scope);
    needed.add(k);
    if (idx.has(k)) return;
    const c = ctxs.find((x) => x.id === integrationId);
    const def = c && getIntegrationDef(c.slug);
    const base = { integrationId, platform: def?.name ?? 'Unknown', slug: c?.slug ?? 'unknown', account_name: c?.name ?? '' };
    if (!c || !def) return store(k, { ...base, widget: { reference_key: key, key, label: key, format: 'number', diff_type: 'neutral', value: { type: 'error', code: 'invalid_metrics_combination', message: 'This account is not connected to the report.' } } });
    const w = findWidget(c.slug, key, c.config as any);
    if (!w) return store(k, { ...base, widget: { reference_key: `${def.prefix}:${key}`, key, label: key, format: 'number', diff_type: 'neutral', value: { type: 'error', code: 'invalid_metrics_combination', message: `Unknown metric "${key}" for ${def.name}.` } } });
    const sc = await scopeFor(c, scope);
    const value = sc.empty ? noCampaign(sc) : await resolveWidget({ integration: c, widget: w, range: period ?? inp.range, comparison: comparisonFor(period, inp.comparison), session, ...scopeArgs(sc) });
    store(k, { ...base, widget: { reference_key: w.reference_key, key: w.key, label: w.title, description: w.description, format: w.format, diff_type: w.diff, currency: c.currency, value }, ...(sc.info ? { campaignScope: sc.info } : {}) });
  };

  for (const b of inp.layout.blocks) {
    // ads blocks: the block's scope, else the account default frozen at generation
    const blockScope = isAdsSlug(b.slug) ? (b.campaigns ?? frozenDefault(b.integrationId)) : undefined;
    for (const w of b.widgets) {
      if (w.slug === 'manual' || w.slug === 'analysis' || w.slug === 'image') continue;
      if (w.slug === 'container') {
        // campaign table (spec v3 §2.3): one value per (account, metrics, scope)
        const id = w.integrationId || b.integrationId;
        const scope = isAdsSlug(b.slug) ? (b.campaigns ?? frozenDefault(id)) : undefined;
        const k = valueKey({ ...w, integrationId: id }, scope)!;
        needed.add(k);
        if (idx.has(k)) continue;
        const c = ctxs.find((x) => x.id === id);
        const def = c && getIntegrationDef(c.slug);
        const mk = (value: RenderedBlock['widget']['value'], extra: Partial<RenderedBlock> = {}): RenderedBlock => ({ integrationId: id, platform: def?.name ?? 'Unknown', slug: c?.slug ?? 'unknown', account_name: c?.name ?? '', widget: { reference_key: 'container', key: w.key, label: w.custom?.title ?? 'Campaigns', format: 'number', diff_type: 'neutral', value }, ...extra });
        if (!c || !def) {
          store(k, mk({ type: 'error', code: 'invalid_metrics_combination', message: 'This account is not connected to the report.' }));
          continue;
        }
        if (!isAdsSlug(c.slug) || !connectorFor(c).listCampaigns) {
          store(k, mk({ type: 'error', code: 'invalid_metrics_combination', message: 'This account has no campaigns.' }));
          continue;
        }
        const sc = await scopeFor(c, scope);
        const list = await session.getCampaigns(c).catch(() => []);
        const period = w.custom?.period;
        const value = sc.empty ? noCampaign(sc) : await resolveContainer(c, w, period ?? inp.range, comparisonFor(period, inp.comparison), session, list, sc.ids);
        store(k, mk(value, sc.info ? { campaignScope: sc.info } : {}));
        continue;
      }
      if (w.slug === 'custom_chart' || w.slug === 'infographic') {
        // refs to the block's own account follow the block scope (review I8); other accounts stay account-wide
        for (const ref of widgetRefs(w)) await need(ref.integrationId, ref.key, w.custom?.period, ref.integrationId === b.integrationId ? blockScope : undefined);
        continue;
      }
      if (w.slug === 'calculated') {
        let refs: string[] = [];
        try {
          refs = w.custom?.formula ? formulaRefs(w.custom.formula) : [];
        } catch {
          continue;
        }
        for (const ref of refs) {
          const [prefix, ...rest] = ref.split(':');
          const key = rest.join(':');
          if (!key) continue;
          const ids = /^\d+$/.test(prefix) ? [Number(prefix)] : ctxs.filter((c) => getIntegrationDef(c.slug)?.prefix === prefix).map((c) => c.id);
          for (const id of ids) await need(id, key, w.custom?.period, id === b.integrationId ? blockScope : undefined);
        }
        continue;
      }
      const scope = blockScope;
      const k = valueKey(w, scope)!;
      needed.add(k);
      if (idx.has(k)) continue;
      if (w.slug === 'custom') {
        const cm = inp.customMetrics.find((m) => `cm_${m.id}` === w.key);
        const period = w.custom?.period;
        const value = cm ? await evalCustomMetric(cm, ctxs, period ?? inp.range, comparisonFor(period, inp.comparison), session) : ({ type: 'error', code: 'invalid_metrics_combination', message: 'This blended metric no longer exists.' } as const);
        store(k, { integrationId: 0, platform: 'Blended', slug: 'custom', account_name: 'All sources', widget: { reference_key: `custom:${w.key}`, key: w.key, label: cm?.name ?? w.key, description: cm?.formula, format: (cm?.format as any) ?? 'number', diff_type: (cm?.diff as any) ?? 'positive_good', currency: inp.project.currency, value } });
        continue;
      }
      await need(w.integrationId, w.key, w.custom?.period, scope);
    }
  }

  // drop values nothing refers to any more (template-generated values live in `sections` and stay)
  for (const k of Object.keys(widgets)) if (!needed.has(k)) delete widgets[k];
  return { data: { ...inp.data, widgets }, added };
}

async function reportInputs(report: ReportFull) {
  const ids = (report.integrationIds as number[]) ?? [];
  const [integrations, sections, customMetrics] = await Promise.all([
    db.integration.findMany({ where: { id: { in: ids }, projectId: report.projectId } }),
    sectionsFor(report),
    db.customMetric.findMany({ where: { companyId: report.companyId, OR: [{ projectId: null }, { projectId: report.projectId }] } }),
  ]);
  return { integrations, sections, customMetrics, campaignScopes: report.campaignScopes };
}

export async function snapshotReport(report: ReportFull): Promise<ReportData> {
  const { integrations, sections, customMetrics, campaignScopes } = await reportInputs(report);
  const comparison = report.comparisonStart && report.comparisonEnd ? { start: report.comparisonStart, end: report.comparisonEnd } : null;
  const range = { start: report.startDate, end: report.endDate };
  const data = await generateReportData({ project: report.project, integrations, sections, range, comparison, customMetrics, campaignScopes });
  const layout = layoutOf(report);
  if (!layout) return data;
  return (await ensureWidgetValues({ layout, data, project: report.project, integrations, customMetrics, range, comparison })).data;
}

const liveCache = new Map<string, { at: number; data: ReportData }>();
const LIVE_TTL = 5 * 60 * 1000;

/** The values a layout needs (metric keys, formulas, series and tile refs, custom periods): moving or resizing widgets keeps the live cache, changing what they show does not. */
export function layoutFingerprint(layout: ReportLayout): string {
  const lines = layout.blocks.flatMap((b) =>
    b.widgets.map((w) => {
      const refs = widgetRefs(w).map((r) => `${r.integrationId}:${r.key}`).join(',');
      const period = w.custom?.period ? `@${w.custom.period.start}..${w.custom.period.end}` : '';
      return `${valueKey(w.slug === 'container' && !w.integrationId ? { ...w, integrationId: b.integrationId } : w, b.campaigns) ?? ''}|${w.slug === 'calculated' ? w.custom?.formula ?? '' : ''}|${refs}${period}`;
    }),
  );
  return createHash('sha1').update(lines.sort().join('\n')).digest('hex').slice(0, 12);
}

/** Live dashboards re-query on view (with a short cache so a busy client link doesn't hammer provider APIs). */
export interface LiveOptions {
  force?: boolean;
  /** a preset the client asked for (spec v3 §3.5); honoured only when it is on the dashboard's allow-list */
  preset?: string | null;
  /** false hides the comparison period (default: on) */
  compare?: boolean;
}
export interface LiveResult {
  data: ReportData;
  range: DateRange;
  comparison: DateRange | null;
  /** when the numbers were fetched (a cache hit keeps its original time) */
  updatedAt: string;
}
export async function liveDashboardData(report: ReportFull, opts: LiveOptions = {}): Promise<LiveResult> {
  const preset = clientPreset(report, opts.preset);
  let range: DateRange = { start: report.startDate, end: report.endDate };
  if (preset !== 'custom') range = presetRange(preset, report.project.timezone);
  const comparison: DateRange | null = opts.compare === false ? null : preset !== 'custom' ? previousPeriod(range) : report.comparisonStart && report.comparisonEnd ? { start: report.comparisonStart, end: report.comparisonEnd } : null;
  const layout = layoutOf(report);
  // cache key = the set of values the view needs, so moving / resizing widgets re-uses the cached numbers
  const fingerprint = layout ? layoutFingerprint(layout) : `t${report.templateId}|${report.updatedAt.getTime()}`;
  const key = `${report.id}|${fingerprint}|${JSON.stringify(report.integrationIds)}|${range.start}|${range.end}|${comparison ? `${comparison.start}..${comparison.end}` : '-'}`;
  const hit = liveCache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < LIVE_TTL) return { data: hit.data, range, comparison, updatedAt: new Date(hit.at).toISOString() };
  const { integrations, sections, customMetrics, campaignScopes } = await reportInputs(report);
  let data = await generateReportData({ project: report.project, integrations, sections, range, comparison, customMetrics, persistStatus: false, campaignScopes });
  if (layout) data = (await ensureWidgetValues({ layout, data, project: report.project, integrations, customMetrics, range, comparison })).data;
  const at = Date.now();
  liveCache.set(key, { at, data });
  return { data, range, comparison, updatedAt: new Date(at).toISOString() };
}

export type { Template };
/** Retry one failed source (spec v3 §1.3): regenerate that account's blocks, refresh its store entries and its status.
 *  Everything belonging to other accounts stays byte-identical. */
export async function regenerateSource(report: ReportFull, integrationId: number): Promise<ReportData> {
  const { integrations, sections, customMetrics, campaignScopes } = await reportInputs(report);
  const target = integrations.find((i) => i.id === integrationId);
  if (!target) throw new Error('This account is not part of the report');
  const old = report.data as unknown as ReportData | null;
  if (!old) throw new Error('The report has no data yet');
  const range = old.range;
  const comparison = old.comparison ?? null;
  const fresh = await generateReportData({ project: report.project, integrations: [target], sections, range, comparison, customMetrics, persistStatus: true, campaignScopes });
  // the stored sections come from the template at generation time while a layout names its own, so blocks are matched
  // by widget key across all sections, not by section id
  const mine = fresh.sections.flatMap((s) => s.blocks.filter((b) => b.integrationId === integrationId));
  const used = new Set<number>();
  const take = (key: string) => {
    const i = mine.findIndex((f, idx) => !used.has(idx) && f.widget.key === key);
    if (i < 0) return null;
    used.add(i);
    return mine[i];
  };
  const outSections = old.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.integrationId === integrationId ? (take(b.widget.key) ?? b) : b)) }));
  const leftovers = mine.filter((_, idx) => !used.has(idx));
  if (leftovers.length) {
    const host = outSections.find((s) => s.blocks.some((b) => b.integrationId === integrationId)) ?? outSections[0];
    if (host) host.blocks.push(...leftovers);
    else outSections.push(...fresh.sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.integrationId === integrationId) })));
  }
  const freshSrc = fresh.sources.find((s) => s.integrationId === integrationId);
  const sources = old.sources.map((s) => (s.integrationId === integrationId && freshSrc ? freshSrc : s));
  // blended metrics depend on every account: recompute the section blocks now and drop their store entries so the layout
  // pass below recomputes them (review I2)
  const ctxs = integrations.map((i) => toCtx(i, report.project));
  const session = new FetchSession();
  for (const s of outSections)
    for (const blk of s.blocks) {
      if (blk.slug !== 'custom') continue;
      const cm = customMetrics.find((m) => `cm_${m.id}` === blk.widget.key);
      if (cm) blk.widget.value = await evalCustomMetric(cm, ctxs, range, comparison, session);
    }
  const widgets: Record<string, RenderedBlock> = {};
  for (const [k, v] of Object.entries(old.widgets ?? {})) if (!k.startsWith(`${integrationId}:`) && !k.startsWith('0:cm_')) widgets[k] = v;
  let data: ReportData = { ...old, sections: outSections, sources, widgets };
  const layout = layoutOf(report);
  // every account stays in scope so keys other accounts' formulas need are kept, and only the dropped keys are fetched again (review I1)
  if (layout) data = (await ensureWidgetValues({ layout, data, project: report.project, integrations, customMetrics, range, comparison })).data;
  await db.report.update({ where: { id: report.id }, data: { data: data as any } });
  return data;
}
