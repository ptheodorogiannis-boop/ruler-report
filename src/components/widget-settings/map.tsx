'use client';

// Settings of the map widget (map_v1, src/lib/layout/map.ts): the "by country" metric that colours the countries, then up
// to six metrics the country panel shows. Both pickers list only country breakdowns.
import { X } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import { MAX_MAP_PANEL } from '@/lib/layout/map';
import type { MetricRef } from '@/lib/layout/types';
import { sourceLabel, type CatalogMetric } from './common';
import { RefPicker } from './tile';
import type { PanelProps } from './custom-chart';

const byCountry = (m: CatalogMetric) => m.component === 'chart_v1' && m.dimensions?.[0] === 'country';

export function MapSettings({ c, sources, onChange }: PanelProps) {
  const t = useT();
  const panel = c.mapPanel ?? [];
  const refName = (r: MetricRef) => {
    const s = sources.find((x) => x.id === r.integrationId);
    return `${s ? sourceLabel(s) : `#${r.integrationId}`} · ${r.key}`;
  };
  return (
    <div className="space-y-4" data-panel="map">
      <RefPicker sources={sources} value={c.mapShade} filter={byCountry} placeholder={t('editor.mapCountryPlaceholder')} label={t('editor.mapColourBy')} onChange={(mapShade) => onChange({ mapShade })} />
      <div className="space-y-2">
        <div className="label">{t('editor.mapPanelMetrics')}</div>
        {panel.map((r, i) => (
          <div key={`${r.integrationId}:${r.key}`} className="flex items-center justify-between gap-2 text-xs text-ink-2">
            <span className="truncate">{refName(r)}</span>
            <button type="button" className="icon-btn h-8 w-8" aria-label={t('common.remove')} onClick={() => onChange({ mapPanel: panel.filter((_, j) => j !== i) })}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        {panel.length < MAX_MAP_PANEL && (
          <RefPicker
            sources={sources}
            value={undefined}
            filter={byCountry}
            placeholder={t('editor.mapCountryPlaceholder')}
            label={t('editor.mapAddMetric')}
            onChange={(r) => r && !panel.some((p) => p.integrationId === r.integrationId && p.key === r.key) && onChange({ mapPanel: [...panel, r] })}
          />
        )}
      </div>
    </div>
  );
}
