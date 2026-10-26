// Metric references a widget carries inside its settings (custom chart series, infographic refs). Pure; shared by the
// layout save (which accounts a report uses), the engine (what to fetch) and the live-dashboard cache key, so the three
// can never disagree about what a widget needs.
import type { LayoutWidget, MetricRef } from './types';

/** Every account + metric reference inside a widget's settings, in a stable order. */
export function widgetRefs(w: Pick<LayoutWidget, 'slug' | 'custom'>): MetricRef[] {
  const c = w.custom;
  if (!c) return [];
  if (w.slug === 'custom_chart') return (c.series ?? []).map((s) => ({ integrationId: s.integrationId, key: s.key }));
  if (w.slug === 'infographic') return [c.ref, c.ref2, c.tableRef].filter((r): r is MetricRef => !!r).map((r) => ({ integrationId: r.integrationId, key: r.key }));
  return [];
}

/** The distinct account ids those references point at. */
export function widgetRefIds(w: Pick<LayoutWidget, 'slug' | 'custom'>): number[] {
  return [...new Set(widgetRefs(w).map((r) => r.integrationId))];
}
