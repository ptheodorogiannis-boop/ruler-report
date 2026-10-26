import type { ReportData } from '@/lib/engine/types';
import { metricLabel } from '@/lib/catalog/labels';
import type { Locale } from '@/lib/i18n';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Flattens a rendered report into a tidy CSV (one row per KPI / table row / chart point) — handy for Sheets & BI tools. */
export function reportToCsv(data: ReportData, locale: Locale = 'en'): string {
  const rows: unknown[][] = [['section', 'platform', 'account', 'metric', 'kind', 'label', 'value', 'previous', 'change_pct']];
  for (const s of data.sections)
    for (const b of s.blocks) {
      const w = b.widget;
      const v = w.value;
      const head = [s.title, b.platform, b.account_name, (b.custom as { title?: string } | undefined)?.title ? w.label : metricLabel({ reference_key: w.reference_key, title: w.label }, locale)];
      if (v.type === 'number') rows.push([...head, 'number', '', v.value, v.comparison?.value ?? '', v.comparison?.change_pct ?? '']);
      else if (v.type === 'chart') v.labels.forEach((l, i) => v.series.forEach((ser, si) => rows.push([...head, 'chart', `${l}${v.series.length > 1 ? ` · ${v.seriesLabels?.[si] ?? si}` : ''}`, ser[i], '', ''])));
      else if (v.type === 'table') v.rows.forEach((r) => v.columnLabels.slice(1).forEach((c, ci) => rows.push([...head, 'table', `${r[0]} · ${c}`, r[ci + 1], '', ''])));
      else if (v.type === 'funnel') v.steps.forEach((st) => rows.push([...head, 'funnel', st.label, st.value, st.comparison?.value ?? '', st.comparison?.change_pct ?? '']));
      else if (v.type === 'text') rows.push([...head, 'text', '', v.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), '', '']);
      else if (v.type === 'tile') {
        if (v.items?.length) v.items.forEach((it) => rows.push([...head, 'tile', it.label, it.value, '', '']));
        else rows.push([...head, 'tile', v.kind, v.value ?? '', v.target ?? v.comparison?.value ?? '', v.comparison?.change_pct ?? '']);
      } else if (v.type === 'image') rows.push([...head, 'image', v.alt, v.url, '', '']);
      else if (v.type === 'container') v.rows.forEach((r) => v.metrics.forEach((m, mi) => rows.push([...head, 'campaign', `${r.name} · ${m.label}`, r.values[mi] ?? '', r.comparison?.[mi] ?? '', ''])));
    }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
