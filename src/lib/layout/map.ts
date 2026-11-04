// Map widget (map_v1, docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §1): countries coloured by one
// "by country" metric, and a panel with up to six more for the country the client picks. Pure, like compare.ts: the
// engine asks `mapRefs` what to fetch (existing country breakdowns), compose joins the fetched values by ISO code with
// `mapValue`. Both read the same list, so they can never disagree.
import type { ErrorValue, MapMetric, MapValue, RenderedBlock } from '@/lib/engine/types';
import { countryName, toCountryCode } from '@/lib/geo/countries';
import type { LayoutWidget, MetricRef } from './types';

export const MAX_MAP_PANEL = 6;

const same = (a: MetricRef, b: MetricRef) => a.integrationId === b.integrationId && a.key === b.key;

/** The colour metric first, then the panel metrics that differ from it (no repeats, at most six). */
export function mapRefs(w: Pick<LayoutWidget, 'custom'>): MetricRef[] {
  const c = w.custom ?? {};
  if (!c.mapShade) return [];
  const panel: MetricRef[] = [];
  for (const r of c.mapPanel ?? []) {
    if (same(r, c.mapShade) || panel.some((p) => same(p, r))) continue;
    if (panel.length >= MAX_MAP_PANEL) break;
    panel.push(r);
  }
  return [c.mapShade, ...panel];
}

/** Four thresholds between five colour steps: the 20th, 40th, 60th and 80th percentiles (linear between ranks). */
export function colourSteps(values: number[]): number[] {
  if (!values.length) return [];
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const pos = (v.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };
  return [0.2, 0.4, 0.6, 0.8].map(at);
}

const invalid = (message: string): ErrorValue => ({ type: 'error', code: 'invalid_metrics_combination', message });

/** The map's countries and panel columns, built from the stored country breakdowns. */
export function mapValue(w: Pick<LayoutWidget, 'custom'>, lookup: (ref: MetricRef) => RenderedBlock | undefined): MapValue | ErrorValue {
  const refs = mapRefs(w);
  if (!refs.length) return invalid('Pick a metric to colour the countries by.');
  const shadeBlock = lookup(refs[0]);
  if (!shadeBlock) return invalid('Loading…');
  if (shadeBlock.widget.value.type === 'error') return shadeBlock.widget.value;
  if (shadeBlock.widget.value.type !== 'chart') return invalid('Pick a "by country" metric.');

  const blocks = refs.map(lookup);
  const metrics: MapMetric[] = blocks.map((b, i) => ({
    label: b?.widget.label ?? refs[i].key,
    format: b?.widget.format ?? 'number',
    ...(b?.widget.currency ? { currency: b.widget.currency } : {}),
    platform: b?.platform ?? '',
    slug: b?.slug ?? '',
    ...(!b ? { error: 'Loading…' } : b.widget.value.type === 'error' ? { error: b.widget.value.message } : b.widget.value.type !== 'chart' ? { error: 'Not a "by country" metric.' } : {}),
  }));
  const empty = () => metrics.map((): number | null => null);
  const countries = new Map<string, MapValue['countries'][number]>();
  const unmatched = new Map<string, MapValue['unmatched'][number]>();
  const add = (cur: number | null, x: number | null | undefined) => (x == null ? cur : (cur ?? 0) + x);
  blocks.forEach((b, i) => {
    const v = b?.widget.value;
    if (v?.type !== 'chart') return;
    v.labels.forEach((label, j) => {
      const value = v.series[0]?.[j] ?? null;
      const previous = v.comparison?.series[0]?.[j] ?? null;
      const code = toCountryCode(label);
      if (!code) {
        const row = unmatched.get(label) ?? { label, values: empty() };
        row.values[i] = add(row.values[i], value);
        unmatched.set(label, row);
        return;
      }
      // two labels for one country (a name and a code) add up
      const row = countries.get(code) ?? { code, name: countryName(code, 'en'), values: empty(), previous: empty() };
      row.values[i] = add(row.values[i], value);
      row.previous[i] = add(row.previous[i], previous);
      countries.set(code, row);
    });
  });
  const list = [...countries.values()].sort((a, b) => (b.values[0] ?? -Infinity) - (a.values[0] ?? -Infinity));
  const shaded = list.map((c) => c.values[0]).filter((x): x is number => x != null);
  return { type: 'map', shade: metrics[0], metrics, countries: list, unmatched: [...unmatched.values()], steps: colourSteps(shaded) };
}
