import type { Calc, DiffType, Format, WidgetSpec, WidgetTags } from '@/lib/engine/types';

export interface PrimSpec {
  /** daily level for independent primitives */
  base?: number;
  /** derive from another primitive: value = parent * rate (keeps funnels coherent in demo data) */
  of?: string;
  rate?: number;
  vol?: number; // daily noise 0-1
  weekly?: number; // weekday seasonality amplitude
  stock?: boolean; // a running total (followers, subscribers)
  growth?: number; // stock: mean daily growth
  int?: boolean; // round to integers (default true for non-money)
  decimals?: number;
  min?: number;
  max?: number;
}

export interface VirtualPrim {
  num: string;
  den: string;
  mult?: number;
}

export interface Archetype {
  id: string;
  label: string;
  prims: Record<string, PrimSpec>;
  virtual?: Record<string, VirtualPrim>;
  /** dimension → category labels used by the demo provider */
  dims: Record<string, string[]>;
  /** dimensions whose demo categories are free-form names (campaigns, pages…) */
  namedDims?: Record<string, { prefix: string; count: number }>;
  widgets: () => WidgetSpec[];
  /** platform-split variants: dimension + values + suffix labels */
  variants?: { dimension: string; values: { value: string; suffix: string; title: string }[]; keys: string[] };
}

type Opts = {
  desc?: string;
  format?: Format;
  diff?: DiffType;
  group?: string;
  tags?: Partial<WidgetTags>;
  agg?: boolean;
  filter?: WidgetSpec['filter'];
};

const build = (component: WidgetSpec['component'], key: string, title: string, calc: Calc, o: Opts = {}): WidgetSpec => ({
  key,
  component,
  title,
  description: o.desc ?? title,
  format: o.format ?? 'number',
  diff: o.diff ?? 'positive_good',
  calc,
  canAggregate: o.agg ?? (calc.kind === 'sum' || calc.kind === 'series'),
  tags: o.tags,
  group: o.group,
  filter: o.filter,
});

/** KPI number */
export const num = (key: string, title: string, calc: Calc, o: Opts = {}) => build('number_v1', key, title, calc, o);
export const sum = (key: string, title: string, prim: string, o: Opts = {}) => num(key, title, { kind: 'sum', prim }, o);
export const latest = (key: string, title: string, prim: string, o: Opts = {}) =>
  num(key, title, { kind: 'latest', prim }, { agg: false, ...o });
export const ratio = (key: string, title: string, n: string, d: string, mult: number | undefined, o: Opts = {}) =>
  num(key, title, { kind: 'ratio', num: n, den: d, mult }, { agg: false, ...o });
export const chart = (key: string, title: string, calc: Calc, o: Opts = {}) => build('chart_v1', key, title, calc, o);
export const series = (key: string, title: string, prims: string[], o: Opts & { labels?: string[] } = {}) =>
  chart(key, title, { kind: 'series', prims, labels: o.labels }, o);
export const byDim = (key: string, title: string, dimension: string, prims: string[], o: Opts & { labels?: string[]; order?: string[] } = {}) =>
  chart(key, title, { kind: 'chart_breakdown', dimension, prims, labels: o.labels, order: o.order }, o);
export const table = (
  key: string,
  title: string,
  dimension: string,
  columns: string[],
  o: Opts & { limit?: number; sortBy?: string; labels?: string[] } = {}
) =>
  build(
    'datatable_v1',
    key,
    title,
    { kind: 'breakdown', dimension, prims: columns, columns, limit: o.limit ?? 25, sortBy: o.sortBy ?? columns[0], labels: o.labels },
    o
  );
export const funnel = (key: string, title: string, steps: { label: string; prim: string }[], o: Opts = {}) =>
  build('funnel_v1', key, title, { kind: 'funnel', steps }, o);

export const MONEY: Opts = { format: 'currency' };
export const PCT: Opts = { format: 'percent' };
export const BAD: Opts = { diff: 'positive_bad' };
