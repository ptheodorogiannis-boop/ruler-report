import { createHash } from 'node:crypto';
import type { Archetype } from './helpers';
import { ARCHETYPES } from './archetypes';
import { getIntegrationDef } from './integrations';
import { byDim, series, sum, table } from './helpers';
import type { Calc, WidgetDefinition, WidgetSpec, WidgetTags } from '@/lib/engine/types';

export interface CatalogWidget extends WidgetSpec {
  slug: string;
  prefix: string;
  reference_key: string;
}

export interface CustomColumn {
  key: string; // sanitized
  name: string; // original header
  kind: 'number' | 'date' | 'text';
}

const cache = new Map<string, CatalogWidget[]>();

/** Column header → stable key. Unicode-aware so Greek / accented headers keep their identity ("Κόστος" → "κοστος"). */
export const sanitizeKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'col';

export function archetypeFor(slug: string): Archetype | null {
  const def = getIntegrationDef(slug);
  if (!def || def.archetype === 'custom') return null;
  return ARCHETYPES[def.archetype] ?? null;
}

const DEFAULT_TAGS: WidgetTags = { cost: 'organic', calculation: 'Passed through the network', history: 'retroactive', value: 'partial value' };

function tagsFor(w: WidgetSpec, category: string): WidgetTags {
  const cost: WidgetTags['cost'] = category === 'ads' ? 'paid' : category === 'analytics' ? 'organic + paid' : 'organic';
  return { ...DEFAULT_TAGS, cost, ...(w.tags ?? {}), calculation: w.tags?.calculation ?? (w.calc.kind === 'ratio' ? 'calculated' : DEFAULT_TAGS.calculation) } as WidgetTags;
}

/** Widgets for an integration type. Custom-data types need the detected columns from the integration config. */
export function getCatalog(slug: string, config?: { columns?: CustomColumn[] } | null): CatalogWidget[] {
  const def = getIntegrationDef(slug);
  if (!def) return [];
  if (def.archetype === 'custom') return customCatalog(slug, def.prefix, config?.columns ?? []);

  const ck = slug;
  const hit = cache.get(ck);
  if (hit) return hit;
  const arch = ARCHETYPES[def.archetype];
  const base = arch.widgets();
  const out: CatalogWidget[] = [];
  for (const w of base) out.push({ ...w, slug, prefix: def.prefix, reference_key: `${def.prefix}:${w.key}`, tags: tagsFor(w, def.category) });

  // platform-split variants: reach → reach_facebook, reach_instagram …  (this is why Reportei's catalog has hundreds of entries)
  if (arch.variants) {
    for (const key of arch.variants.keys) {
      const w = base.find((x) => x.key === key);
      if (!w) continue;
      for (const v of arch.variants.values) {
        out.push({
          ...w,
          key: `${key}_${v.suffix}`,
          title: `${w.title} on ${v.title}`,
          description: `${w.title}, taking into account only what ran on ${v.title}.`,
          filter: { dimension: arch.variants.dimension, value: v.value },
          slug,
          prefix: def.prefix,
          reference_key: `${def.prefix}:${key}_${v.suffix}`,
          group: 'By platform',
          tags: tagsFor(w, def.category),
        });
      }
    }
  }
  cache.set(ck, out);
  return out;
}

function customCatalog(slug: string, prefix: string, columns: CustomColumn[]): CatalogWidget[] {
  const numbers = columns.filter((c) => c.kind === 'number');
  const texts = columns.filter((c) => c.kind === 'text');
  const specs: WidgetSpec[] = [];
  specs.push(sum('rows', 'Rows / records', '__rows', { group: 'Overview', desc: 'Number of records in the period.', tags: { calculation: 'calculated' } }));
  for (const c of numbers) {
    specs.push(sum(`sum_${c.key}`, `${c.name} (total)`, c.key, { group: 'Totals' }));
    specs.push({ ...sum(`avg_${c.key}`, `${c.name} (daily average)`, c.key), calc: { kind: 'avg', prim: c.key } as Calc, canAggregate: false, group: 'Totals' });
    specs.push(series(`${c.key}_by_date`, `${c.name} per day`, [c.key], { group: 'Charts' }));
  }
  if (numbers.length > 1) specs.push(series('all_by_date', 'All numeric columns per day', numbers.slice(0, 4).map((c) => c.key), { group: 'Charts', labels: numbers.slice(0, 4).map((c) => c.name) }));
  specs.push(series('rows_by_date', 'Records per day', ['__rows'], { group: 'Charts' }));
  for (const t of texts.slice(0, 6)) {
    const cols = numbers.slice(0, 6).map((c) => c.key);
    specs.push(table(`by_${t.key}`, `Breakdown by ${t.name}`, t.key, ['__rows', ...cols], { group: 'Tables', labels: ['Records', ...numbers.slice(0, 6).map((c) => c.name)], sortBy: cols[0] ?? '__rows' }));
    specs.push(byDim(`chart_by_${t.key}`, `Records by ${t.name}`, t.key, ['__rows'], { group: 'Charts' }));
  }
  return specs.map((w) => ({ ...w, slug, prefix, reference_key: `${prefix}:${w.key}`, tags: { ...DEFAULT_TAGS, calculation: 'Passed through the network', ...(w.tags ?? {}) } as WidgetTags }));
}

export function findWidget(slug: string, key: string, config?: { columns?: CustomColumn[] } | null): CatalogWidget | undefined {
  const cat = getCatalog(slug, config);
  return cat.find((w) => w.key === key || w.reference_key === key);
}

const widgetId = (referenceKey: string) => {
  const h = createHash('sha1').update(referenceKey).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

export function toDefinition(w: CatalogWidget): WidgetDefinition {
  const metrics = metricNames(w.calc);
  const def: WidgetDefinition = {
    id: widgetId(w.reference_key),
    reference_key: w.reference_key,
    component: w.component,
    metrics,
    references: {
      title: w.title,
      description: w.description,
      diff_type: w.diff,
      formatting_function: w.format,
      can_be_aggregated: w.canAggregate ?? false,
      tags: { ...DEFAULT_TAGS, ...(w.tags ?? {}) } as WidgetTags,
      group: w.group,
    },
  };
  if (w.filter) def.dimensions = [{ field: w.filter.dimension, operator: 'IN', value: [w.filter.value] }];
  else if (w.calc.kind === 'breakdown' || w.calc.kind === 'chart_breakdown') def.dimensions = [w.calc.dimension];
  if (w.calc.kind === 'ratio' || w.calc.kind === 'custom') def.calculated = true;
  return def;
}

export function metricNames(calc: Calc): string[] {
  switch (calc.kind) {
    case 'sum':
    case 'avg':
    case 'latest':
    case 'delta':
      return [calc.prim];
    case 'ratio':
      return [calc.num, calc.den];
    case 'series':
    case 'breakdown':
    case 'chart_breakdown':
      return calc.prims;
    case 'funnel':
      return calc.steps.map((s) => s.prim);
    case 'custom':
      return [];
  }
}
