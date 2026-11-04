'use client';

// Settings of the comparison container (compare_v1, src/lib/layout/compare.ts): the metric, then either the periods to set
// against the report's own (previous period, the same period a year ago, up to four custom periods) or the accounts to set
// beside it (up to eight), and how the change reads (percentage or difference).
import { X } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import { MAX_COMPARE_PERIODS, MAX_COMPARE_REFS } from '@/lib/layout/compare';
import type { MetricRef } from '@/lib/layout/types';
import { Segmented, sourceLabel } from './common';
import { RefPicker } from './tile';
import type { PanelProps } from './custom-chart';

export function CompareSettings({ c, sources, onChange }: PanelProps) {
  const t = useT();
  const mode = c.compareMode ?? 'periods';
  const periods = c.comparePeriods ?? [];
  const refs = c.compareRefs ?? [];
  const setPeriod = (i: number, patch: Partial<{ label?: string; start: string; end: string }>) =>
    onChange({ comparePeriods: periods.map((p, j) => (j === i ? { ...p, ...patch, ...(patch.label === '' ? { label: undefined } : {}) } : p)) }, `period:${i}`);
  const refName = (r: MetricRef) => {
    const s = sources.find((x) => x.id === r.integrationId);
    return `${s ? sourceLabel(s) : `#${r.integrationId}`} · ${r.key}`;
  };
  return (
    <div className="space-y-4" data-panel="compare">
      <RefPicker sources={sources} value={c.ref} component="number_v1" label={t('editor.compareMetric')} onChange={(ref) => onChange({ ref })} />
      <Segmented
        label={t('editor.compareMode')}
        options={[
          { value: 'periods', label: t('editor.comparePeriods') },
          { value: 'accounts', label: t('editor.compareAccounts') },
        ]}
        value={mode}
        onChange={(m) => onChange({ compareMode: m })}
      />
      {mode === 'periods' ? (
        <div className="space-y-3" data-compare-periods>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={c.comparePrevious !== false} onChange={(e) => onChange({ comparePrevious: e.target.checked ? undefined : false })} /> {t('editor.comparePrevious')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={!!c.compareYearAgo} onChange={(e) => onChange({ compareYearAgo: e.target.checked || undefined })} /> {t('editor.compareYearAgo')}
          </label>
          {periods.map((p, i) => (
            <div key={i} className="tone-inset space-y-2 rounded-2xl p-3" data-compare-period={i}>
              <div className="flex items-center gap-2">
                <input className="input" placeholder={t('editor.compareLabel')} value={p.label ?? ''} maxLength={60} onChange={(e) => setPeriod(i, { label: e.target.value })} aria-label={t('editor.compareLabel')} />
                <button type="button" className="icon-btn h-9 w-9" aria-label={t('common.remove')} onClick={() => onChange({ comparePeriods: periods.filter((_, j) => j !== i) })}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-3">
                  {t('editor.compareFrom')}
                  <input className="input mt-1" type="date" value={p.start} max={p.end} onChange={(e) => e.target.value && setPeriod(i, { start: e.target.value })} />
                </label>
                <label className="text-xs text-ink-3">
                  {t('editor.compareTo')}
                  <input className="input mt-1" type="date" value={p.end} min={p.start} onChange={(e) => e.target.value && setPeriod(i, { end: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn w-full"
            disabled={periods.length >= MAX_COMPARE_PERIODS}
            title={t('editor.compareMax', { count: MAX_COMPARE_PERIODS })}
            onClick={() => {
              const y = new Date().getFullYear() - 1;
              onChange({ comparePeriods: [...periods, { start: `${y}-01-01`, end: `${y}-01-31` }] });
            }}
          >
            {t('editor.compareAddPeriod')}
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-compare-accounts>
          <p className="text-xs text-ink-3">{t('editor.compareAccountsHint')}</p>
          {refs.map((r, i) => (
            <div key={`${r.integrationId}:${r.key}:${i}`} className="tone-inset flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
              <span className="truncate">{refName(r)}</span>
              <button type="button" className="text-ink-3 hover:text-ink" aria-label={t('common.remove')} onClick={() => onChange({ compareRefs: refs.filter((_, j) => j !== i) })}>
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
          {refs.length < MAX_COMPARE_REFS && (
            <RefPicker key={refs.length} sources={sources} value={undefined} component="number_v1" label={t('editor.compareAddAccount')} onChange={(ref) => ref && onChange({ compareRefs: [...refs, ref] })} />
          )}
        </div>
      )}
      <Segmented
        label={t('editor.changeAs')}
        options={[
          { value: 'percent', label: t('editor.changePercent') },
          { value: 'absolute', label: t('editor.changeAbsolute') },
        ]}
        value={c.changeAs ?? 'percent'}
        onChange={(v) => onChange({ changeAs: v === 'percent' ? undefined : v })}
      />
    </div>
  );
}
