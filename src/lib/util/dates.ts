import type { DateRange } from '@/lib/engine/types';

const MS = 86400000;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmtDate(new Date(parseDate(s).getTime() + n * MS));
export const diffDays = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS);
export const today = (tz = 'UTC') => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return fmtDate(new Date());
  }
};
export const eachDay = (r: DateRange): string[] => {
  const out: string[] = [];
  const n = diffDays(r.start, r.end);
  for (let i = 0; i <= n; i++) out.push(addDays(r.start, i));
  return out;
};
export const rangeLength = (r: DateRange) => diffDays(r.start, r.end) + 1;

/** The period immediately before `r`, same length. */
export const previousPeriod = (r: DateRange): DateRange => {
  const len = rangeLength(r);
  return { start: addDays(r.start, -len), end: addDays(r.start, -1) };
};
/** Same dates one year earlier. */
export const previousYear = (r: DateRange): DateRange => {
  const s = parseDate(r.start);
  const e = parseDate(r.end);
  s.setUTCFullYear(s.getUTCFullYear() - 1);
  e.setUTCFullYear(e.getUTCFullYear() - 1);
  return { start: fmtDate(s), end: fmtDate(e) };
};

export type Preset = 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d' | 'this_month' | 'previous_month' | 'this_quarter' | 'year_to_date' | 'custom';
export const PRESET_LABEL: Record<Preset, string> = {
  last_7d: 'Last 7 days',
  last_14d: 'Last 14 days',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  this_month: 'This month',
  previous_month: 'Previous month',
  this_quarter: 'This quarter',
  year_to_date: 'Year to date',
  custom: 'Custom',
};

export function presetRange(p: Preset, tz = 'UTC', now?: string): DateRange {
  const t = now ?? today(tz);
  const d = parseDate(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const yesterday = addDays(t, -1);
  switch (p) {
    case 'last_7d':
      return { start: addDays(yesterday, -6), end: yesterday };
    case 'last_14d':
      return { start: addDays(yesterday, -13), end: yesterday };
    case 'last_30d':
      return { start: addDays(yesterday, -29), end: yesterday };
    case 'last_90d':
      return { start: addDays(yesterday, -89), end: yesterday };
    case 'this_month':
      return { start: fmtDate(new Date(Date.UTC(y, m, 1))), end: t };
    case 'previous_month':
      return { start: fmtDate(new Date(Date.UTC(y, m - 1, 1))), end: fmtDate(new Date(Date.UTC(y, m, 0))) };
    case 'this_quarter':
      return { start: fmtDate(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))), end: t };
    case 'year_to_date':
      return { start: `${y}-01-01`, end: t };
    default:
      return { start: addDays(yesterday, -29), end: yesterday };
  }
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s).getTime());

export function formatDisplayDate(s: string, format = 'DD/MM/YYYY') {
  const [y, m, d] = s.split('-');
  return format.replace('YYYY', y).replace('MM', m).replace('DD', d);
}
