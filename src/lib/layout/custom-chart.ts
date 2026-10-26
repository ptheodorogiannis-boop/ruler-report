// A custom chart (spec §6): series taken from chart metrics of any connected account (the "per day" widgets already in
// the report's store), or data typed into the editor. Pure: the engine resolves the references, this file only combines.
import type { ChartValue, ErrorValue, RenderedBlock } from '@/lib/engine/types';
import type { DateRange } from '@/lib/engine/types';
import type { LayoutWidget, MetricRef, WidgetCustom } from './types';
import { DEFAULT_PALETTE } from './theme';
import { scopeHash, type CampaignScope } from '@/lib/engine/campaigns';

const isoDate = (l: string) => /^\d{4}-\d{2}-\d{2}$/.test(l);
const key = (integrationId: number, k: string, period?: DateRange, scope?: CampaignScope) => {
  const h = scope ? scopeHash(scope) : '';
  return `${integrationId}:${k}${period ? `@${period.start}..${period.end}` : ''}${h ? `#${h}` : ''}`;
};
/** A ref to the block's own account reads the scoped value (review I8); anything else, or an older snapshot, the plain one. */
const lookup = (idx: Map<string, RenderedBlock>, ref: MetricRef, period: DateRange | undefined, scope?: CampaignScope, blockIntegrationId = 0) =>
  (scope && ref.integrationId === blockIntegrationId ? idx.get(key(ref.integrationId, ref.key, period, scope)) : undefined) ?? idx.get(key(ref.integrationId, ref.key, period));

/** Union of labels (dates sorted, other labels in first-seen order); every series is realigned on it, gaps are null. */
export function mergeSeries(parts: { labels: string[]; values: (number | null)[] }[]): { labels: string[]; series: (number | null)[][] } {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const p of parts) for (const l of p.labels) if (!seen.has(l)) (seen.add(l), labels.push(l));
  if (labels.length && labels.every(isoDate)) labels.sort();
  const series = parts.map((p) => {
    const m = new Map<string, number | null>();
    p.labels.forEach((l, i) => m.set(l, p.values[i] ?? null));
    return labels.map((l) => (m.has(l) ? (m.get(l) as number | null) : null));
  });
  return { labels, series };
}

const pending = (message: string): ErrorValue => ({ type: 'error', code: 'pending', message });

export function customChartValue(w: LayoutWidget, idx: Map<string, RenderedBlock>, scope?: CampaignScope, blockIntegrationId = 0): ChartValue | ErrorValue {
  const c = w.custom ?? {};
  if (c.manual && c.manual.labels.length) {
    const labels = c.manual.labels;
    return {
      type: 'chart',
      labels,
      series: c.manual.series.map((s) => labels.map((_, i) => s.values[i] ?? null)) as number[][],
      seriesLabels: c.manual.series.map((s) => s.label),
      agg: c.manual.series.map(() => 'sum' as const),
    };
  }
  const refs = c.series ?? [];
  if (!refs.length) return pending('Pick the metrics to chart, or type your data.');
  const parts: { labels: string[]; values: (number | null)[] }[] = [];
  const names: string[] = [];
  const aggs: ('sum' | 'avg' | 'last')[] = [];
  const comps: ((number | null)[] | null)[] = [];
  for (const ref of refs) {
    const b = lookup(idx, ref, c.period, scope, blockIntegrationId);
    if (!b) continue; // not resolved yet: the engine fetches it on save
    const v = b.widget.value;
    if (v.type === 'error') return v; // the real reason (account not connected, provider failure) beats a wrong diagnosis
    if (v.type !== 'chart') return { type: 'error', code: 'invalid_metrics_combination', message: `"${ref.key}" is not a chart metric; pick a "per day" metric, or use a KPI widget for it.` };
    // one series per ref, unless the source carries several and the ref has no label of its own
    const take = ref.label || v.series.length <= 1 ? [0] : v.series.map((_, i) => i);
    for (const si of take) {
      parts.push({ labels: v.labels, values: v.series[si] ?? [] });
      names.push(ref.label ?? (take.length > 1 ? (v.seriesLabels?.[si] ?? `${b.widget.label} ${si + 1}`) : b.widget.label));
      aggs.push(v.agg?.[si] ?? 'sum');
      comps.push(v.comparison?.series?.[si] ?? null);
    }
  }
  if (!parts.length) return pending('Loading…');
  const merged = mergeSeries(parts);
  const out: ChartValue = { type: 'chart', labels: merged.labels, series: merged.series as number[][], seriesLabels: names, agg: aggs };
  if (comps.every((s) => s)) out.comparison = { series: mergeSeries(parts.map((p, i) => ({ labels: p.labels, values: comps[i] as (number | null)[] }))).series as number[][] };
  return out;
}

/** The chart palette with the colours chosen per series in the panel (series i → slot i); the palette as is when none is set. */
export function seriesColors(series: WidgetCustom['series'], palette: string[] | undefined): string[] | undefined {
  if (!series?.some((s) => s.color)) return palette;
  const base = palette ?? DEFAULT_PALETTE;
  const out = base.slice();
  series.forEach((s, i) => {
    if (s.color) out[i] = s.color;
    else if (out[i] == null) out[i] = base[i % base.length];
  });
  return out;
}

/** The format of a custom chart: the first resolved source's, unless the settings say otherwise. */
export function customChartFormat(w: LayoutWidget, idx: Map<string, RenderedBlock>, scope?: CampaignScope, blockIntegrationId = 0): RenderedBlock['widget']['format'] {
  if (w.custom?.format) return w.custom.format;
  for (const ref of w.custom?.series ?? []) {
    const b = lookup(idx, ref, w.custom?.period, scope, blockIntegrationId);
    if (b) return b.widget.format;
  }
  return 'number';
}
