// Pure layout logic: seed a layout from template sections, and compose the rendered report from
// (generated data store + layout + per-widget settings). No database, no Node-only imports — the client
// editor runs the same code to preview edits instantly, the server runs it for public pages and CSV.
import { z } from 'zod';
import type { ChartValue, Component, DateRange, Format, RenderedBlock, RenderedSection, ReportData, TableValue, TemplateSection, TemplateWidgetRef, WidgetValue } from '@/lib/engine/types';
import { evalFormula, formulaRefs } from '@/lib/engine/formula';
import { isAdsSlug } from '@/lib/catalog/integrations';
import { applyContainerCustom } from './container-custom';
import { ICON_NAMES, type IconName } from './icon-names';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { sanitizeHtml } from '@/lib/util/sanitize';
import { parseDate, fmtDate, previousPeriod } from '@/lib/util/dates';
import { compact, flow, resolve } from './grid';
import { customChartFormat, customChartValue } from './custom-chart';
import { isMediaOrHttps } from '@/lib/media/url';
import { hashText, scopeHash, scopeSchema, type CampaignScope } from '@/lib/engine/campaigns';
import { tileValue } from './tiles';
import { DEFAULT_SIZE, GRID_COLS, GRID_GAP, GRID_ROW_HEIGHT, HEX, PALETTE_NAMES, isSpecialSlug, type GroupBy, type LayoutBlock, type LayoutWidget, type ReportLayout, type ReportTheme, type SourceInfo, type WidgetCustom } from './types';

// ───────────── ids & keys ─────────────
let seq = 0;
export const newId = (prefix = 'w') => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const periodSuffix = (p?: DateRange) => (p ? `@${p.start}..${p.end}` : '');
const scopeSuffix = (scope?: CampaignScope) => {
  const h = scopeHash(scope);
  return h ? `#${h}` : '';
};

/** Key of a widget's value inside the data store, or null for widgets rendered purely from their settings. */
export function valueKey(w: Pick<LayoutWidget, 'slug' | 'key' | 'integrationId' | 'custom'>, scope?: CampaignScope): string | null {
  if (w.slug === 'manual' || w.slug === 'analysis' || w.slug === 'calculated' || w.slug === 'custom_chart' || w.slug === 'infographic' || w.slug === 'image') return null;
  // a campaign table's value depends on the metrics chosen, so they are part of the key
  if (w.slug === 'container') return `${w.integrationId}:container:${hashText((w.custom?.metrics ?? []).join(','))}${periodSuffix(w.custom?.period)}${scopeSuffix(scope)}`;
  return `${w.integrationId}:${w.key}${periodSuffix(w.custom?.period)}${scopeSuffix(scope)}`;
}
/** Store key of a value: `integrationId:key[@start..end][#scopeHash]` — the scope hash keeps two campaign scopes of one account apart. */
export const storeKey = (integrationId: number, key: string, period?: DateRange, scope?: CampaignScope) => `${integrationId}:${key}${periodSuffix(period)}${scopeSuffix(scope)}`;

/** Every (integrationId:key[@period]) → RenderedBlock the store knows about. */
export function indexValues(data: ReportData | null | undefined): Map<string, RenderedBlock> {
  const m = new Map<string, RenderedBlock>();
  if (!data) return m;
  for (const s of data.sections ?? []) for (const b of s.blocks) m.set(storeKey(b.integrationId, b.widget.key, undefined, b.campaignScope?.scope), b);
  for (const [k, b] of Object.entries(data.widgets ?? {})) m.set(k, b);
  return m;
}

// ───────────── seeding ─────────────
export type ComponentLookup = (slug: string, key: string, integrationId: number) => Component | undefined;
/** Optional per-widget starting size (e.g. a table sized to its rows); falls back to DEFAULT_SIZE. */
export type SizeLookup = (slug: string, key: string, integrationId: number, component: Component) => { w: number; h: number } | undefined;

const SPECIAL_COMPONENT: Record<string, Component> = { manual: 'empty_v1', analysis: 'analysis_v1', calculated: 'calculated_v1', custom: 'number_v1', custom_chart: 'custom_chart_v1', infographic: 'infographic_v1', image: 'image_v1', container: 'container_v1' };

function widgetFromRef(ref: TemplateWidgetRef, integrationId: number, component: Component, blockId: string, i: number, sizeOf?: SizeLookup): LayoutWidget {
  const size = sizeOf?.(ref.slug, ref.key, integrationId, component) ?? DEFAULT_SIZE[component] ?? DEFAULT_SIZE.number_v1;
  const hasPos = ref.layout && Number.isFinite(ref.layout.x) && Number.isFinite(ref.layout.y);
  return {
    id: `${blockId}_${i}`,
    slug: ref.slug,
    key: ref.key,
    component,
    integrationId,
    x: hasPos ? ref.layout!.x : -1,
    y: hasPos ? ref.layout!.y : -1,
    w: Math.min(GRID_COLS, ref.layout?.w ?? size.w),
    h: ref.layout?.h ?? size.h,
    ...(ref.custom ? { custom: ref.custom as WidgetCustom } : {}),
  };
}

/**
 * Build the first layout of a report from its template sections and connected accounts:
 * one block per (section × account) that has at least one widget, plus one custom block per section for
 * blended / manual / analysis / calculated widgets. Widgets without a stored position are flowed left→right.
 */
export function seedLayout(sections: TemplateSection[], sources: SourceInfo[], componentOf: ComponentLookup, sizeOf?: SizeLookup): ReportLayout {
  const blocks: LayoutBlock[] = [];
  sections.forEach((s, si) => {
    const sid = s.id || `s${si + 1}`;
    for (const src of sources) {
      const refs = s.widgets.filter((r) => r.slug === src.slug);
      if (!refs.length) continue;
      const id = `${sid}_${src.id}`;
      const widgets = refs.map((r, i) => widgetFromRef(r, src.id, componentOf(r.slug, r.key, src.id) ?? 'number_v1', id, i, sizeOf));
      // widgets that carry stored positions (save-as-template) keep them; auto-flowed blocks fill their rows
      // a section saved from a scoped block carries its scope: the seeded block keeps it so generated values and compose agree (review C3)
      blocks.push({ id, title: s.title, integrationId: src.id, slug: src.slug, ...(s.campaigns && isAdsSlug(src.slug) ? { campaigns: s.campaigns } : {}), ...blockOptions(s), widgets: refs.some((r) => r.layout) ? flow(widgets) : fillRows(flow(widgets)) });
    }
    const specials = s.widgets.filter((r) => isSpecialSlug(r.slug));
    if (specials.length) {
      const id = `${sid}_custom`;
      const widgets = specials.map((r, i) => widgetFromRef(r, 0, componentOf(r.slug, r.key, 0) ?? SPECIAL_COMPONENT[r.slug] ?? 'number_v1', id, i, sizeOf));
      blocks.push({ id, title: s.title, integrationId: 0, slug: 'custom', ...blockOptions(s), widgets: flow(widgets) });
    }
  });
  return { version: 1, blocks };
}

/** Charts that end a row with nothing to their right widen to the edge, so a seeded block has no empty columns. */
export function fillRows(widgets: LayoutWidget[]): LayoutWidget[] {
  let out = widgets;
  // a chart sitting beside KPIs that end above its bottom edge would leave a void under them: move it below, full width
  for (const w of [...out].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (w.component !== 'chart_v1' || w.x === 0) continue;
    const left = out.filter((o) => o.id !== w.id && o.x + o.w <= w.x && o.y < w.y + w.h && o.y + o.h > w.y);
    const voidBelow = left.length > 0 && left.every((o) => o.y + o.h < w.y + w.h);
    if (!voidBelow) continue;
    const bottom = Math.max(...out.filter((o) => o.id !== w.id && o.y < w.y + w.h).map((o) => o.y + o.h));
    out = resolve(out, { ...w, x: 0, y: bottom, w: GRID_COLS }); // push whatever sits below out of the way, then compact
  }
  const widened = out.map((w) => {
    if (w.component !== 'chart_v1' || w.x + w.w >= GRID_COLS) return w;
    const blocked = out.some((o) => o.id !== w.id && o.x >= w.x + w.w && o.y < w.y + w.h && o.y + o.h > w.y);
    return blocked ? w : { ...w, w: GRID_COLS - w.x };
  });
  return justifyKpiRows(widened);
}

/**
 * The leading rows of a seeded block that hold nothing but default-sized KPIs are justified, so a full-width chart under
 * a short row meets no empty cells (docs/DESIGN.md › Pass 5): two numbers in a row take six columns each, three take four.
 * The run is re-packed as evenly as possible first (five KPIs → 3 + 2, not 4 + 1); the row count stays the same, so
 * nothing below moves. A lone KPI keeps its three columns: one number stretched across the page would overstate it.
 */
export function justifyKpiRows(widgets: LayoutWidget[]): LayoutWidget[] {
  const { w: kw, h: kh } = DEFAULT_SIZE.number_v1;
  const isKpi = (w: LayoutWidget) => w.component === 'number_v1' && w.w === kw && w.h === kh;
  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const head: LayoutWidget[] = [];
  for (let y = 0; ; y += kh) {
    const row = sorted.filter((w) => w.y < y + kh && w.y + w.h > y);
    if (!row.length || !row.every((w) => isKpi(w) && w.y === y)) break;
    head.push(...row);
  }
  const n = head.length;
  if (n < 2) return widgets;
  const rows = Math.ceil(n / Math.floor(GRID_COLS / kw));
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const placed = new Map<string, LayoutWidget>();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const count = base + (r < extra ? 1 : 0);
    const w = Math.floor(GRID_COLS / count);
    for (let c = 0; c < count; c++, i++) placed.set(head[i].id, { ...head[i], x: c * w, y: r * kh, w });
  }
  return widgets.map((w) => placed.get(w.id) ?? w);
}

/** Rendered data → template-like sections (used to seed reports whose template changed or was deleted). */
export function sectionsFromData(data: ReportData): { sections: TemplateSection[]; sources: SourceInfo[] } {
  const sources: SourceInfo[] = [];
  const sections: TemplateSection[] = data.sections.map((s) => {
    const seen = new Set<string>();
    const widgets: TemplateWidgetRef[] = [];
    for (const b of s.blocks) {
      if (b.integrationId && !sources.some((x) => x.id === b.integrationId)) sources.push({ id: b.integrationId, slug: b.slug, name: b.account_name });
      const k = `${b.slug}|${b.widget.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      widgets.push({ slug: b.slug, key: b.widget.key });
    }
    return { id: s.id, title: s.title, widgets };
  });
  return { sections, sources };
}

/** Grid rows a rendered value needs (64px rows, 12px gap): tables and funnels grow with their rows, capped. */
export function sizeOfValue(v: WidgetValue | undefined, component: Component): { w: number; h: number } | undefined {
  const rows = (px: number) => Math.ceil((px + GRID_GAP) / (GRID_ROW_HEIGHT + GRID_GAP));
  if (v?.type === 'table') return { w: 12, h: Math.min(8, Math.max(3, rows(92 + 37 * v.rows.length))) };
  if (v?.type === 'funnel') return { w: 12, h: Math.min(8, Math.max(3, rows(64 + 36 * v.steps.length))) };
  if (v?.type === 'container') return { w: 12, h: Math.min(8, Math.max(3, rows(92 + 37 * (v.rows.length + 1)))) };
  void component;
  return undefined;
}

export const componentOfValue = (v: WidgetValue | undefined): Component | undefined =>
  v?.type === 'container' ? 'container_v1' : v?.type === 'number' ? 'number_v1' : v?.type === 'chart' ? 'chart_v1' : v?.type === 'table' ? 'datatable_v1' : v?.type === 'funnel' ? 'funnel_v1' : v?.type === 'text' ? 'analysis_v1' : v?.type === 'tile' ? 'infographic_v1' : v?.type === 'image' ? 'image_v1' : undefined;

/** The header options a block carries into a template section and a rendered section (spec v3 §4.3). */
export const blockOptions = (b: { icon?: string; subtitle?: string; hideHeader?: boolean }) => ({
  ...(b.icon ? { icon: b.icon as IconName } : {}),
  ...(b.subtitle ? { subtitle: b.subtitle } : {}),
  ...(b.hideHeader ? { hideHeader: true } : {}),
});

/** Layout → template sections: one section per block, `custom` + `layout` preserved; same-titled blocks of one platform merge. */
export function layoutToSections(layout: ReportLayout, opts: { keepLayout?: boolean } = {}): TemplateSection[] {
  const out: TemplateSection[] = [];
  for (const b of layout.blocks) {
    let sec = out.find((s) => s.title === b.title && (s as any).__slug === b.slug && scopeHash(s.campaigns) === scopeHash(b.campaigns));
    if (!sec) {
      sec = { id: b.id, title: b.title, widgets: [], ...(b.campaigns ? { campaigns: b.campaigns } : {}), ...blockOptions(b) };
      (sec as any).__slug = b.slug;
      out.push(sec);
    }
    for (const w of b.widgets) {
      if (w.custom?.hidden) continue;
      // identical widgets of two accounts of one platform merge into one template entry; copies with other settings (e.g. a custom period) stay
      const dup = sec.widgets.find((r) => r.slug === w.slug && r.key === w.key && !isSpecialSlug(w.slug) && JSON.stringify(r.custom ?? {}) === JSON.stringify(w.custom ?? {}));
      if (dup) continue;
      const ref: TemplateWidgetRef = { slug: w.slug, key: w.key };
      if (w.custom && Object.keys(w.custom).length) ref.custom = { ...w.custom };
      if (opts.keepLayout !== false) ref.layout = { x: w.x, y: w.y, w: w.w, h: w.h };
      sec.widgets.push(ref);
    }
  }
  return out.map((s) => ({ id: s.id, title: s.title, widgets: s.widgets, ...(s.campaigns ? { campaigns: s.campaigns } : {}), ...blockOptions(s) }));
}

// ───────────── re-bucketing ─────────────
const isoDate = (l: string) => /^\d{4}-\d{2}-\d{2}$/.test(l);
function bucketLabel(day: string, by: GroupBy): string {
  if (by === 'day') return day;
  const d = parseDate(day);
  if (by === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return fmtDate(d);
  }
  if (by === 'month') return `${day.slice(0, 7)}-01`;
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return `${d.getUTCFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
}

/** Re-aggregate a daily time series into weeks / months / quarters using the per-series `agg` hints. */
export function rebucket(v: ChartValue, by: GroupBy | undefined): ChartValue {
  if (!by || by === 'day' || !v.labels.length || !isoDate(v.labels[0])) return v;
  const groups: { label: string; idx: number[] }[] = [];
  v.labels.forEach((l, i) => {
    const b = bucketLabel(l, by);
    const g = groups[groups.length - 1];
    if (g && g.label === b) g.idx.push(i);
    else groups.push({ label: b, idx: [i] });
  });
  if (groups.length === v.labels.length) return v;
  const agg = (vals: number[], how: 'sum' | 'avg' | 'last'): number | null => {
    if (!vals.length) return null; // a bucket with no data stays a gap (spec §6), never a fake zero
    if (how === 'last') return vals[vals.length - 1];
    const s = vals.reduce((a, b) => a + (b ?? 0), 0);
    return how === 'avg' ? Math.round((s / vals.length) * 10000) / 10000 : Math.round(s * 100) / 100;
  };
  const re = (series: number[][]) => series.map((s, si) => groups.map((g) => agg(g.idx.map((i) => s[i]).filter((x) => x != null), v.agg?.[si] ?? 'sum')));
  return { ...v, labels: groups.map((g) => g.label), series: re(v.series) as number[][], ...(v.comparison ? { comparison: { series: re(v.comparison.series) as number[][] } } : {}) };
}

// ───────────── tables ─────────────
export function applyTableCustom(v: TableValue, c: WidgetCustom | undefined): TableValue {
  if (!c) return v;
  const dim = v.columns[0];
  let order = v.columns.slice(1);
  if (c.columnOrder?.length) {
    const wanted = c.columnOrder.filter((x) => order.includes(x));
    order = [...wanted, ...order.filter((x) => !wanted.includes(x))];
  }
  const hidden = new Set(c.hiddenColumns ?? []);
  const cols = [dim, ...order.filter((x) => !hidden.has(x))];
  const idx = cols.map((x) => v.columns.indexOf(x));
  let rows = v.rows.map((r) => idx.map((i) => r[i]));
  if (c.sortBy && cols.includes(c.sortBy)) {
    const si = cols.indexOf(c.sortBy);
    const dir = c.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[si];
      const bv = b[si];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }
  if (c.rows && c.rows > 0) rows = rows.slice(0, c.rows);
  return { ...v, columns: cols, columnLabels: idx.map((i) => v.columnLabels[i]), columnFormats: idx.map((i) => v.columnFormats[i]), rows };
}

// ───────────── compose ─────────────
export interface ComposeCtx {
  /** connected accounts (for block headers and calculated-metric lookups) */
  sources: SourceInfo[];
  currency: string;
  range: DateRange;
  comparison?: DateRange | null;
}
export interface ComposeOpts {
  /** editor: keep hidden widgets so they can be un-hidden */
  includeHidden?: boolean;
}

const pct = (cur: number | null, prev: number | null) => (cur == null || prev == null ? null : prev === 0 ? (cur === 0 ? 0 : null) : Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(2)));

const platformOf = (slug: string, sources: SourceInfo[], integrationId: number, data: ReportData) => {
  const src = data.sources?.find((s) => s.integrationId === integrationId);
  const def = getIntegrationDef(slug);
  return { platform: src?.platform ?? def?.name ?? slug, account_name: src?.account_name ?? sources.find((s) => s.id === integrationId)?.name ?? '' };
};

const pending = (label: string, w: LayoutWidget, ctx: ComposeCtx, data: ReportData, message = 'Loading…'): RenderedBlock => {
  const info = platformOf(w.slug, ctx.sources, w.integrationId, data);
  return { integrationId: w.integrationId, platform: info.platform, slug: w.slug, account_name: info.account_name, widget: { reference_key: `${w.slug}:${w.key}`, key: w.key, label, format: 'number', diff_type: 'neutral', value: { type: 'error', code: 'pending', message } } };
};

function calculatedValue(w: LayoutWidget, idx: Map<string, RenderedBlock>, ctx: ComposeCtx, scope?: CampaignScope, blockIntegrationId = 0): WidgetValue {
  const formula = w.custom?.formula?.trim();
  if (!formula) return { type: 'error', code: 'invalid_metrics_combination', message: 'Enter a formula, e.g. {fb_ads:spend} / {fb_ads:conversions}.' };
  let refs: string[];
  try {
    refs = formulaRefs(formula);
  } catch (e) {
    return { type: 'error', code: 'invalid_metrics_combination', message: `Formula error: ${(e as Error).message}` };
  }
  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  let hasPrev = false;
  for (const ref of refs) {
    const [prefix, ...rest] = ref.split(':');
    const key = rest.join(':');
    const ids = /^\d+$/.test(prefix) ? [Number(prefix)] : ctx.sources.filter((s) => getIntegrationDef(s.slug)?.prefix === prefix).map((s) => s.id);
    let found = false;
    let c = 0;
    let p = 0;
    for (const id of ids) {
      // the block's own account follows the block scope (review I8); an older snapshot without the scoped value falls back
      const sc = scope && id === blockIntegrationId ? scope : undefined;
      const b = (sc ? idx.get(storeKey(id, key, w.custom?.period, sc)) ?? idx.get(storeKey(id, key, undefined, sc)) : undefined) ?? idx.get(storeKey(id, key, w.custom?.period)) ?? idx.get(storeKey(id, key));
      if (b?.widget.value.type !== 'number') continue;
      found = true;
      c += b.widget.value.value ?? 0;
      if (b.widget.value.comparison) {
        hasPrev = true;
        p += b.widget.value.comparison.value ?? 0;
      }
    }
    if (!found) return { type: 'error', code: 'pending', message: `Waiting for ${ref}…` };
    cur.set(ref, c);
    prev.set(ref, p);
  }
  const value = evalFormula(formula, (k) => cur.get(k) ?? null);
  const out: Extract<WidgetValue, { type: 'number' }> = { type: 'number', value };
  if (hasPrev) {
    const pv = evalFormula(formula, (k) => prev.get(k) ?? null);
    out.comparison = { value: pv, change_pct: pct(value, pv), absolute: value != null && pv != null ? value - pv : null };
  }
  return out;
}

/** The scope a block's widgets resolve under: its own, else the account default frozen at generation (never the live config). */
export function effectiveScope(b: Pick<LayoutBlock, 'campaigns' | 'integrationId' | 'slug'>, data: ReportData | null | undefined): CampaignScope | undefined {
  if (!isAdsSlug(b.slug)) return undefined;
  return b.campaigns ?? data?.sources?.find((s) => s.integrationId === b.integrationId)?.campaigns;
}
/** Store key of a widget inside its block (a drawer-added campaign table belongs to the block's account). */
export function widgetValueKey(w: LayoutWidget, b: Pick<LayoutBlock, 'campaigns' | 'integrationId' | 'slug'>, data: ReportData | null | undefined): string | null {
  return valueKey(w.slug === 'container' && !w.integrationId ? { ...w, integrationId: b.integrationId } : w, effectiveScope(b, data));
}
/** Set a block's campaign scope (undefined clears it). An explicit "all" is stored as such, so it overrides a narrowing account default (review I6). */
export function withBlockScope(layout: ReportLayout, blockId: string, scope: CampaignScope | undefined): ReportLayout {
  return {
    ...layout,
    blocks: layout.blocks.map((b) => {
      if (b.id !== blockId) return b;
      if (scope) return { ...b, campaigns: scope };
      const { campaigns: _dropped, ...rest } = b;
      return rest;
    }),
  };
}

function renderWidget(w: LayoutWidget, idx: Map<string, RenderedBlock>, ctx: ComposeCtx, data: ReportData, scope?: CampaignScope, blockIntegrationId = 0): RenderedBlock {
  const c = w.custom ?? {};
  let block: RenderedBlock;
  if (w.slug === 'manual') {
    const value = c.value ?? null;
    const previous = c.previous ?? null;
    block = {
      integrationId: 0,
      platform: 'Manual',
      slug: 'manual',
      account_name: '',
      widget: { reference_key: 'number', key: w.key, label: c.title ?? 'Manual metric', description: c.description ?? 'Value typed in the editor', format: c.format ?? 'number', diff_type: 'positive_good', currency: ctx.currency, value: { type: 'number', value, comparison: previous != null ? { value: previous, change_pct: pct(value, previous), absolute: value != null ? value - previous : null } : undefined } },
    };
  } else if (w.slug === 'analysis') {
    block = { integrationId: 0, platform: 'Analysis', slug: 'analysis', account_name: '', widget: { reference_key: 'wysiwyg', key: w.key, label: c.title ?? 'Analysis', description: c.description, format: 'text', diff_type: 'neutral', value: { type: 'text', html: sanitizeHtml(c.html ?? '') } } };
  } else if (w.slug === 'calculated') {
    block = { integrationId: 0, platform: 'Calculated', slug: 'calculated', account_name: '', widget: { reference_key: `calculated:${w.id}`, key: w.key, label: c.title ?? 'Calculated metric', description: c.description ?? c.formula, format: c.format ?? 'decimal', diff_type: 'positive_good', currency: ctx.currency, value: calculatedValue(w, idx, ctx, scope, blockIntegrationId) } };
  } else if (w.slug === 'custom_chart') {
    block = { integrationId: 0, platform: 'Custom chart', slug: 'custom_chart', account_name: '', widget: { reference_key: `custom_chart:${w.id}`, key: w.key, label: c.title ?? 'Custom chart', description: c.description, format: customChartFormat(w, idx, scope, blockIntegrationId), diff_type: 'neutral', currency: ctx.currency, value: customChartValue(w, idx, scope, blockIntegrationId) } };
  } else if (w.slug === 'infographic') {
    const value = tileValue(w, idx, scope, blockIntegrationId);
    block = { integrationId: 0, platform: 'Infographic', slug: 'infographic', account_name: '', widget: { reference_key: `infographic:${w.id}`, key: w.key, label: c.title ?? 'Infographic', description: c.description, format: value.type === 'tile' ? value.format : c.format ?? 'number', diff_type: c.positiveBad ? 'positive_bad' : 'positive_good', currency: ctx.currency, value } };
  } else if (w.slug === 'image') {
    const url = c.url ?? '';
    block = { integrationId: 0, platform: 'Image', slug: 'image', account_name: '', widget: { reference_key: `image:${w.id}`, key: w.key, label: c.title ?? 'Image', description: c.description, format: 'text', diff_type: 'neutral', value: url ? { type: 'image', url, alt: c.alt ?? c.title ?? 'Image', caption: c.caption, fit: c.fit ?? 'contain' } : { type: 'error', code: 'invalid_metrics_combination', message: 'Choose an image.' } } };
  } else {
    // a campaign table added from the drawer carries integrationId 0: it belongs to the block's account
    const base = idx.get(valueKey(w.slug === 'container' && !w.integrationId ? { ...w, integrationId: blockIntegrationId } : w, scope)!);
    block = base ? { ...base, widget: { ...base.widget } } : pending(c.title ?? w.key, w, ctx, data, c.period ? 'Loading custom period…' : 'Loading…');
  }
  // overrides shared by every widget
  const wd = { ...block.widget };
  if (c.title) wd.label = c.title;
  if (c.description != null && c.description !== '') wd.description = c.description;
  if (c.positiveBad != null && w.slug !== 'analysis') wd.diff_type = c.positiveBad ? 'positive_bad' : 'positive_good';
  if (wd.value.type === 'chart') wd.value = rebucket(wd.value, c.groupBy);
  if (wd.value.type === 'table') wd.value = applyTableCustom(wd.value, c);
  if (wd.value.type === 'container') wd.value = applyContainerCustom(wd.value, c);
  return { ...block, widget: wd, id: w.id, layout: { x: w.x, y: w.y, w: w.w, h: w.h }, ...(w.custom ? { custom: w.custom as Record<string, unknown> } : {}) };
}

/** The report as the reader sees it: layout blocks → sections, every widget value with its settings applied. */
export function composeReport(data: ReportData, layout: ReportLayout, ctx: ComposeCtx, opts: ComposeOpts = {}): ReportData {
  const idx = indexValues(data);
  const sections: RenderedSection[] = layout.blocks.map((b) => {
    const info = b.integrationId ? platformOf(b.slug, ctx.sources, b.integrationId, data) : { platform: 'Custom block', account_name: '' };
    const widgets = opts.includeHidden ? b.widgets : b.widgets.filter((w) => !w.custom?.hidden);
    // the block's own scope, else the account's default as frozen at generation (data.sources), never the live config
    const scope = effectiveScope(b, data);
    const blocks = widgets.map((w) => renderWidget(w, idx, ctx, data, scope, b.integrationId));
    const campaignScope = blocks.find((x) => x.campaignScope)?.campaignScope;
    return { id: b.id, title: b.title, blocks, ...(campaignScope ? { campaignScope } : {}), ...blockOptions(b), source: { integrationId: b.integrationId, slug: b.slug, platform: info.platform, account_name: info.account_name } };
  });
  return { ...data, sections, widgets: undefined, ...(layout.theme ? { theme: layout.theme } : {}) };
}

/** Comparison range for a widget with a custom period (previous period of the same length). */
export const comparisonFor = (period: DateRange | undefined, reportComparison: DateRange | null | undefined) => (period ? previousPeriod(period) : reportComparison ?? null);

// ───────────── validation ─────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(HEX, 'Colours are #rrggbb');
const mediaOrHttps = z.string().max(500).refine(isMediaOrHttps, 'An uploaded image or an https:// address');
const refSchema = z.object({ integrationId: z.number().int().min(0), key: z.string().min(1).max(128) }).strict();
const formatEnum = z.enum(['number', 'currency', 'percent', 'decimal', 'duration', 'text']);
export const customSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    hidden: z.boolean().optional(),
    highlight: z.boolean().optional(),
    showComparison: z.boolean().optional(),
    showVariation: z.boolean().optional(),
    showAbsolute: z.boolean().optional(),
    positiveBad: z.boolean().optional(),
    period: z.object({ start: dateStr, end: dateStr }).optional(),
    metrics: z.array(z.string().min(1).max(128)).max(12).optional(),
    showStatus: z.boolean().optional(),
    hiddenCampaigns: z.array(z.string().min(1).max(80)).max(200).optional(),
    chartType: z.enum(['line', 'bar', 'pie', 'area', 'stacked', 'donut']).optional(),
    groupBy: z.enum(['day', 'week', 'month', 'quarter']).optional(),
    hiddenColumns: z.array(z.string()).max(50).optional(),
    columnOrder: z.array(z.string()).max(50).optional(),
    sortBy: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    rows: z.number().int().min(1).max(500).optional(),
    value: z.number().nullable().optional(),
    previous: z.number().nullable().optional(),
    format: formatEnum.optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    html: z.string().max(20000).optional(),
    formula: z.string().max(500).optional(),
    // custom_chart_v1
    series: z.array(z.object({ integrationId: z.number().int().min(0), key: z.string().min(1).max(128), label: z.string().max(100).optional(), color: hex.optional() }).strict()).max(8).optional(),
    manual: z.object({ labels: z.array(z.string().max(100)).max(100), series: z.array(z.object({ label: z.string().max(100), values: z.array(z.number().nullable()).max(100) }).strict()).max(8) }).strict().optional(),
    // infographic_v1
    kind: z.enum(['progress', 'ranking', 'stat', 'compare']).optional(),
    ref: refSchema.optional(),
    ref2: refSchema.optional(),
    target: z.number().optional(),
    items: z.array(z.object({ label: z.string().max(100), value: z.number() }).strict()).max(50).optional(),
    tableRef: z.object({ integrationId: z.number().int().min(0), key: z.string().min(1).max(128), column: z.string().max(128).optional(), rows: z.number().int().min(1).max(50).optional() }).strict().optional(),
    icon: z.string().max(32).optional(),
    // image_v1
    url: mediaOrHttps.optional(),
    fit: z.enum(['cover', 'contain']).optional(),
    caption: z.string().max(300).optional(),
    alt: z.string().max(200).optional(),
  })
  .strict();

const widgetSchema = z.object({
  id: z.string().min(1).max(64),
  slug: z.string().min(1).max(64),
  key: z.string().min(1).max(128),
  component: z.enum(['number_v1', 'chart_v1', 'datatable_v1', 'funnel_v1', 'container_v1', 'analysis_v1', 'empty_v1', 'calculated_v1', 'custom_chart_v1', 'infographic_v1', 'image_v1']),
  integrationId: z.number().int().min(0),
  x: z.number().int().min(0).max(GRID_COLS - 1),
  y: z.number().int().min(0).max(10_000),
  w: z.number().int().min(1).max(GRID_COLS),
  h: z.number().int().min(1).max(200),
  custom: customSchema.optional(),
});
export const themeSchema = z
  .object({
    accent: hex.optional(),
    palette: z.enum(PALETTE_NAMES).optional(),
    cover: mediaOrHttps.optional(),
    coverLayout: z.enum(['banner', 'header', 'none']).optional(),
    coverText: hex.optional(),
    showPeriod: z.boolean().optional(),
    blocks: z.record(z.string().max(64), z.object({ color: hex.optional() }).strict()).refine((b) => Object.keys(b).length <= 100, 'Too many block colours').optional(),
  })
  .strict();

export const layoutSchema = z.object({
  version: z.literal(1),
  theme: themeSchema.optional(),
  blocks: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().max(200),
        integrationId: z.number().int().min(0),
        slug: z.string().min(1).max(64),
        campaigns: scopeSchema.optional(),
        icon: z.enum(ICON_NAMES).optional(),
        subtitle: z.string().max(120).optional(),
        hideHeader: z.boolean().optional(),
        widgets: z.array(widgetSchema).max(500),
      })
    )
    .max(100),
});

/** Validate + normalise a layout coming from the client: ids unique, items inside the grid, no overlaps. */
export function normalizeLayout(input: unknown): ReportLayout {
  const parsed = layoutSchema.parse(input);
  const ids = new Set<string>();
  const blocks: LayoutBlock[] = parsed.blocks.map((b) => {
    if (ids.has(b.id)) throw new Error(`Duplicate block id ${b.id}`);
    ids.add(b.id);
    const widgets = b.widgets.map((w) => {
      if (ids.has(w.id)) throw new Error(`Duplicate widget id ${w.id}`);
      ids.add(w.id);
      if (w.x + w.w > GRID_COLS) throw new Error(`Widget ${w.id} does not fit in the grid`);
      const custom = w.custom && Object.keys(w.custom).length ? (w.custom as WidgetCustom) : undefined;
      return { ...w, custom } as LayoutWidget;
    });
    return { ...b, widgets: compact(widgets) };
  });
  const theme = parsed.theme as ReportTheme | undefined;
  return { version: 1, blocks, ...(theme ? { theme } : {}) };
}

export type { Format };
