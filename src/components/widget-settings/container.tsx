'use client';

// Settings of a campaign table (spec v3 §2.3): the metrics (number metrics of the block's platform), rows, sort order,
// the status column and campaigns hidden by the author.
import type { RenderedBlock } from '@/lib/engine/types';
import { useT } from '@/components/i18n-provider';
import { DEFAULT_CONTAINER_METRICS, MAX_CONTAINER_ROWS } from '@/lib/layout/types';
import { useCatalog } from './common';
import type { PanelProps } from './custom-chart';

export function ContainerSettings({ c, sources, integrationId, rendered, onChange }: Pick<PanelProps, 'c' | 'sources' | 'onChange'> & { integrationId: number; rendered?: RenderedBlock }) {
  const t = useT();
  const source = sources.find((s) => s.id === integrationId) ?? null;
  const { metrics, loading } = useCatalog(source, (m) => m.component === 'number_v1');
  const chosen = c.metrics?.length ? c.metrics : DEFAULT_CONTAINER_METRICS;
  const toggle = (key: string) => onChange({ metrics: chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key] });
  const value = rendered?.widget.value;
  const rows = value?.type === 'container' ? value.rows : [];
  const known = value?.type === 'container' ? value.metrics : [];
  const hidden = c.hiddenCampaigns ?? [];
  return (
    <div className="space-y-4" data-panel="container">
      <div>
        <div className="label">{t('editor.containerMetrics')}</div>
        {loading && <div className="text-xs text-ink-3">{t('editor.loadingCatalog')}</div>}
        <ul className="max-h-56 divide-y divide-[var(--line)] overflow-auto rounded-lg border border-[var(--line)]">
          {metrics.map((m) => (
            <li key={m.key}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={chosen.includes(m.key)} onChange={() => toggle(m.key)} disabled={chosen.length >= 12 && !chosen.includes(m.key)} />
                <span className="truncate">{m.title}</span>
              </label>
            </li>
          ))}
          {!loading && metrics.length === 0 && <li className="px-3 py-2 text-xs text-ink-3">{t('editor.noNumberMetrics')}</li>}
        </ul>
        <div className="mt-1 text-xs text-ink-3">{chosen.length} of 12 columns</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('editor.sortBy')}</label>
          <select className="input" value={c.sortBy && chosen.includes(c.sortBy) ? c.sortBy : chosen[0] ?? ''} onChange={(e) => onChange({ sortBy: e.target.value || undefined })}>
            {chosen.map((k) => (
              <option key={k} value={k}>
                {known.find((m) => m.key === k)?.label ?? metrics.find((m) => m.key === k)?.title ?? k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('editor.rows')}</label>
          <input className="input" type="number" min={1} max={MAX_CONTAINER_ROWS} value={c.rows ?? 10} onChange={(e) => onChange({ rows: Math.max(1, Math.min(MAX_CONTAINER_ROWS, Number(e.target.value) || 10)) }, 'rows')} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.showStatus !== false} onChange={(e) => onChange({ showStatus: e.target.checked })} /> {t('editor.showStatusDot')}
      </label>
      {(rows.length > 0 || hidden.length > 0) && (
        <div>
          <div className="label">{t('editor.hideCampaigns')}</div>
          <ul className="max-h-40 overflow-auto rounded-lg border border-[var(--line)] text-sm">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-slate-50">
                  <input type="checkbox" checked={hidden.includes(r.id)} onChange={(e) => onChange({ hiddenCampaigns: e.target.checked ? [...hidden, r.id] : hidden.filter((x) => x !== r.id) })} />
                  <span className="truncate">{r.name}</span>
                </label>
              </li>
            ))}
            {hidden
              .filter((id) => !rows.some((r) => r.id === id))
              .map((id) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-ink-3 hover:bg-slate-50">
                    <input type="checkbox" checked onChange={() => onChange({ hiddenCampaigns: hidden.filter((x) => x !== id) })} />
                    <span className="truncate">{id} (hidden)</span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
