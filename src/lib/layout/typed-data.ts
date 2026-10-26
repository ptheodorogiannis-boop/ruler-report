// Typed data for a custom chart (spec §6): text pasted from a spreadsheet (TSV, CSV or semicolon-separated) becomes
// labels and series. The first row holds the headers, the first column the labels; numbers follow the project's
// decimal format; blank cells are null.
import { parseCsv, parseNumber } from '@/lib/util/csv';
import type { WidgetCustom } from './types';

export type TypedData = NonNullable<WidgetCustom['manual']>;

export function parseTyped(text: string, decimal: 'comma_dot' | 'dot_comma'): TypedData {
  const src = text.replace(/\r\n?/g, '\n').trim();
  if (!src) return { labels: [], series: [] };
  const delimiter = src.includes('\t') ? '\t' : src.includes(';') ? ';' : ',';
  const rows = parseCsv(src, delimiter).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length < 2) return { labels: [], series: [] };
  const header = rows[0].map((h) => String(h ?? '').trim());
  const body = rows.slice(1);
  const labels = body.map((r) => String(r[0] ?? '').trim());
  const sep = decimal === 'dot_comma' ? 'comma' : 'dot';
  const series = header.slice(1).map((label, i) => ({
    label: label || `Series ${i + 1}`,
    values: body.map((r) => {
      const raw = String(r[i + 1] ?? '').trim();
      return raw === '' ? null : parseNumber(raw, sep);
    }),
  }));
  return { labels, series };
}

/** The reverse: a TSV block the editor can show in its textarea and the user can paste back into a spreadsheet. */
export function formatTyped(d: TypedData | undefined, decimal: 'comma_dot' | 'dot_comma'): string {
  if (!d || !d.labels.length) return '';
  const num = (v: number | null) => (v == null ? '' : decimal === 'dot_comma' ? String(v).replace('.', ',') : String(v));
  const head = ['Label', ...d.series.map((s) => s.label)].join('\t');
  const lines = d.labels.map((l, i) => [l, ...d.series.map((s) => num(s.values[i] ?? null))].join('\t'));
  return [head, ...lines].join('\n');
}
