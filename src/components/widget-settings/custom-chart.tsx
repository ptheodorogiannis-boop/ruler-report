'use client';

// Settings of a custom chart (spec §6): series from the chart metrics of any account, or typed data; chart type; group-by.
import { useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { X } from 'lucide-react';
import type { ChartType, GroupBy, SourceInfo, WidgetCustom } from '@/lib/layout/types';
import { formatTyped, parseTyped } from '@/lib/layout/typed-data';
import { MetricSelect, Segmented, SourceSelect, sourceLabel, useCatalog } from './common';

export interface PanelProps {
  c: WidgetCustom;
  sources: SourceInfo[];
  decimal: 'comma_dot' | 'dot_comma';
  onChange: (patch: Partial<WidgetCustom>, coalesce?: string) => void;
}

const TYPES: { value: ChartType; label: string }[] = [
  { value: 'line', label: 'editor.chartLine' },
  { value: 'area', label: 'editor.chartArea' },
  { value: 'bar', label: 'editor.chartBars' },
  { value: 'stacked', label: 'editor.chartStacked' },
  { value: 'pie', label: 'editor.chartPie' },
  { value: 'donut', label: 'editor.chartDonut' },
];
const GROUPS: { value: GroupBy; label: string }[] = [
  { value: 'day', label: 'editor.day' },
  { value: 'week', label: 'editor.week' },
  { value: 'month', label: 'editor.month' },
  { value: 'quarter', label: 'editor.quarter' },
];

export function CustomChartSettings({ c, sources, decimal, onChange }: PanelProps) {
  const t = useT();
  const [mode, setMode] = useState<'metrics' | 'typed'>(c.manual ? 'typed' : 'metrics');
  const [srcId, setSrcId] = useState<number | null>(sources[0]?.id ?? null);
  const [key, setKey] = useState<string | null>(null);
  const [draft, setDraft] = useState(formatTyped(c.manual, decimal));
  const source = sources.find((s) => s.id === srcId) ?? null;
  const { metrics, loading } = useCatalog(source, (m) => m.component === 'chart_v1');
  const series = c.series ?? [];

  const add = () => {
    if (!source || !key) return;
    const m = metrics.find((x) => x.key === key);
    onChange({ series: [...series, { integrationId: source.id, key, label: m?.title }], manual: undefined });
    setKey(null);
  };
  const patchSeries = (i: number, p: Partial<NonNullable<WidgetCustom['series']>[number]>) => onChange({ series: series.map((s, j) => (j === i ? { ...s, ...p } : s)) }, `series:${i}`);

  return (
    <div className="space-y-4" data-panel="custom-chart">
      <Segmented
        label={t('editor.data')}
        options={[
          { value: 'metrics', label: t('editor.fromMetrics') },
          { value: 'typed', label: t('editor.typedData') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'metrics' ? (
        <div className="space-y-2">
          {series.map((s, i) => {
            const src = sources.find((x) => x.id === s.integrationId);
            return (
              <div key={i} className="rounded-lg border border-[var(--line)] p-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">
                    {src ? sourceLabel(src) : `account ${s.integrationId}`} · <code>{s.key}</code>
                  </span>
                  <button type="button" className="text-slate-400 hover:text-red-500" aria-label={t('editor.removeSeries')} onClick={() => onChange({ series: series.filter((_, j) => j !== i) })}>
                    <X size={13} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input className="input" value={s.label ?? ''} placeholder={t('editor.seriesName')} onChange={(e) => patchSeries(i, { label: e.target.value || undefined })} />
                  <input type="color" className="swatch-input" value={s.color ?? '#1a36e6'} onChange={(e) => patchSeries(i, { color: e.target.value })} aria-label={t('editor.seriesColour')} />
                </div>
              </div>
            );
          })}
          {series.length === 0 && <div className="text-xs text-slate-400">{t('editor.noSeries')}</div>}
          <div className="grid gap-2">
            <SourceSelect sources={sources} value={srcId} onChange={setSrcId} />
            <MetricSelect metrics={metrics} value={key} onChange={setKey} loading={loading} placeholder={source ? t('editor.chartMetricPlaceholder') : t('editor.pickAccountFirst')} />
            <button type="button" className="btn" disabled={!source || !key || series.length >= 8} onClick={add}>
              {t('editor.addSeries')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea className="input min-h-[140px] font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => onChange({ manual: parseTyped(draft, decimal), series: undefined }, 'typed')} placeholder={'Label\tSeries A\tSeries B\nJan\t120\t80\nFeb\t140\t95'} aria-label={t('editor.typedData')} />
          <div className="text-xs text-slate-400">Paste from a spreadsheet: first row the headers, first column the labels. Numbers in the project&apos;s format ({decimal === 'dot_comma' ? '1.234,56' : '1,234.56'}).</div>
        </div>
      )}
      <Segmented label={t('editor.chartType')} options={TYPES.map((o) => ({ ...o, label: t(o.label) }))} value={c.chartType ?? 'line'} onChange={(t) => onChange({ chartType: t })} />
      {mode === 'metrics' && <Segmented label={t('editor.groupBy')} options={GROUPS.map((o) => ({ ...o, label: t(o.label) }))} value={c.groupBy ?? 'day'} onChange={(g) => onChange({ groupBy: g === 'day' ? undefined : g })} />}
    </div>
  );
}
