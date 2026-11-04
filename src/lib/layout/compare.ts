// Comparison container (compare_v1, docs/DESIGN.md › Ruler glass pass): the user picks ONE metric and compares it
// across chosen periods (this period, the previous one, the same period a year ago, up to four custom periods) or across
// accounts, instead of comparing the whole report. Pure: the engine asks `compareNeeds` what to fetch, compose turns the
// fetched values into a CompareValue with `compareValue`. Both read the same list, so they can never disagree.
import type { CompareValue, DateRange, Format, RenderedBlock } from '@/lib/engine/types';
import { previousPeriod, previousYear } from '@/lib/util/dates';
import type { LayoutWidget, MetricRef } from './types';

export const MAX_COMPARE_PERIODS = 4;
export const MAX_COMPARE_REFS = 8;

export interface ComparePeriod {
  token: 'current' | 'previous' | 'yearAgo' | 'custom';
  label?: string;
  /** undefined is the report's own period (its value is stored without a period suffix) */
  range?: DateRange;
  shown: DateRange;
}

/** The periods a periods-mode comparison shows, the report's own period first. */
export function comparePeriods(w: Pick<LayoutWidget, 'custom'>, range: DateRange, comparison: DateRange | null): ComparePeriod[] {
  const c = w.custom ?? {};
  const out: ComparePeriod[] = [{ token: 'current', shown: range }];
  if (c.comparePrevious !== false) {
    const prev = comparison ?? previousPeriod(range);
    out.push({ token: 'previous', range: prev, shown: prev });
  }
  if (c.compareYearAgo) {
    const ya = previousYear(range);
    out.push({ token: 'yearAgo', range: ya, shown: ya });
  }
  for (const p of (c.comparePeriods ?? []).slice(0, MAX_COMPARE_PERIODS)) {
    if (!p.start || !p.end || p.start > p.end) continue;
    const r = { start: p.start, end: p.end };
    out.push({ token: 'custom', label: p.label, range: r, shown: r });
  }
  return out;
}

/** Every (metric, period) value the widget needs. The engine fetches each one; the base period has no period suffix. */
export function compareNeeds(w: Pick<LayoutWidget, 'custom'>, range: DateRange, comparison: DateRange | null): { ref: MetricRef; period?: DateRange }[] {
  const c = w.custom ?? {};
  if (!c.ref) return [];
  if ((c.compareMode ?? 'periods') === 'accounts') return [c.ref, ...(c.compareRefs ?? []).slice(0, MAX_COMPARE_REFS)].map((ref) => ({ ref }));
  return comparePeriods(w, range, comparison).map((p) => ({ ref: c.ref!, period: p.range }));
}

/** Every account + metric the widget refers to (for the report's account list and the live-dashboard cache key). */
export function compareRefs(w: Pick<LayoutWidget, 'custom'>): MetricRef[] {
  const c = w.custom ?? {};
  if (!c.ref) return [];
  return (c.compareMode ?? 'periods') === 'accounts' ? [c.ref, ...(c.compareRefs ?? []).slice(0, MAX_COMPARE_REFS)] : [c.ref];
}

const pct = (cur: number | null, prev: number | null) => (cur == null || prev == null ? null : prev === 0 ? (cur === 0 ? 0 : null) : Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(2)));
const numberOf = (b: RenderedBlock | undefined) => (b?.widget.value.type === 'number' ? b.widget.value : undefined);
const errorOf = (b: RenderedBlock | undefined) => (!b ? 'Loading…' : b.widget.value.type === 'error' ? b.widget.value.message : b.widget.value.type !== 'number' ? 'Not a number metric.' : undefined);

/** The comparison's columns, built from the stored values (lookup by metric and period). */
export function compareValue(w: Pick<LayoutWidget, 'custom'>, lookup: (ref: MetricRef, period?: DateRange) => RenderedBlock | undefined, range: DateRange, comparison: DateRange | null): CompareValue | { type: 'error'; code: 'invalid_metrics_combination'; message: string } {
  const c = w.custom ?? {};
  if (!c.ref) return { type: 'error', code: 'invalid_metrics_combination', message: 'Choose the metric to compare.' };
  const mode = c.compareMode ?? 'periods';
  const first = lookup(c.ref);
  const format: Format = (c.format ?? first?.widget.format ?? 'number') as Format;
  if (mode === 'periods') {
    const periods = comparePeriods(w, range, comparison);
    const base = numberOf(lookup(c.ref, periods[0].range))?.value ?? null;
    const columns: CompareValue['columns'] = periods.map((p, i) => {
      const b = lookup(c.ref!, p.range);
      const v = numberOf(b)?.value ?? null;
      return {
        label: p.label ?? '',
        token: p.token,
        range: p.shown,
        value: v,
        ...(i === 0 ? { base: true } : { change_pct: pct(base, v), absolute: base != null && v != null ? base - v : null }),
        ...(errorOf(b) ? { error: errorOf(b) } : {}),
      };
    });
    return { type: 'compare', mode, format, columns };
  }
  const refs = compareRefs(w);
  const columns: CompareValue['columns'] = refs.map((ref, i) => {
    const b = lookup(ref);
    const n = numberOf(b);
    const label = b ? [b.account_name || b.platform, b.widget.label].filter(Boolean).join(' · ') : `${ref.key}`;
    return {
      label,
      platform: b?.platform,
      slug: b?.slug,
      ...(b ? { format: b.widget.format as Format, currency: b.widget.currency } : {}),
      value: n?.value ?? null,
      change_pct: n?.comparison?.change_pct ?? null,
      absolute: n?.comparison?.absolute ?? null,
      ...(i === 0 ? { base: true } : {}),
      ...(errorOf(b) ? { error: errorOf(b) } : {}),
    };
  });
  // a sum only means something for additive formats over the same kind of metric
  const same = columns.every((col) => (col.format ?? format) === format && (col.currency ?? columns[0].currency) === columns[0].currency);
  const additive = same && format !== 'percent' && format !== 'decimal' && columns.every((col) => col.value != null);
  const total = additive && columns.length > 1 ? columns.reduce((t, col) => t + (col.value ?? 0), 0) : null;
  return { type: 'compare', mode, format, columns, ...(total != null ? { total } : {}) };
}
