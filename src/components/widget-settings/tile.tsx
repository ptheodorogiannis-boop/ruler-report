'use client';

// Settings of an infographic tile (spec §6): the kind, a metric reference or typed values, a target, an icon.
import { useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { X } from 'lucide-react';
import type { RenderedBlock } from '@/lib/engine/types';
import type { MetricRef, SourceInfo, TileKind, WidgetCustom } from '@/lib/layout/types';
import { ICONS, ICON_NAMES } from '../infographic';
import { FormatPick, MetricSelect, Segmented, SourceSelect, sourceLabel, useCatalog } from './common';
import type { PanelProps } from './custom-chart';

const KINDS: { value: TileKind; label: string }[] = [
  { value: 'progress', label: 'editor.tileProgress' },
  { value: 'stat', label: 'editor.tileStat' },
  { value: 'compare', label: 'editor.tileCompare' },
  { value: 'ranking', label: 'editor.tileRanking' },
];

/** An account + metric picker that writes a MetricRef. */
function RefPicker({ sources, value, component, onChange, label }: { sources: SourceInfo[]; value: MetricRef | undefined; component: 'number_v1' | 'datatable_v1'; onChange: (r: MetricRef | undefined) => void; label: string }) {
  const t = useT();
  const [srcId, setSrcId] = useState<number | null>(value?.integrationId ?? sources[0]?.id ?? null);
  const source = sources.find((s) => s.id === srcId) ?? null;
  const { metrics, loading } = useCatalog(source, (m) => m.component === component);
  return (
    <div className="space-y-1">
      <div className="label">{label}</div>
      {value && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="truncate">
            {(() => {
              const s = sources.find((x) => x.id === value.integrationId);
              return s ? sourceLabel(s) : `account ${value.integrationId}`;
            })()}{' '}
            · <code>{value.key}</code>
          </span>
          <button type="button" className="text-slate-400 hover:text-red-500" aria-label={`Clear ${label}`} onClick={() => onChange(undefined)}>
            <X size={13} />
          </button>
        </div>
      )}
      <SourceSelect sources={sources} value={srcId} onChange={setSrcId} />
      <MetricSelect metrics={metrics} value={value && value.integrationId === srcId ? value.key : null} onChange={(k) => onChange(k && source ? { integrationId: source.id, key: k } : undefined)} loading={loading} placeholder={source ? (component === 'number_v1' ? t('editor.numberMetricPlaceholder') : t('editor.tablePlaceholder')) : 'Pick an account first'} />
    </div>
  );
}

/** The fallback the card applies when the chosen ranking column is gone (the template changed), said in the panel too (spec §6). */
export function columnNote(column: string | undefined, columns: { col: string; label: string }[]): string | null {
  if (!column || !columns.length || columns.some((c) => c.col === column)) return null;
  return `Column "${column}" is not in this table any more; ranking by the first numeric column instead.`;
}

export function TileSettings({ c, sources, rawIdx, onChange }: PanelProps & { rawIdx: Map<string, RenderedBlock> }) {
  const t = useT();
  const kind = c.kind ?? 'progress';
  const items = c.items ?? [];
  const setItem = (i: number, p: Partial<{ label: string; value: number }>) => onChange({ items: items.map((it, j) => (j === i ? { ...it, ...p } : it)) }, `item:${i}`);
  const table = c.tableRef ? rawIdx.get(`${c.tableRef.integrationId}:${c.tableRef.key}`)?.widget.value : undefined;
  const columns = table?.type === 'table' ? table.columns.slice(1).map((col, i) => ({ col, label: table.columnLabels[i + 1] })) : [];

  return (
    <div className="space-y-4" data-panel="tile">
      <Segmented label={t('editor.tile')} options={KINDS.map((o) => ({ ...o, label: t(o.label) }))} value={kind} onChange={(k) => onChange({ kind: k })} />

      {(kind === 'progress' || kind === 'stat') && (
        <>
          <RefPicker sources={sources} value={c.ref} component="number_v1" label={t('goals.metric')} onChange={(ref) => onChange({ ref, value: ref ? undefined : c.value })} />
          {!c.ref && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">{t('editor.value')}</label>
                <input className="input" type="number" step="any" value={c.value ?? ''} onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) }, 'value')} />
              </div>
              {kind === 'stat' && (
                <div>
                  <label className="text-xs text-slate-500">{t('common.previous')}</label>
                  <input className="input" type="number" step="any" value={c.previous ?? ''} onChange={(e) => onChange({ previous: e.target.value === '' ? null : Number(e.target.value) }, 'previous')} />
                </div>
              )}
            </div>
          )}
          {kind === 'progress' && (
            <div>
              <label className="label">{t('goals.target')}</label>
              <input className="input" type="number" step="any" value={c.target ?? ''} onChange={(e) => onChange({ target: e.target.value === '' ? undefined : Number(e.target.value) }, 'target')} placeholder="e.g. 10000" />
            </div>
          )}
          {kind === 'stat' && (
            <div>
              <div className="label">{t('editor.icon')}</div>
              <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label={t('editor.icon')}>
                {ICON_NAMES.map((name) => {
                  const Icon = ICONS[name];
                  return (
                    <button key={name} type="button" title={name} aria-pressed={c.icon === name} className={`flex h-8 items-center justify-center rounded-md border ${c.icon === name ? 'border-brand text-brand' : 'border-[var(--line)] text-ink-2'}`} onClick={() => onChange({ icon: c.icon === name ? undefined : name })}>
                      <Icon size={15} strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {kind === 'compare' && (
        <>
          <RefPicker sources={sources} value={c.ref} component="number_v1" label={t('editor.firstMetric')} onChange={(ref) => onChange({ ref })} />
          <RefPicker sources={sources} value={c.ref2} component="number_v1" label={t('editor.secondMetric')} onChange={(ref2) => onChange({ ref2 })} />
          {!c.ref && !c.ref2 && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500">{t('editor.orTypeTwo')}</div>
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" placeholder={`Label ${i + 1}`} value={items[i]?.label ?? ''} onChange={(e) => onChange({ items: [0, 1].map((j) => (j === i ? { label: e.target.value, value: items[j]?.value ?? 0 } : items[j] ?? { label: '', value: 0 })) }, `item:${i}`)} />
                  <input className="input w-28" type="number" step="any" value={items[i]?.value ?? ''} onChange={(e) => onChange({ items: [0, 1].map((j) => (j === i ? { label: items[j]?.label ?? '', value: Number(e.target.value) } : items[j] ?? { label: '', value: 0 })) }, `item:${i}`)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {kind === 'ranking' && (
        <>
          <RefPicker sources={sources} value={c.tableRef} component="datatable_v1" label={t('editor.table')} onChange={(r) => onChange({ tableRef: r ? { ...r, rows: c.tableRef?.rows ?? 5 } : undefined })} />
          {c.tableRef && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">{t('editor.rankBy')}</label>
                {columns.length ? (
                  <select className="input" value={c.tableRef.column ?? ''} onChange={(e) => onChange({ tableRef: { ...c.tableRef!, column: e.target.value || undefined } })}>
                    <option value="">{t('editor.firstNumeric')}</option>
                    {columns.map((col) => (
                      <option key={col.col} value={col.col}>
                        {col.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="input" value={c.tableRef.column ?? ''} placeholder="column key (after save)" onChange={(e) => onChange({ tableRef: { ...c.tableRef!, column: e.target.value || undefined } }, 'column')} />
                )}
                {columnNote(c.tableRef.column, columns) && <div className="mt-1 text-xs text-amber-700">{columnNote(c.tableRef.column, columns)}</div>}
              </div>
              <div>
                <label className="text-xs text-slate-500">{t('editor.rows')}</label>
                <input className="input" type="number" min={1} max={50} value={c.tableRef.rows ?? 5} onChange={(e) => onChange({ tableRef: { ...c.tableRef!, rows: Math.max(1, Math.min(50, Number(e.target.value) || 5)) } }, 'rows')} />
              </div>
            </div>
          )}
          {!c.tableRef && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500">{t('editor.orTypeItems')}</div>
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" value={it.label} placeholder={t('editor.label')} onChange={(e) => setItem(i, { label: e.target.value })} />
                  <input className="input w-28" type="number" step="any" value={it.value} onChange={(e) => setItem(i, { value: Number(e.target.value) })} />
                  <button type="button" className="text-slate-400 hover:text-red-500" aria-label={t('editor.removeItem')} onClick={() => onChange({ items: items.filter((_, j) => j !== i) })}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn" disabled={items.length >= 50} onClick={() => onChange({ items: [...items, { label: '', value: 0 }] })}>
                {t('editor.addItem')}
              </button>
            </div>
          )}
        </>
      )}

      <FormatPick value={c.format ?? 'number'} onChange={(f) => onChange({ format: f })} />
    </div>
  );
}
