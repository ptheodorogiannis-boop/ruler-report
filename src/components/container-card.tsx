// Campaign table card (spec v3 §2.3): a row per campaign with the chosen metrics and their deltas. Server component,
// rendered identically in the editor grid, on the client link and in print.
import clsx from 'clsx';
import type { ContainerValue } from '@/lib/engine/types';
import { formatValue } from '@/lib/util/format';
import type { CardProps } from './widgets';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { metricLabel } from '@/lib/catalog/labels';
import { getRequestLocale } from '@/lib/i18n/request';
import { StarRowButton } from './star-row';
import { RowThumb } from './row-thumb';
import { resultLabel } from '@/lib/connectors/meta-results';
import { tr } from '@/lib/i18n/request';

/** Results and Cost per result carry the row's result type under the number */
const TYPED = new Set(['results', 'cost_per_result']);
const NAME_COLUMN = { campaign: 'public.ctableCampaign', adset: 'public.ctableAdset', ad: 'public.ctableAd' } as const;

const pct = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);

export function ContainerCard({ b, fmt, grid, onStarRow }: CardProps) {
  const w = b.widget;
  const v = w.value as ContainerValue;
  const o = { currency: w.currency, ...fmt };
  const showStatus = (b.custom as { showStatus?: boolean } | undefined)?.showStatus !== false;
  const starred = new Set((b.custom as { starredRows?: string[] } | undefined)?.starredRows ?? []);
  const prefix = getIntegrationDef(b.slug)?.prefix ?? b.slug;
  const locale = getRequestLocale();
  return (
    <div className={clsx('card ctable-card flex flex-col p-4', grid && 'h-full overflow-hidden')} data-kind="container" title={w.description}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm font-semibold">{w.label}</div>
        {v.truncated > 0 && <span className="shrink-0 text-[11px] text-ink-3">+{v.truncated} more</span>}
      </div>
      <div className="ctable-scroll min-h-0 flex-1">
        <table className="ctable">
          <thead>
            <tr>
              <th className="ctable-name">{tr(NAME_COLUMN[v.level ?? 'campaign'])}</th>
              {v.metrics.map((m) => (
                <th key={m.key} className="num">
                  {metricLabel({ reference_key: `${prefix}:${m.key}`, title: m.label }, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.id} data-status={r.status} className={clsx(starred.has(r.name) && 'row-starred')} {...(starred.has(r.name) ? { 'data-starred': '' } : {})}>
                <td className="ctable-name">
                  {onStarRow && <StarRowButton on={starred.has(r.name)} onClick={() => onStarRow(r.name)} />}
                  {showStatus && <span className={`ctable-dot ctable-dot-${r.status}`} title={r.status} aria-hidden="true" />}
                  {v.level === 'ad' && <RowThumb src={r.thumb} alt={r.name} />}
                  <span className="truncate">{r.name}</span>
                </td>
                {r.values.map((val, i) => {
                  const prev = r.comparison?.[i];
                  const d = val != null && prev != null ? pct(val, prev) : null;
                  return (
                    <td key={i} className="num">
                      {formatValue(val, v.metrics[i].format, o)}
                      {d != null && <span className={clsx('ctable-delta', d > 0 ? 'text-up' : d < 0 ? 'text-down' : '')}>{`${d > 0 ? '+' : ''}${d}%`}</span>}
                      {r.resultType !== undefined && TYPED.has(v.metrics[i].key) && <span className="cell-note">{resultLabel(r.resultType, tr)}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {v.rows.length === 0 && (
              <tr>
                <td colSpan={v.metrics.length + 1} className="text-ink-3">
                  No campaigns in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
