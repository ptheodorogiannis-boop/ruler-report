// Pure rules of a report's period change (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §2), shared by
// the editor's period control (client) and the service that applies the change (src/lib/services/report-period.ts).
import type { DateRange } from '@/lib/engine/types';
import { fmtDate, isDate, parseDate, previousPeriod, previousYear } from '@/lib/util/dates';

export type ComparisonChoice = 'previous_period' | 'previous_year' | 'none' | DateRange;

const same = (a: DateRange, b: DateRange) => a.start === b.start && a.end === b.end;
/** A real calendar day: isDate lets 2026-13-01 through (Date.UTC rolls it into January). */
export const realDay = (s: string) => isDate(s) && fmtDate(parseDate(s)) === s;

/** The comparison rule a stored comparison follows; anything else is a custom range. */
export function inferComparison(range: DateRange, comparison: DateRange | null): 'previous_period' | 'previous_year' | 'none' | 'custom' {
  if (!comparison) return 'none';
  if (same(comparison, previousPeriod(range))) return 'previous_period';
  if (same(comparison, previousYear(range))) return 'previous_year';
  return 'custom';
}

/** The comparison range for a choice; a custom one must be two real days in order. */
export function comparisonFor(range: DateRange, choice: ComparisonChoice): DateRange | null {
  if (choice === 'none') return null;
  if (choice === 'previous_period') return previousPeriod(range);
  if (choice === 'previous_year') return previousYear(range);
  if (!realDay(choice.start) || !realDay(choice.end) || choice.start > choice.end) throw new Error('Invalid comparison period');
  return { start: choice.start, end: choice.end };
}

/** A card or widget setting without its "written for" note (an edit makes the text current again). */
export function withoutStale<T extends { staleFor?: DateRange }>(x: T): T {
  const { staleFor: _s, ...rest } = x;
  return rest as T;
}
