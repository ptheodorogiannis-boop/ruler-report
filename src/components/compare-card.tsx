// The comparison container (compare_v1, src/lib/layout/compare.ts): one metric across periods or accounts. Each column is
// an inset tile with the value set large and light, a bar on a shared scale (the base in the block's colour, the others
// grey: one highlighted series) and the change, as an arrow glyph with a percentage or a signed difference. Server-safe.
import clsx from 'clsx';
import type { CompareValue, RenderedBlock } from '@/lib/engine/types';
import type { WidgetCustom } from '@/lib/layout/types';
import { formatValue } from '@/lib/util/format';
import { formatDisplayDate } from '@/lib/util/dates';
import { tr } from '@/lib/i18n/request';
import { Delta, type CardProps } from './widgets';
import { PlatformIcon } from './platform-icon';

const TOKEN_LABEL = { current: 'public.compareCurrent', previous: 'public.comparePrevious', yearAgo: 'public.compareYearAgo', custom: 'public.compareCustom' } as const;

export function CompareCard({ b, fmt, grid }: CardProps & { b: RenderedBlock }) {
  const w = b.widget;
  const v = w.value as CompareValue;
  const c = (b.custom ?? {}) as WidgetCustom;
  const o = { currency: w.currency, ...fmt };
  const absolute = c.changeAs === 'absolute';
  // bars share one scale only when every column has the same unit (an amount next to a reach would mislead)
  const sameUnit = v.columns.every((col) => (col.format ?? v.format) === v.format && (col.currency ?? w.currency) === (v.columns[0].currency ?? w.currency));
  const max = Math.max(0, ...v.columns.map((col) => (col.value != null && col.value > 0 ? col.value : 0)));
  const nameOf = (col: CompareValue['columns'][number]) => (v.mode === 'periods' ? col.label || tr(TOKEN_LABEL[col.token ?? 'custom']) : col.label);
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  return (
    <div className={clsx('card compare-card flex flex-col p-4', grid && 'h-full overflow-hidden')} title={w.description} data-compare-mode={v.mode}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm font-semibold">{c.title || tr('public.compareTitle')}</div>
        <span className="shrink-0 text-xs text-ink-3">{v.mode === 'periods' ? tr('public.compareByPeriod') : tr('public.compareByAccount')}</span>
      </div>
      <ol className="compare-cols" aria-label={c.title || tr('public.compareTitle')}>
        {v.columns.map((col, i) => {
          const width = max > 0 && col.value != null && col.value > 0 ? Math.max(2, (col.value / max) * 100) : 0;
          return (
            <li key={i} className={clsx('compare-col tone-inset', col.base && 'is-base')}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                {v.mode === 'accounts' && col.slug && (
                  <span className="inline-flex shrink-0" style={{ color: col.base ? 'var(--block, var(--brand))' : 'var(--ink-3)' }}>
                    <PlatformIcon slug={col.slug} size={14} />
                  </span>
                )}
                <span className="truncate">{nameOf(col)}</span>
              </div>
              {col.range && (
                <div className="num mt-0.5 text-[11px] text-ink-3">
                  {formatDisplayDate(col.range.start)} → {formatDisplayDate(col.range.end)}
                </div>
              )}
              <div className="compare-value num">{col.error && col.value == null ? '—' : formatValue(col.value, col.format ?? v.format, { ...o, currency: col.currency ?? o.currency })}</div>
              {sameUnit && (
                <div className="compare-bar" aria-hidden="true">
                  <i style={{ width: `${width}%` }} />
                </div>
              )}
              <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-1.5 text-xs text-ink-3">
                {col.error && col.value == null ? (
                  <span>{col.error}</span>
                ) : v.mode === 'periods' ? (
                  col.base ? (
                    <span>{tr('public.compareBase')}</span>
                  ) : (
                    <>
                      <span>{tr('public.compareNow')}</span>
                      {absolute ? <span className="num font-medium text-ink-2">{col.absolute == null ? null : `${sign(col.absolute)}${formatValue(Math.abs(col.absolute), col.format ?? v.format, { ...o, currency: col.currency ?? o.currency })}`}</span> : <Delta pct={col.change_pct} diff={w.diff_type} />}
                    </>
                  )
                ) : (
                  <>
                    {absolute ? <span className="num font-medium text-ink-2">{col.absolute == null ? null : `${sign(col.absolute)}${formatValue(Math.abs(col.absolute), col.format ?? v.format, { ...o, currency: col.currency ?? o.currency })}`}</span> : <Delta pct={col.change_pct} diff={w.diff_type} />}
                    <span>{tr('public.compareVsPrevious')}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {v.total != null && (
        <div className="mt-3 flex items-baseline justify-between border-t border-[var(--line)] pt-2 text-sm">
          <span className="text-ink-2">{tr('public.compareTotal')}</span>
          <span className="num font-medium">{formatValue(v.total, v.format, o)}</span>
        </div>
      )}
    </div>
  );
}
