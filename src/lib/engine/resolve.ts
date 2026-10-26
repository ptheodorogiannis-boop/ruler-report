// Widget engine: turns a catalog widget + an integration + a date range into a rendered value.
// Connectors only deliver *primitives* (daily sums, breakdown rows); every ratio (CTR, CPC, ROAS, bounce
// rate …) is derived here, so real connectors and the demo connector behave identically.
import { archetypeFor, type CatalogWidget } from '@/lib/catalog/build';
import type { VirtualPrim } from '@/lib/catalog/helpers';
import { connectorFor } from '@/lib/connectors';
import type { Campaign, DailyFilter } from './types';
import type {
  BreakdownRow,
  Calc,
  ChartValue,
  ConnectorContext,
  DailyData,
  DateRange,
  ErrorValue,
  Format,
  FunnelValue,
  NumberValue,
  TableValue,
  WidgetValue,
} from './types';
import { addDays, eachDay, rangeLength } from '@/lib/util/dates';

export type IntegrationCtx = ConnectorContext['integration'] & { currency: string };

const MONEY_NAMES = /^(spend|revenue|cpc|cpm|cost_per_.*|won_value|pipeline_value|aov|avg_deal|conversion_value|discounts|refunds|shipping|taxes)$/;
const PCT_NAMES = /(^ctr$|_rate$|^rate$|^win_rate$|^engagement_rate$|^lead_to_deal$)/;

export function formatForPrim(name: string): Format {
  if (MONEY_NAMES.test(name)) return 'currency';
  if (PCT_NAMES.test(name)) return 'percent';
  if (/^(position|frequency|roas|pages_per_session|items_per_order|rating)$/.test(name)) return 'decimal';
  if (/duration/.test(name) && !/total/.test(name)) return 'duration';
  return 'number';
}
const ACRONYM: Record<string, string> = { ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', roas: 'ROAS', aov: 'AOV', ctor: 'CTOR' };
export const labelForPrim = (name: string) =>
  name === '__rows' ? 'Records' : name.split('_').map((w, i) => ACRONYM[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

// ───────────── primitive expansion ─────────────
export interface PrimPlan {
  real: string[];
  virtual: Record<string, VirtualPrim>;
}
export function planPrims(slug: string, prims: string[]): PrimPlan {
  const arch = archetypeFor(slug);
  const virtual: Record<string, VirtualPrim> = {};
  const real = new Set<string>();
  for (const p of prims) {
    const v = arch?.virtual?.[p];
    if (v) {
      virtual[p] = v;
      real.add(v.num);
      real.add(v.den);
    } else real.add(p);
  }
  return { real: [...real], virtual };
}
export function widgetPrims(calc: Calc): string[] {
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
    default:
      return [];
  }
}

const NON_ADDITIVE = new Set(['reach', 'users']);

const isStock = (slug: string, prim: string) => !!archetypeFor(slug)?.prims[prim]?.stock;

// ───────────── fetch session (de-duplicates connector calls inside one report run) ─────────────
export class FetchSession {
  private daily = new Map<string, Promise<DailyData>>();
  private breakdowns = new Map<string, Promise<BreakdownRow[]>>();
  calls = 0;

  private dkey = (i: IntegrationCtx, r: DateRange, f?: DailyFilter, ids?: string[]) => `${i.id}|${r.start}|${r.end}|${f ? f.dimension + '=' + (Array.isArray(f.value) ? [...f.value].sort().join(',') : f.value) : ''}|${ids ? [...ids].sort().join(',') : ''}`;

  /** The campaigns of an ads account, once per session (connectors without the hook, or failing, give []). */
  private campaigns = new Map<number, Promise<Campaign[]>>();
  getCampaigns(i: IntegrationCtx): Promise<Campaign[]> {
    let p = this.campaigns.get(i.id);
    if (!p) {
      const c = connectorFor(i);
      p = c.listCampaigns ? c.listCampaigns({ integration: i }) : Promise.resolve([]);
      this.campaigns.set(i.id, p);
    }
    return p;
  }

  /** Tell the session which prims each integration will need so each (integration, range, filter) is fetched once. */
  private wanted = new Map<string, Set<string>>();
  want(i: IntegrationCtx, r: DateRange, f: DailyFilter | undefined, prims: string[], campaignIds?: string[]) {
    const k = this.dkey(i, r, f, campaignIds);
    const s = this.wanted.get(k) ?? new Set();
    prims.forEach((p) => s.add(p));
    this.wanted.set(k, s);
  }

  getDaily(i: IntegrationCtx, r: DateRange, f: DailyFilter | undefined, prims: string[], campaignIds?: string[]): Promise<DailyData> {
    const k = this.dkey(i, r, f, campaignIds);
    const want = this.wanted.get(k) ?? new Set<string>();
    prims.forEach((p) => want.add(p));
    const existing = this.daily.get(k);
    const have = (existing as any)?._prims as Set<string> | undefined;
    if (existing && have && prims.every((p) => have.has(p))) return existing;
    const list = [...want];
    const c = connectorFor(i);
    this.calls++;
    const pr = c.daily({ integration: i }, list, r, f, campaignIds);
    (pr as any)._prims = new Set(list);
    this.daily.set(k, pr);
    return pr;
  }

  getBreakdown(i: IntegrationCtx, dimension: string, prims: string[], r: DateRange, sortBy?: string, campaignIds?: string[]): Promise<BreakdownRow[]> {
    const k = `${i.id}|${dimension}|${[...prims].sort().join(',')}|${r.start}|${r.end}|${sortBy ?? ''}|${campaignIds ? [...campaignIds].sort().join(',') : ''}`;
    const hit = this.breakdowns.get(k);
    if (hit) return hit;
    const c = connectorFor(i);
    this.calls++;
    const pr = c.breakdown({ integration: i }, dimension, prims, r, { limit: 200, sortBy, campaignIds });
    this.breakdowns.set(k, pr);
    return pr;
  }
}

// ───────────── math ─────────────
function sumOf(d: DailyData, prim: string) {
  let t = 0;
  for (const k in d) t += d[k][prim] ?? 0;
  return t;
}
function aggVirtual(d: DailyData, v: VirtualPrim, complement = false) {
  const n = sumOf(d, v.num);
  const den = sumOf(d, v.den);
  const r = den === 0 ? 0 : (n / den) * (v.mult ?? 1);
  return complement ? 100 - r : r;
}
function pct(cur: number | null, prev: number | null) {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(2));
}
const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000);

function scalar(slug: string, calc: Calc, d: DailyData, plan: PrimPlan): number | null {
  const days = Object.keys(d).sort();
  if (days.length === 0) return null;
  switch (calc.kind) {
    case 'sum': {
      const v = plan.virtual[calc.prim];
      return round(v ? aggVirtual(d, v) : sumOf(d, calc.prim));
    }
    case 'avg': {
      const vals = days.map((k) => d[k][calc.prim] ?? 0);
      return round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    case 'latest':
      return d[days[days.length - 1]][calc.prim] ?? null;
    case 'delta':
      return (d[days[days.length - 1]][calc.prim] ?? 0) - (d[days[0]][calc.prim] ?? 0);
    case 'ratio': {
      const den = sumOf(d, calc.den);
      if (den === 0) return 0;
      const r = (sumOf(d, calc.num) / den) * (calc.mult ?? 1);
      return round(calc.complement ? 100 - r : r);
    }
    default:
      return null;
  }
}

/** per-day value for a prim (real or virtual) */
function dayValue(day: Record<string, number>, prim: string, plan: PrimPlan): number {
  const v = plan.virtual[prim];
  if (!v) return day[prim] ?? 0;
  const den = day[v.den] ?? 0;
  return den === 0 ? 0 : round(((day[v.num] ?? 0) / den) * (v.mult ?? 1));
}

function seriesChart(slug: string, calc: Extract<Calc, { kind: 'series' }>, d: DailyData, range: DateRange, plan: PrimPlan): ChartValue {
  const days = eachDay(range);
  const bucket = days.length > 120 ? 7 : 1;
  const labels: string[] = [];
  const series: number[][] = calc.prims.map(() => []);
  for (let i = 0; i < days.length; i += bucket) {
    const slice = days.slice(i, i + bucket);
    labels.push(slice[0]);
    calc.prims.forEach((p, pi) => {
      if (bucket === 1) {
        series[pi].push(dayValue(d[slice[0]] ?? {}, p, plan));
        return;
      }
      const sub: DailyData = {};
      slice.forEach((s) => (sub[s] = d[s] ?? {}));
      const v = plan.virtual[p];
      if (v) series[pi].push(round(aggVirtual(sub, v)));
      else if (isStock(slug, p)) series[pi].push(d[slice[slice.length - 1]]?.[p] ?? 0);
      else series[pi].push(round(sumOf(sub, p)));
    });
  }
  const agg = calc.prims.map((p) => (plan.virtual[p] ? 'avg' : isStock(slug, p) ? 'last' : 'sum') as 'sum' | 'avg' | 'last');
  return { type: 'chart', labels, series, seriesLabels: calc.labels ?? calc.prims.map(labelForPrim), agg };
}

export function rowValue(row: BreakdownRow, prim: string, plan: PrimPlan): number {
  const v = plan.virtual[prim];
  if (!v) return row.values[prim] ?? 0;
  const den = row.values[v.den] ?? 0;
  return den === 0 ? 0 : round(((row.values[v.num] ?? 0) / den) * (v.mult ?? 1));
}

// ───────────── public API ─────────────
export interface ResolveInput {
  integration: IntegrationCtx;
  widget: CatalogWidget;
  range: DateRange;
  comparison?: DateRange | null;
  session: FetchSession;
  /** campaign scope (spec v3 §2.2): every connector call is narrowed to these campaigns; the widget's own filter still applies */
  campaignIds?: string[];
}

export function errorFrom(e: unknown): ErrorValue {
  const msg = e instanceof Error ? e.message : String(e);
  if (/expired|invalid[_ ]token|unauthori[sz]ed|401|invalid_grant|OAuthException/i.test(msg)) return { type: 'error', code: 'expired_token', message: 'Credentials expired or revoked — reconnect the integration.' };
  return { type: 'error', code: 'provider_error', message: msg.slice(0, 300) };
}

export async function resolveWidget(inp: ResolveInput): Promise<WidgetValue> {
  const { integration, widget, range, comparison, session } = inp;
  const calc = widget.calc;
  const filter = widget.filter;
  const ids = inp.campaignIds;
  const scopeRows = (rows: BreakdownRow[], dimension: string) => (inp.campaignIds && dimension === 'campaign' ? rows.filter((r) => inp.campaignIds!.includes(r.key)) : rows);
  try {
    const plan = planPrims(integration.slug, widgetPrims(calc));
    const connector = connectorFor(integration);
    const missing = plan.real.filter((p) => connector.unsupported?.includes(p));
    if (missing.length) return { type: 'error', code: 'invalid_metrics_combination', message: `Not provided by this connector (${missing.join(', ')}).` };

    // non-additive totals (reach, unique users): ask the provider for the period total when it can
    if (calc.kind === 'sum' && NON_ADDITIVE.has(calc.prim) && connector.totals) {
      const cur = (await connector.totals({ integration }, [calc.prim], range, ids))[calc.prim] ?? null;
      const out: NumberValue = { type: 'number', value: cur };
      if (comparison) {
        const prev = (await connector.totals({ integration }, [calc.prim], comparison, ids))[calc.prim] ?? null;
        out.comparison = { value: prev, change_pct: pct(cur, prev), absolute: cur != null && prev != null ? round(cur - prev) : null };
      }
      return out;
    }
    switch (calc.kind) {
      case 'sum':
      case 'avg':
      case 'latest':
      case 'delta':
      case 'ratio': {
        const d = await session.getDaily(integration, range, filter, plan.real, ids);
        const value = scalar(integration.slug, calc, d, plan);
        const out: NumberValue = { type: 'number', value };
        if (comparison) {
          const dc = await session.getDaily(integration, comparison, filter, plan.real, ids);
          const prev = scalar(integration.slug, calc, dc, plan);
          out.comparison = { value: prev, change_pct: pct(value, prev), absolute: value != null && prev != null ? round(value - prev) : null };
        }
        return out;
      }
      case 'series': {
        const d = await session.getDaily(integration, range, filter, plan.real, ids);
        const out = seriesChart(integration.slug, calc, d, range, plan);
        if (comparison) {
          const dc = await session.getDaily(integration, comparison, filter, plan.real, ids);
          const cc = seriesChart(integration.slug, calc, dc, comparison, plan);
          out.comparison = { series: cc.series };
        }
        return out;
      }
      case 'chart_breakdown': {
        const rows = scopeRows(await session.getBreakdown(integration, calc.dimension, plan.real, range, plan.real[0], ids), calc.dimension);
        let ordered = rows;
        if (calc.order) ordered = calc.order.map((l) => rows.find((r) => (r.label ?? r.key) === l)).filter(Boolean) as BreakdownRow[];
        return {
          type: 'chart',
          labels: ordered.map((r) => r.label ?? r.key),
          series: calc.prims.map((p) => ordered.map((r) => rowValue(r, p, plan))),
          seriesLabels: calc.labels ?? calc.prims.map(labelForPrim),
        } satisfies ChartValue;
      }
      case 'breakdown': {
        const rows = scopeRows(await session.getBreakdown(integration, calc.dimension, plan.real, range, calc.sortBy && !plan.virtual[calc.sortBy] ? calc.sortBy : plan.real[0], ids), calc.dimension);
        const cols = calc.columns;
        const sortBy = calc.sortBy ?? cols[0];
        const computed = rows.map((r) => ({ r, vals: cols.map((c) => rowValue(r, c, plan)) }));
        const si = Math.max(0, cols.indexOf(sortBy));
        const asc = sortBy === 'position';
        computed.sort((a, b) => (asc ? a.vals[si] - b.vals[si] : b.vals[si] - a.vals[si]));
        const limited = computed.slice(0, calc.limit ?? 25);
        return {
          type: 'table',
          columns: [calc.dimension, ...cols],
          columnLabels: [labelForPrim(calc.dimension), ...(calc.labels ?? cols.map(labelForPrim))],
          columnFormats: ['text', ...cols.map(formatForPrim)],
          rows: limited.map((x) => [x.r.label ?? x.r.key, ...x.vals]),
          total_rows: computed.length,
        } satisfies TableValue;
      }
      case 'funnel': {
        const real = calc.steps.map((s) => s.prim);
        const d = await session.getDaily(integration, range, filter, real, ids);
        const dc = comparison ? await session.getDaily(integration, comparison, filter, real, ids) : null;
        return {
          type: 'funnel',
          steps: calc.steps.map((s) => {
            const v = round(sumOf(d, s.prim));
            const prev = dc ? round(sumOf(dc, s.prim)) : null;
            return { label: s.label, value: v, ...(dc ? { comparison: { value: prev, change_pct: pct(v, prev) } } : {}) };
          }),
        } satisfies FunnelValue;
      }
      default:
        return { type: 'error', code: 'invalid_metrics_combination', message: `Unsupported widget calc: ${calc.kind}` };
    }
  } catch (e) {
    return errorFrom(e);
  }
}

/** Register the prims every widget will need, so connectors get one batched call per (integration, range, filter). */
export function planFetches(session: FetchSession, integration: IntegrationCtx, widgets: CatalogWidget[], range: DateRange, comparison?: DateRange | null, campaignIds?: string[]) {
  for (const w of widgets) {
    if (!['sum', 'avg', 'latest', 'delta', 'ratio', 'series', 'funnel'].includes(w.calc.kind)) continue;
    const plan = planPrims(integration.slug, widgetPrims(w.calc));
    session.want(integration, range, w.filter, plan.real, campaignIds);
    if (comparison) session.want(integration, comparison, w.filter, plan.real, campaignIds);
  }
}

export { addDays, rangeLength };
