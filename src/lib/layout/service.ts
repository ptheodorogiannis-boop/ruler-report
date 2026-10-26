// Server side of the in-report editor: seed / load / save a report's layout, build the composed view that
// every renderer (internal page, public link, CSV, API, AI) uses, and "Save as template".
import type { Integration, Project, Report } from '@prisma/client';
import { db } from '@/lib/db';
import { findWidget } from '@/lib/catalog/build';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { ensureWidgetValues, layoutOf, liveDashboardData, loadTemplateSections } from '@/lib/engine/report';
import type { DateRange, ReportData, TemplateSection } from '@/lib/engine/types';
import { componentOfValue, composeReport, indexValues, layoutToSections, normalizeLayout, sectionsFromData, seedLayout, sizeOfValue, storeKey, type ComponentLookup, type SizeLookup } from './compose';
import type { ReportLayout, SourceInfo } from './types';
import { widgetRefIds } from './refs';

type ReportFull = Report & { project: Project };

const EMPTY: ReportData = { range: { start: '', end: '' }, comparison: null, sections: [], sources: [], generated_at: '' };

/** Connected accounts of the report (plus every other account of the project, so blocks can be added). */
export async function sourcesFor(report: Pick<Report, 'projectId' | 'integrationIds'>): Promise<{ report: SourceInfo[]; project: SourceInfo[] }> {
  const rows = await db.integration.findMany({ where: { projectId: report.projectId }, orderBy: { id: 'asc' } });
  const ids = new Set(((report.integrationIds as number[]) ?? []).map(Number));
  const toInfo = (r: Integration): SourceInfo => ({ id: r.id, slug: r.slug, name: r.name });
  const project = rows.map(toInfo);
  const inReport = project.filter((s) => ids.has(s.id));
  // keep the order of integrationIds (the order the user picked)
  inReport.sort((a, b) => [...ids].indexOf(a.id) - [...ids].indexOf(b.id));
  return { report: inReport, project };
}

function componentLookup(rows: Pick<Integration, 'id' | 'slug' | 'config'>[], data: ReportData | null): ComponentLookup {
  const idx = indexValues(data);
  return (slug, key, integrationId) => {
    const row = rows.find((r) => r.id === integrationId);
    const w = getIntegrationDef(slug) ? findWidget(slug, key, (row?.config as any) ?? null) : undefined;
    return w?.component ?? componentOfValue(idx.get(storeKey(integrationId, key))?.widget.value);
  };
}

/** First layout of a report: from its template (honouring saved positions), else from what was rendered. */
export async function seedForReport(report: ReportFull, data: ReportData | null): Promise<ReportLayout> {
  const rows = await db.integration.findMany({ where: { projectId: report.projectId } });
  const sources = (await sourcesFor(report)).report;
  let sections: TemplateSection[] = await loadTemplateSections(report.templateId);
  let srcs = sources;
  if (!sections.length && data) {
    const fromData = sectionsFromData(data);
    sections = fromData.sections;
    srcs = fromData.sources.length ? fromData.sources : sources;
  }
  const idx = indexValues(data);
  const sizeOf: SizeLookup = (slug, key, integrationId, component) => sizeOfValue(idx.get(storeKey(integrationId, key))?.widget.value, component);
  return seedLayout(sections, srcs, componentLookup(rows, data), sizeOf);
}

export interface ReportView {
  raw: ReportData;
  data: ReportData;
  layout: ReportLayout;
  seeded: boolean;
  range: DateRange;
  comparison: DateRange | null;
  /** live dashboards: when the numbers were fetched */
  updatedAt?: string;
  sources: SourceInfo[];
  projectSources: SourceInfo[];
}

/** The report as the reader should see it: raw store + layout → composed sections. Seeds a layout in memory when none is stored. */
export async function reportView(report: ReportFull, opts: { includeHidden?: boolean; force?: boolean; preset?: string | null; compare?: boolean } = {}): Promise<ReportView> {
  let raw: ReportData;
  let updatedAt: string | undefined;
  let range: DateRange = { start: report.startDate, end: report.endDate };
  let comparison: DateRange | null = report.comparisonStart && report.comparisonEnd ? { start: report.comparisonStart, end: report.comparisonEnd } : null;
  if (report.kind === 'report') raw = (report.data as unknown as ReportData | null) ?? EMPTY;
  else {
    const live = await liveDashboardData(report, { force: opts.force, preset: opts.preset, compare: opts.compare });
    raw = live.data;
    range = live.range;
    comparison = live.comparison;
    updatedAt = live.updatedAt;
  }
  const stored = layoutOf(report);
  const layout = stored ?? (await seedForReport(report, raw));
  const { report: sources, project: projectSources } = await sourcesFor(report);
  const ctx = { sources: projectSources.length ? projectSources : sources, currency: report.project.currency, range, comparison };
  const data = composeReport(raw, layout, ctx, { includeHidden: opts.includeHidden });
  return { raw, data, layout, seeded: !stored, range, comparison, updatedAt, sources, projectSources };
}

/** Persist the seeded layout the first time a writer opens the report, so the editor and the client link agree. */
export async function persistSeed(report: ReportFull, view: ReportView): Promise<ReportLayout> {
  if (!view.seeded) return view.layout;
  await db.report.update({ where: { id: report.id }, data: { layout: view.layout as any } });
  return view.layout;
}

export interface SaveLayoutResult {
  layout: ReportLayout;
  data: ReportData; // raw store (with any newly resolved values)
  range: DateRange;
  comparison: DateRange | null;
}

/** Validate, store, and resolve the values new widgets need. Keeps `integrationIds` in sync with the blocks. */
export async function saveLayout(report: ReportFull, input: unknown): Promise<SaveLayoutResult> {
  const layout = normalizeLayout(input);
  const projectRows = await db.integration.findMany({ where: { projectId: report.projectId }, select: { id: true } });
  const allowed = new Set(projectRows.map((r) => r.id));
  const used = new Set<number>(((report.integrationIds as number[]) ?? []).map(Number));
  for (const b of layout.blocks) {
    if (b.integrationId && !allowed.has(b.integrationId)) throw new Error('A block refers to an account that does not belong to this project.');
    if (b.integrationId) used.add(b.integrationId);
    for (const w of b.widgets) {
      if (w.integrationId && !allowed.has(w.integrationId)) throw new Error('A widget refers to an account that does not belong to this project.');
      if (w.integrationId) used.add(w.integrationId);
      // accounts referenced inside the settings (chart series, tile refs) join the report so the engine fetches them; a ref
      // to another project's account (a template reused across clients) is left out and its card says "not connected"
      for (const id of widgetRefIds(w)) if (allowed.has(id)) used.add(id);
    }
  }
  const integrationIds = [...used];
  const updated = await db.report.update({ where: { id: report.id }, data: { layout: layout as any, integrationIds }, include: { project: true } });

  if (report.kind === 'dashboard') {
    const live = await liveDashboardData(updated);
    return { layout, data: live.data, range: live.range, comparison: live.comparison };
  }
  const range = { start: report.startDate, end: report.endDate };
  const comparison = report.comparisonStart && report.comparisonEnd ? { start: report.comparisonStart, end: report.comparisonEnd } : null;
  const raw = (report.data as unknown as ReportData | null) ?? { ...EMPTY, range, comparison };
  const [integrations, customMetrics] = await Promise.all([
    db.integration.findMany({ where: { id: { in: integrationIds }, projectId: report.projectId } }),
    db.customMetric.findMany({ where: { companyId: report.companyId, OR: [{ projectId: null }, { projectId: report.projectId }] } }),
  ]);
  const { data, added } = await ensureWidgetValues({ layout, data: raw, project: report.project, integrations, customMetrics, range, comparison });
  const changed = added > 0 || JSON.stringify(data.widgets ?? {}) !== JSON.stringify(raw.widgets ?? {});
  if (changed) await db.report.update({ where: { id: report.id }, data: { data: data as any } });
  return { layout, data, range, comparison };
}

/** "Save as template": the edited block/widget list becomes a reusable template of the same kind. */
export async function saveAsTemplate(report: ReportFull, companyId: number, input: { title: string; description?: string }) {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required');
  const view = await reportView(report, { includeHidden: false });
  const sections = layoutToSections(view.layout).filter((s) => s.widgets.length > 0);
  if (!sections.length) throw new Error('The report has no widgets to save');
  return db.template.create({ data: { companyId, title, description: input.description?.trim() ?? `Saved from “${report.title}”`, kind: report.kind, sections: sections as any } });
}
