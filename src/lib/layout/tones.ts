// The Quantix tones on client-facing pages (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §4): the KPI
// tiles of the first block that has KPIs are grey (smoke) and read as the overview; tables and bar charts sit on dark
// (solid) tiles with one highlighted bar; everything else stays glass. The Look option `tones: 'glass'` turns it off.
import type { RenderedBlock } from '@/lib/engine/types';
import type { ReportTheme, WidgetCustom } from './types';

export type Tone = 'smoke' | 'solid';
/** written out in full, so Tailwind keeps both classes (it drops component classes it cannot find in the source) */
export const TONE_CLASS: Record<Tone, string> = { smoke: 'tone-smoke', solid: 'tone-solid' };

const isDate = (s: string | undefined) => /^\d{4}-\d{2}(-\d{2})?$/.test(s ?? '');

/** How a chart widget draws: over time or by category, as bars or not, a pie or not (the card and the tones agree). */
export function chartShape(b: RenderedBlock): { time: boolean; pie: boolean; bars: boolean } {
  const v = b.widget.value;
  const c = (b.custom ?? {}) as WidgetCustom;
  const time = v.type === 'chart' && isDate(v.labels[0]);
  const pie = c.chartType ? c.chartType === 'pie' || c.chartType === 'donut' : /gender|device|platform|content_type|payment/i.test(b.widget.key);
  const bars = !pie && (time ? c.chartType === 'bar' || c.chartType === 'stacked' : c.chartType !== 'line' && c.chartType !== 'area');
  return { time, pie, bars };
}

/** The tile tone of one block; `headline` marks the first block that has KPI tiles. */
export function blockTone(headline: boolean, b: RenderedBlock, tones: ReportTheme['tones']): Tone | undefined {
  if (tones === 'glass') return undefined;
  const t = b.widget.value.type;
  if (t === 'number') return headline ? 'smoke' : undefined;
  if (t === 'table') return 'solid';
  if (t === 'chart' && chartShape(b).bars) return 'solid';
  return undefined;
}
