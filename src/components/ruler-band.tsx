// The signature element: the report period drawn as a measuring scale (docs/DESIGN.md › Signature).
// Server-safe SVG: one tick per day (per week above 60 days, per month above a year), tall ticks on Mondays
// and on the 1st, the comparison period as a dashed hairline beneath. Reveal animation is CSS only.
import type { DateRange } from '@/lib/engine/types';
import { diffDays, eachDay, formatDisplayDate, parseDate } from '@/lib/util/dates';

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Short month names for the band's labels: English by default, the locale's through Intl otherwise (spec v3 §5). */
export function monthNames(locale?: string): string[] {
  if (!locale || locale === 'en') return MONTH_EN;
  try {
    const f = new Intl.DateTimeFormat(locale === 'el' ? 'el-GR' : locale, { month: 'short', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2026, m, 15))).replace(/\.$/, ''));
  } catch {
    return MONTH_EN;
  }
}
const human = (d: string, MONTH = MONTH_EN) => {
  const dt = parseDate(d);
  return `${dt.getUTCDate()} ${MONTH[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};
const spanLabel = (r: DateRange, short = false, MONTH = MONTH_EN) => {
  const a = parseDate(r.start);
  const b = parseDate(r.end);
  if (short && a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() !== b.getUTCMonth()) return `${a.getUTCDate()} ${MONTH[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTH[b.getUTCMonth()]}`;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    const full = a.getUTCDate() === 1 && b.getUTCDate() === new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
    return full ? `${MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()}` : `${a.getUTCDate()}–${b.getUTCDate()} ${MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${a.getUTCDate()} ${MONTH[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTH[b.getUTCMonth()]} ${a.getUTCFullYear()}`;
  return `${human(r.start, MONTH)} – ${human(r.end, MONTH)}`;
};

export function RulerBand({ range, comparison, size = 'lg', dateFormat, className = '', live, marker, locale, labels }: { /** month names and the band's words follow this locale (spec v3 §5) */ locale?: string; labels?: { live?: string; comparedWith?: string }; range: DateRange; comparison?: DateRange | null; size?: 'lg' | 'sm'; dateFormat?: string; className?: string; live?: boolean; /** a date inside the range to mark (today on a live dashboard); it breathes slowly when `live` */ marker?: string }) {
  const days = eachDay(range);
  const n = days.length;
  const unit: 'day' | 'week' | 'month' = n <= 62 ? 'day' : n <= 370 ? 'week' : 'month';
  const h = size === 'lg' ? 40 : 22;
  const base = h - 1;
  const minor = size === 'lg' ? 10 : 6;
  const major = size === 'lg' ? 22 : 12;
  const ticks: { x: number; tall: boolean; label?: string }[] = [];
  days.forEach((d, i) => {
    const dt = parseDate(d);
    const isMonday = dt.getUTCDay() === 1;
    const isFirst = dt.getUTCDate() === 1;
    const show = unit === 'day' || (unit === 'week' && (isMonday || i === 0)) || (unit === 'month' && (isFirst || i === 0));
    if (!show) return;
    const tall = unit === 'day' ? isMonday || isFirst : unit === 'week' ? isFirst : dt.getUTCMonth() % 3 === 0;
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    ticks.push({ x, tall, label: size === 'lg' && isFirst && n > 1 && i > 0 && i < n - 1 && unit !== 'month' ? M[dt.getUTCMonth()] : undefined });
  });
  const compLen = comparison ? diffDays(comparison.start, comparison.end) + 1 : 0;
  const compPct = comparison ? Math.min(100, (compLen / n) * 100) : 0;
  const M = monthNames(locale);
  const fmt = (d: string) => (dateFormat ? formatDisplayDate(d, dateFormat) : human(d, M));
  const title = `${spanLabel(range, false, M)}${comparison ? `, ${labels?.comparedWith ?? 'compared with'} ${spanLabel(comparison, false, M)}` : ''}`;
  const markIdx = marker ? days.indexOf(marker) : -1;
  const pastEnd = marker && marker > range.end && diffDays(range.end, marker) <= 2;
  const markX = markIdx >= 0 ? (n === 1 ? 50 : (markIdx / (n - 1)) * 100) : pastEnd ? 100 : null;

  return (
    <figure className={`rband ${size === 'lg' ? 'rband-lg' : 'rband-sm'} ${className}`} aria-label={title} title={title}>
      <svg className="rband-svg" width="100%" height={h + (comparison ? 8 : 0)} role="img" aria-hidden="true" focusable="false">
        <line x1="0" y1={base} x2="100%" y2={base} className="rband-base" />
        <g className="rband-ticks">
          {ticks.map((t, i) => (
            <line key={i} x1={`${t.x}%`} x2={`${t.x}%`} y1={base} y2={base - (t.tall ? major : minor)} className={t.tall ? 'rband-tick rband-tick-major' : 'rband-tick'} />
          ))}
        </g>
        {size === 'lg' &&
          ticks
            .filter((t) => t.label)
            .map((t, i) => (
              <text key={`l${i}`} x={`${t.x}%`} y={base - major - 4} className="rband-month" textAnchor="middle">
                {t.label}
              </text>
            ))}
        {comparison && <line x1="0" y1={h + 5} x2={`${compPct}%`} y2={h + 5} className="rband-comparison" />}
        {markX != null && (
          <g className={live ? 'rband-now rband-now-live' : 'rband-now'}>
            <line x1={`${markX}%`} x2={`${markX}%`} y1={base} y2={base - major - 4} />
            <circle cx={`${markX}%`} cy={base - major - 6} r={size === 'lg' ? 3.5 : 2.5} />
          </g>
        )}
      </svg>
      <figcaption className="rband-caption">
        <span className="rband-date">{fmt(range.start)}</span>
        <span className="rband-span">
          {spanLabel(range, size === 'sm', M)}
          {live && <span className="rband-live">{labels?.live ?? 'live'}</span>}
        </span>
        <span className="rband-date rband-date-end">{fmt(range.end)}</span>
      </figcaption>
      {comparison && size === 'lg' && <div className="rband-compare">{labels?.comparedWith ?? 'compared with'} {spanLabel(comparison, false, M)}</div>}
    </figure>
  );
}
