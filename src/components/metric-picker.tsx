'use client';

// One metric picker for an account (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §3), used by the
// "Add metrics" panel and by the right-click "Add metric here": search without accents, KPI / chart / table chips, groups in
// a fixed order that collapse, ticks on what the report already has. The list comes from /metrics?pickable=1, so metrics the
// account cannot return are never offered.
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useLocale, useT } from '@/components/i18n-provider';
import { metricLabel } from '@/lib/catalog/labels';
import { groupId } from '@/lib/catalog/groups';
import type { Component } from '@/lib/engine/types';
import type { SourceInfo } from '@/lib/layout/types';
import { fold } from '@/lib/util/text';
import { fetchAllPages } from '@/lib/api/fetch-all';

export interface MetricPayload {
  kind: 'metric';
  slug: string;
  integrationId: number;
  key: string;
  component: Component;
  title: string;
}
interface MetricDef {
  reference_key: string;
  component: Component;
  references: { title: string; description?: string; group?: string };
}
const CHIPS = ['all', 'number_v1', 'chart_v1', 'datatable_v1'] as const;
type Chip = (typeof CHIPS)[number];

export function MetricPicker({ source, existing, onPick, variant, dragProps, onClose }: { source: Pick<SourceInfo, 'id' | 'slug'>; existing: Set<string>; onPick: (p: MetricPayload) => void; variant: 'panel' | 'popover'; dragProps?: (p: MetricPayload) => object; onClose?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [metrics, setMetrics] = useState<MetricDef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<Chip>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setMetrics(null);
    setFailed(false);
    // every page: a Sheet or CSV with many columns has more than 100 metrics
    fetchAllPages<MetricDef>(`/api/v2/metrics?integration_slug=${source.slug}&integration_id=${source.id}&per_page=100&pickable=1`, fetch, ctrl.signal)
      .then(setMetrics)
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [source.id, source.slug]);

  const payloadOf = (d: MetricDef): MetricPayload => ({ kind: 'metric', slug: source.slug, integrationId: source.id, key: d.reference_key.split(':').slice(1).join(':'), component: d.component, title: d.references.title });
  const labelOf = (d: MetricDef) => metricLabel({ reference_key: d.reference_key, title: d.references.title }, locale);
  const groupLabel = (raw: string) => {
    const k = `catalog.group.${groupId(raw)}`;
    const s = t(k);
    return s === k ? raw : s;
  };

  // the API already sorts by the group order; filtering keeps it
  const groups = useMemo(() => {
    const needles = fold(search.trim()).split(/\s+/).filter(Boolean);
    const out: { id: string; raw: string; items: MetricDef[] }[] = [];
    for (const d of metrics ?? []) {
      if (chip !== 'all' && d.component !== chip) continue;
      if (needles.length) {
        const hay = fold(`${labelOf(d)} ${d.references.title} ${d.references.description ?? ''}`);
        if (!needles.every((n) => hay.includes(n))) continue;
      }
      const raw = d.references.group ?? 'Other';
      const id = groupId(raw);
      const g = out.find((x) => x.id === id) ?? (out.push({ id, raw, items: [] }), out[out.length - 1]);
      g.items.push(d);
    }
    return out;
  }, [metrics, search, chip, locale]); // labelOf depends on the locale only
  const searching = search.trim().length > 0;
  const visible = groups.flatMap((g) => (searching || !collapsed.has(g.id) ? g.items : []));
  useEffect(() => setActive(0), [search, chip]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(visible.length - 1, i + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
    else if (e.key === 'Enter') {
      e.preventDefault();
      const d = visible[active];
      if (d) onPick(payloadOf(d));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (variant === 'popover') onClose?.();
      else setSearch('');
    }
  };
  const toggle = (id: string) => setCollapsed((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  let idx = -1;
  return (
    <div className="space-y-3" data-metric-picker={variant}>
      <input type="search" className="input" placeholder={t('editor.searchMetrics')} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onKey} autoFocus aria-label={t('editor.searchMetrics')} />
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('editor.chipAll')}>
        {CHIPS.map((c) => (
          <button key={c} type="button" className={clsx('btn px-2 py-1 text-[11px]', chip === c && 'border-brand text-brand')} aria-pressed={chip === c} onClick={() => setChip(c)} data-chip={c}>
            {c === 'all' ? t('editor.chipAll') : t(`editor.comp_${c}`)}
          </button>
        ))}
      </div>
      {metrics === null && !failed && <div className="text-xs text-ink-3">{t('common.loading')}</div>}
      {failed && (
        <div className="text-xs text-red-600" role="alert">
          {t('editor.metricsLoadFailed')}
        </div>
      )}
      <div role="listbox" aria-label={t('editor.searchMetrics')} className="space-y-3">
        {groups.map((g) => {
          const open = searching || !collapsed.has(g.id);
          return (
            <div key={g.id} data-group={g.id}>
              <button type="button" className="mb-1 flex w-full items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink" onClick={() => toggle(g.id)} aria-expanded={open} data-group-toggle>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {groupLabel(g.raw)}
                <span className="num ml-auto">{g.items.length}</span>
              </button>
              {open && (
                <div className="space-y-0.5">
                  {g.items.map((d) => {
                    idx++;
                    const p = payloadOf(d);
                    const has = existing.has(`${p.integrationId}:${p.key}`);
                    const on = idx === active;
                    return (
                      <div
                        key={d.reference_key}
                        role="option"
                        aria-selected={on}
                        tabIndex={-1}
                        {...(dragProps ? dragProps(p) : {})}
                        onClick={() => onPick(p)}
                        className={clsx('flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-50', on && 'bg-slate-50', dragProps && 'cursor-grab active:cursor-grabbing')}
                        title={d.references.description}
                        data-component={d.component}
                        {...(has ? { 'data-in-report': '' } : {})}
                      >
                        <span className="truncate">{labelOf(d)}</span>
                        <span className="ml-2 flex shrink-0 items-center gap-1">
                          {has && <Check size={11} className="text-emerald-600" aria-label={t('editor.inReport')} />}
                          <span className="rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{t(`editor.comp_${d.component}`)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {metrics !== null && groups.length === 0 && <div className="text-xs text-ink-3">{t('common.noMatches')}</div>}
      </div>
    </div>
  );
}
