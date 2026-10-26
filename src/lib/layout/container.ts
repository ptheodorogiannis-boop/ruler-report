// Campaign table (spec v3 §2.3): one row per campaign of an ads account with the chosen metrics, built from the
// connector's campaign breakdown. containerFromRows is pure (sorting, hiding, truncation, ratios, comparison gaps);
// resolveContainer plans the primitives, fetches the rows and feeds it.
import { findWidget } from '@/lib/catalog/build';
import { planPrims, rowValue, widgetPrims, type FetchSession, type IntegrationCtx } from '@/lib/engine/resolve';
import type { BreakdownRow, Campaign, ContainerValue, DateRange, ErrorValue, Format } from '@/lib/engine/types';
import { DEFAULT_CONTAINER_METRICS, MAX_CONTAINER_ROWS, type LayoutWidget, type WidgetCustom } from './types';
import { applyContainerCustom } from './container-custom';

export { DEFAULT_CONTAINER_METRICS, MAX_CONTAINER_ROWS, applyContainerCustom };

export interface ContainerMetric {
  key: string;
  label: string;
  format: Format;
}
type ValueOf = (row: BreakdownRow, key: string) => number | null;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Built-in ratios for the common ads metrics when no catalog plan is at hand (typed rows, tests). */
const RATIOS: Record<string, (v: Record<string, number>) => number | null> = {
  cpc: (v) => (v.clicks ? round2(v.spend / v.clicks) : null),
  cpm: (v) => (v.impressions ? round2((v.spend / v.impressions) * 1000) : null),
  ctr: (v) => (v.impressions ? round2((v.clicks / v.impressions) * 100) : null),
  cost_per_conversion: (v) => (v.conversions ? round2(v.spend / v.conversions) : null),
  roas: (v) => (v.spend ? round2((v.conversion_value ?? 0) / v.spend) : null),
};
const defaultValueOf: ValueOf = (row, key) => (key in row.values ? row.values[key] : RATIOS[key] ? RATIOS[key](row.values) : null);

/** Rows → the value: hidden campaigns dropped, sorted by `sortBy` (first metric by default), truncated to `rows`. */
export function containerFromRows(
  rows: BreakdownRow[],
  prev: BreakdownRow[] | null,
  metrics: ContainerMetric[],
  c: Pick<WidgetCustom, 'sortBy' | 'rows' | 'hiddenCampaigns'>,
  campaigns: Campaign[],
  valueOf: ValueOf = defaultValueOf,
): ContainerValue {
  const byId = new Map(campaigns.map((x) => [x.id, x]));
  const prevBy = prev ? new Map(prev.map((r) => [r.key, r])) : null;
  const keys = metrics.map((m) => m.key);
  const all = rows
    .map((r) => {
      const camp = byId.get(r.key);
      const p = prevBy?.get(r.key);
      return {
        id: r.key,
        name: camp?.name ?? r.label ?? r.key,
        status: camp?.status ?? ('other' as const),
        values: keys.map((k) => valueOf(r, k)),
        ...(prevBy ? { comparison: keys.map((k) => (p ? valueOf(p, k) : null)) } : {}),
      };
    });
  return applyContainerCustom({ type: 'container', metrics, rows: all, truncated: 0 }, c);
}

/** The engine side: metric keys → catalog widgets → primitives → one campaign breakdown per period. */
export async function resolveContainer(
  ctx: IntegrationCtx,
  w: LayoutWidget,
  range: DateRange,
  comparison: DateRange | null | undefined,
  session: FetchSession,
  campaigns: Campaign[],
  campaignIds?: string[],
): Promise<ContainerValue | ErrorValue> {
  const c = w.custom ?? {};
  const wanted = c.metrics?.length ? c.metrics : DEFAULT_CONTAINER_METRICS;
  const widgets = wanted.map((k) => findWidget(ctx.slug, k, ctx.config as any)).filter((x): x is NonNullable<typeof x> => !!x && widgetPrims(x.calc).length > 0);
  if (!widgets.length) return { type: 'error', code: 'invalid_metrics_combination', message: 'Pick at least one metric for the campaign table.' };
  const metrics: ContainerMetric[] = widgets.map((wd) => ({ key: wd.key, label: wd.title, format: wd.format }));
  const plan = planPrims(ctx.slug, [...new Set(widgets.flatMap((wd) => widgetPrims(wd.calc)))]);
  const sortBy = plan.real[0];
  const scoped = (rs: BreakdownRow[]) => (campaignIds ? rs.filter((r) => campaignIds.includes(r.key)) : rs);
  const rows = scoped(await session.getBreakdown(ctx, 'campaign', plan.real, range, sortBy, campaignIds));
  const prev = comparison ? scoped(await session.getBreakdown(ctx, 'campaign', plan.real, comparison, sortBy, campaignIds)) : null;
  const byKey = new Map(widgets.map((wd) => [wd.key, wd]));
  const valueOf: ValueOf = (row, key) => {
    const wd = byKey.get(key);
    if (!wd) return null;
    const calc = wd.calc as { kind: string; prim?: string; num?: string; den?: string; mult?: number };
    if (calc.kind === 'ratio' && calc.num && calc.den) {
      // the same definition the KPI uses (e.g. cpc = spend / clicks), per campaign row
      const den = rowValue(row, calc.den, plan);
      if (!den) return null;
      return Math.round((rowValue(row, calc.num, plan) / den) * (calc.mult ?? 1) * 10000) / 10000;
    }
    const prim = widgetPrims(wd.calc)[0];
    return prim ? rowValue(row, prim, plan) : null;
  };
  // the full row set is stored; hidden / sort / rows are applied at compose time so a settings change never re-fetches (review C1)
  return containerFromRows(rows, prev, metrics, { rows: MAX_CONTAINER_ROWS }, campaigns, valueOf);
}
