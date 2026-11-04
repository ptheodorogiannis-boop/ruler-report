// The map widget's card (map_v1, docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §1): the title, the
// interactive map (src/components/map-view.tsx, loaded on demand) and a ranked list of the countries with each one's share
// of the total. The list is rendered here, on the server, so it reads without JavaScript and is what prints. Server-safe.
import clsx from 'clsx';
import type { MapValue } from '@/lib/engine/types';
import { countryName } from '@/lib/geo/countries';
import { getRequestLocale, tr } from '@/lib/i18n/request';
import type { WidgetCustom } from '@/lib/layout/types';
import { formatValue } from '@/lib/util/format';
import { MapViewLazy } from './map-view-lazy';
import type { CardProps } from './widgets';

const LIST_LIMIT = 10;

export function MapCard({ b, fmt, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as MapValue;
  const c = (b.custom ?? {}) as WidgetCustom;
  const locale = getRequestLocale();
  const title = c.title || tr('public.mapTitle');
  const o = { ...fmt, currency: v.shade.currency ?? w.currency };
  const total = v.countries.reduce((t, x) => t + (x.values[0] ?? 0), 0);
  const ranked = v.countries.filter((x) => x.values[0] != null);
  const shown = ranked.slice(0, LIST_LIMIT);
  return (
    <div className={clsx('card map-card flex flex-col p-4', grid && 'h-full overflow-hidden')} title={w.description}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm font-semibold">{title}</div>
        <span className="shrink-0 text-xs text-ink-3">{v.shade.label}</span>
      </div>
      {ranked.length === 0 ? (
        <div className="map-empty text-sm text-ink-3">{tr('public.mapNoData')}</div>
      ) : (
        <>
          <div>
            <MapViewLazy value={v} locale={locale} fmt={o} labels={{ clear: tr('public.mapClear'), top: tr('public.mapTop'), pick: tr('public.mapSelected'), loading: tr('public.mapLoading'), error: tr('public.mapError') }} />
          </div>
          <ol className={clsx('map-list', grid && 'min-h-0 flex-1 overflow-auto')} aria-label={tr('public.mapCountries')}>
            {shown.map((x) => (
              <li key={x.code}>
                <span className="truncate">{countryName(x.code, locale)}</span>
                <span className="num">{formatValue(x.values[0], v.shade.format, o)}</span>
                <span className="num text-ink-3">{total > 0 ? `${(((x.values[0] ?? 0) / total) * 100).toFixed(1)}%` : ''}</span>
              </li>
            ))}
            {ranked.length > LIST_LIMIT && <li className="text-ink-3">{tr('public.mapMore', { count: ranked.length - LIST_LIMIT })}</li>}
            {v.unmatched.map((u) => (
              <li key={u.label} className="text-ink-3">
                <span className="truncate">{u.label}</span>
                <span className="num">{u.values[0] != null ? formatValue(u.values[0], v.shade.format, o) : ''}</span>
                <span />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
