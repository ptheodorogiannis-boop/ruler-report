// Campaign table settings applied at compose time (review C1): the store keeps the full, unsorted row set per
// (account, metrics, scope); hidden campaigns, the sort column and the row limit are per-widget settings and apply
// here, so changing them never re-fetches. Browser-safe (used by compose on the client too).
import type { ContainerValue } from '@/lib/engine/types';
import { MAX_CONTAINER_ROWS, type WidgetCustom } from './types';

/** Descending by the metric at `si`; rows without a value sort last, and two such rows are equal (no NaN). */
export const byMetricDesc =
  (si: number) =>
  <R extends { values: (number | null)[] }>(a: R, b: R): number => {
    const av = a.values[si];
    const bv = b.values[si];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  };

export function applyContainerCustom(v: ContainerValue, c: Pick<WidgetCustom, 'sortBy' | 'rows' | 'hiddenCampaigns'> | undefined): ContainerValue {
  const hidden = new Set(c?.hiddenCampaigns ?? []);
  const keys = v.metrics.map((m) => m.key);
  const sortKey = c?.sortBy && keys.includes(c.sortBy) ? c.sortBy : keys[0];
  const si = Math.max(0, keys.indexOf(sortKey));
  const rows = v.rows.filter((r) => !hidden.has(r.id)).sort(byMetricDesc(si));
  const limit = Math.max(1, Math.min(MAX_CONTAINER_ROWS, c?.rows ?? 10));
  return { ...v, rows: rows.slice(0, limit), truncated: (v.truncated ?? 0) + Math.max(0, rows.length - limit) };
}
