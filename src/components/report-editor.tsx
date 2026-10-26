'use client';

// In-report editor (Reportei's document editor, docs/REPORTEI-DEEP-DIVE.md §3): blocks of widgets on a
// 12-column grid, drag / resize, "Add metrics" catalog drawer, per-widget settings drawer, autosave with
// undo / redo, "Save as template". Rendering goes through the same composeReport() the public page uses,
// so what the writer sees is what the client link shows.
import clsx from 'clsx';
import { useLocale, useT } from '@/components/i18n-provider';
import { metricLabel } from '@/lib/catalog/labels';
import { BlockColor, LookPanel } from './look-panel';
import { CustomChartSettings } from './widget-settings/custom-chart';
import { TileSettings } from './widget-settings/tile';
import { ImageSettings } from './widget-settings/image';
import { ContainerSettings } from './widget-settings/container';
import { CampaignScopeEditor } from './campaign-scope-editor';
import { scopeSummary, type CampaignScope } from '@/lib/engine/campaigns';
import { listCampaignsAction } from '@/app/actions/app';
import { AnalyseAllButton, BlockAnalyseMenu } from './block-analyse';
import { ICONS, ICON_NAMES } from './infographic';
import { blockColorOf, blockVars, paletteFor, themeVars, withBlockColor } from '@/lib/layout/theme';
import { PlatformIcon } from '@/components/platform-icon';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, Code2, Copy, Download, Eye, EyeOff, GripVertical, LayoutTemplate, Loader2, Palette, Plus, Redo2, Settings2, Star, Trash2, Undo2, X } from 'lucide-react';
import { saveLayoutAction, saveReportAsTemplateAction } from '@/app/actions/editor';
import { getIntegrationDef, isAdsSlug } from '@/lib/catalog/integrations';
import type { Component, DateRange, Format, RenderedBlock, ReportData } from '@/lib/engine/types';
import { composeReport, effectiveScope, indexValues, newId, valueKey, widgetValueKey, withBlockScope } from '@/lib/layout/compose';
import { firstFree } from '@/lib/layout/grid';
import { DEFAULT_SIZE, MIN_SIZE, type LayoutBlock, type LayoutWidget, type ReportLayout, type SourceInfo, type WidgetCustom } from '@/lib/layout/types';
import { reportToCsv } from '@/lib/services/export';
import { CopyButton } from './action-form';
import { DND_TYPE, GridCanvas, setDragPayload } from './grid';
import { PlatformBadge, ReportBody, WidgetCard, type Fmt, AnalysisCardView, type BodyCard } from './widgets';

export interface EditorProps {
  reportId: number;
  kind: 'report' | 'dashboard';
  title: string;
  initialLayout: ReportLayout;
  initialData: ReportData;
  /** every account of the project (blocks can be added for accounts not yet in the report) */
  sources: SourceInfo[];
  currency: string;
  range: DateRange;
  comparison: DateRange | null;
  fmt: Fmt;
  brand?: string;
  customMetrics: { id: number; name: string; formula: string }[];
  /** analysis cards; the per-block ones render right after their block, in the editor as on the client link (spec v3 §4.4) */
  cards?: BodyCard[];
}

interface MetricDef {
  reference_key: string;
  component: Component;
  references: { title: string; description?: string; group?: string };
}
type Payload = { kind: 'metric'; slug: string; integrationId: number; key: string; component: Component; title: string } | { kind: 'special'; slug: 'manual' | 'analysis' | 'calculated' | 'custom_chart' | 'infographic' | 'image' | 'container' } | { kind: 'blended'; key: string; title: string };

// dictionary keys per component, resolved with t at render (spec v3 §5)
const COMP_LABEL: Record<string, string> = { number_v1: 'editor.comp_number_v1', chart_v1: 'editor.comp_chart_v1', datatable_v1: 'editor.comp_datatable_v1', funnel_v1: 'editor.comp_funnel_v1', container_v1: 'editor.comp_container_v1', analysis_v1: 'editor.comp_analysis_v1', empty_v1: 'editor.comp_empty_v1', calculated_v1: 'editor.comp_calculated_v1', custom_chart_v1: 'editor.comp_custom_chart_v1', infographic_v1: 'editor.comp_infographic_v1', image_v1: 'editor.comp_image_v1' };
const SPECIAL_COMPONENT = { manual: 'empty_v1', analysis: 'analysis_v1', calculated: 'calculated_v1', custom_chart: 'custom_chart_v1', infographic: 'infographic_v1', image: 'image_v1', container: 'container_v1' } as const;
const SPECIAL_KEY = { manual: 'number', analysis: 'text', calculated: 'formula', custom_chart: 'chart', infographic: 'tile', image: 'image', container: 'campaigns' } as const;
const SPECIAL_DEFAULT: Record<keyof typeof SPECIAL_KEY, () => WidgetCustom> = {
  manual: () => ({ title: 'Manual metric', value: 0 }),
  analysis: () => ({ title: 'Analysis', html: '' }),
  calculated: () => ({ title: 'Calculated metric', formula: '' }),
  custom_chart: () => ({ title: 'Custom chart', chartType: 'line', series: [] }),
  infographic: () => ({ title: 'Progress', kind: 'progress', target: 100 }),
  image: () => ({ title: 'Image', fit: 'contain' }),
  container: () => ({ title: 'Campaigns', metrics: ['spend', 'impressions', 'clicks', 'cpc', 'conversions'], rows: 10, showStatus: true }),
};
const componentOfPayload = (p: Payload): Component => (p.kind === 'metric' ? p.component : p.kind === 'blended' ? 'number_v1' : SPECIAL_COMPONENT[p.slug]);
const parsePayload = (s: string): Payload | null => {
  try {
    return JSON.parse(s) as Payload;
  } catch {
    return null;
  }
};
const compOf = (w: LayoutWidget) => w.component;
const kindOf = (c: Component) => (c === 'chart_v1' || c === 'custom_chart_v1' ? 'chart' : c === 'datatable_v1' ? 'table' : c === 'funnel_v1' ? 'funnel' : c === 'analysis_v1' ? 'text' : c === 'infographic_v1' ? 'tile' : c === 'image_v1' ? 'image' : c === 'container_v1' ? 'container' : 'number');

export function ReportEditor(props: EditorProps) {
  const t = useT();
  const { reportId, kind, sources, currency, range, comparison, fmt, brand, customMetrics, cards } = props;
  const [layout, setLayoutState] = useState<ReportLayout>(props.initialLayout);
  const [data, setData] = useState<ReportData>(props.initialData);
  const history = useRef<ReportLayout[]>([]);
  const future = useRef<ReportLayout[]>([]);
  const lastCoalesce = useRef<string | null>(null);
  const [, rerender] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelBlock, setPanelBlock] = useState<string | null>(null);
  // campaign scope of a block (spec v3 §2.2): the gear opens an inline editor; Apply writes block.campaigns
  const [scopeBlock, setScopeBlock] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState<CampaignScope>({ mode: 'all' });
  const [optionsBlock, setOptionsBlock] = useState<string | null>(null);
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);

  const ctx = useMemo(() => ({ sources, currency, range, comparison }), [sources, currency, range, comparison]);
  const composed = useMemo(() => composeReport(data, layout, ctx, { includeHidden: true }), [data, layout, ctx]);
  const rendered = useMemo(() => {
    const m = new Map<string, RenderedBlock>();
    for (const s of composed.sections) for (const b of s.blocks) if (b.id) m.set(b.id, b);
    return m;
  }, [composed]);
  const rawIdx = useMemo(() => indexValues(data), [data]);

  // ───── autosave (debounced, serialised, with a queued re-save when edits land mid-flight) ─────
  const latest = useRef(layout);
  latest.current = layout;
  const inflight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doSave = useCallback(async () => {
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    setSaveState('saving');
    const snapshot = latest.current;
    const r = await saveLayoutAction({ reportId, layout: snapshot });
    inflight.current = false;
    if (!r.ok) {
      setSaveState('error');
      setError(r.error);
      return;
    }
    setError(null);
    setData(r.data);
    if (queued.current || latest.current !== snapshot) {
      queued.current = false;
      void doSave();
    } else setSaveState('saved');
  }, [reportId]);
  const schedule = useCallback(
    (delay: number) => {
      setSaveState((s) => (s === 'saving' ? s : 'dirty'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void doSave(), delay);
    },
    [doSave]
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'saved') return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const commit = useCallback(
    (next: ReportLayout, opts: { coalesce?: string; immediate?: boolean } = {}) => {
      if (!opts.coalesce || lastCoalesce.current !== opts.coalesce) {
        history.current = [...history.current.slice(-19), latest.current];
        future.current = [];
      }
      lastCoalesce.current = opts.coalesce ?? null;
      latest.current = next;
      setLayoutState(next);
      schedule(opts.immediate ? 0 : 800);
    },
    [schedule]
  );
  const mutate = (fn: (l: ReportLayout) => ReportLayout, opts?: { coalesce?: string; immediate?: boolean }) => commit(fn(latest.current), opts);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    lastCoalesce.current = null;
    latest.current = prev;
    setLayoutState(prev);
    rerender((n) => n + 1);
    schedule(400);
  }, [schedule]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(latest.current);
    lastCoalesce.current = null;
    latest.current = next;
    setLayoutState(next);
    rerender((n) => n + 1);
    schedule(400);
  }, [schedule]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) (e.preventDefault(), undo());
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') (e.preventDefault(), redo());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ───── mutations ─────
  const mapBlock = (l: ReportLayout, id: string, fn: (b: LayoutBlock) => LayoutBlock): ReportLayout => ({ ...l, blocks: l.blocks.map((b) => (b.id === id ? fn(b) : b)) });
  const mapWidget = (l: ReportLayout, id: string, fn: (w: LayoutWidget) => LayoutWidget): ReportLayout => ({ ...l, blocks: l.blocks.map((b) => ({ ...b, widgets: b.widgets.map((w) => (w.id === id ? fn(w) : w)) })) });
  const blockOf = (id: string) => latest.current.blocks.find((b) => b.widgets.some((w) => w.id === id));
  const widgetOf = (id: string) => latest.current.blocks.flatMap((b) => b.widgets).find((w) => w.id === id);

  const addWidget = (blockId: string, p: Payload, pos?: { x: number; y: number }) => {
    const block = latest.current.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const component = componentOfPayload(p);
    const size = DEFAULT_SIZE[component];
    const at = pos ?? firstFree(block.widgets, size.w, size.h);
    const base = { id: newId(), component, ...at, ...size };
    const w: LayoutWidget =
      p.kind === 'metric'
        ? { ...base, slug: p.slug, key: p.key, integrationId: p.integrationId }
        : p.kind === 'blended'
          ? { ...base, slug: 'custom', key: p.key, integrationId: 0 }
          : { ...base, slug: p.slug, key: SPECIAL_KEY[p.slug], integrationId: p.slug === 'container' ? block.integrationId : 0, custom: SPECIAL_DEFAULT[p.slug]() };
    mutate((l) => mapBlock(l, blockId, (b) => ({ ...b, widgets: [...b.widgets, w] })), { immediate: true });
    if (p.kind === 'special') setSelected(w.id);
  };
  const removeWidget = (id: string) => {
    mutate((l) => ({ ...l, blocks: l.blocks.map((b) => ({ ...b, widgets: b.widgets.filter((w) => w.id !== id) })) }));
    if (selected === id) setSelected(null);
  };
  const duplicateWidget = (id: string) => {
    const w = widgetOf(id);
    const b = blockOf(id);
    if (!w || !b) return;
    const at = firstFree(b.widgets, w.w, w.h);
    mutate((l) => mapBlock(l, b.id, (bl) => ({ ...bl, widgets: [...bl.widgets, { ...w, id: newId(), ...at, custom: w.custom ? { ...w.custom } : undefined }] })), { immediate: true });
  };
  const updateCustom = (id: string, patch: Partial<WidgetCustom>, coalesce?: string) => {
    const w = widgetOf(id);
    if (!w) return;
    const periodChanged = 'period' in patch && JSON.stringify(patch.period) !== JSON.stringify(w.custom?.period);
    const formulaChanged = 'formula' in patch;
    mutate((l) => mapWidget(l, id, (x) => {
      const custom: WidgetCustom = { ...(x.custom ?? {}), ...patch };
      for (const k of Object.keys(custom) as (keyof WidgetCustom)[]) if (custom[k] === undefined) delete custom[k];
      return { ...x, custom: Object.keys(custom).length ? custom : undefined };
    }), { coalesce: coalesce ? `${id}:${coalesce}` : undefined, immediate: periodChanged || formulaChanged });
  };
  const setBlockWidgets = (blockId: string, widgets: LayoutWidget[]) => mutate((l) => mapBlock(l, blockId, (b) => ({ ...b, widgets })));
  const renameBlock = (blockId: string, title: string) => mutate((l) => mapBlock(l, blockId, (b) => ({ ...b, title })), { coalesce: `${blockId}:title` });
  const moveBlock = (blockId: string, dir: -1 | 1) =>
    mutate((l) => {
      const i = l.blocks.findIndex((b) => b.id === blockId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.blocks.length) return l;
      const blocks = [...l.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...l, blocks };
    });
  const removeBlock = (blockId: string) => {
    if (!confirm(t('editor.removeBlockConfirm'))) return;
    mutate((l) => ({ ...l, blocks: l.blocks.filter((b) => b.id !== blockId) }));
    if (panelBlock === blockId) setPanelBlock(null);
  };
  const addBlock = (src: SourceInfo | null) => {
    const def = src ? getIntegrationDef(src.slug) : null;
    const b: LayoutBlock = { id: newId('b'), title: src ? def?.name ?? src.name : t('editor.customBlock'), integrationId: src?.id ?? 0, slug: src?.slug ?? 'custom', widgets: [] };
    mutate((l) => ({ ...l, blocks: [...l.blocks, b] }), { immediate: true });
    setPanelBlock(b.id);
  };

  const downloadCsv = (b: RenderedBlock) => {
    const csv = reportToCsv({ range, comparison, generated_at: '', sources: [], sections: [{ id: 'w', title: b.widget.label, blocks: [b] }] });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${b.widget.label.replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const selectedWidget = selected ? widgetOf(selected) : undefined;
  // the settings panel reads the raw value under the block's effective scope (review I7)
  const selectedRawKey = useMemo(() => {
    if (!selectedWidget) return null;
    const blk = layout.blocks.find((x) => x.widgets.some((y) => y.id === selectedWidget.id));
    return blk ? widgetValueKey(selectedWidget, blk, data) : valueKey(selectedWidget);
  }, [selectedWidget, layout, data]);
  const panel = panelBlock ? layout.blocks.find((b) => b.id === panelBlock) : undefined;

  return (
    <div className="report-root space-y-6" style={themeVars(layout.theme, brand ?? '#1a36e6')}>
      {/* ───── toolbar ───── */}
      <div className="no-print card sticky top-2 z-20 flex flex-wrap items-center gap-2 px-3 py-2">
        <SaveIndicator state={saveState} onRetry={() => void doSave()} />
        <span className="mx-1 h-5 w-px bg-[var(--line)]" />
        <button className="btn px-2" title={t('editor.undo')} disabled={history.current.length === 0} onClick={undo}>
          <Undo2 size={14} />
        </button>
        <button className="btn px-2" title={t('editor.redo')} disabled={future.current.length === 0} onClick={redo}>
          <Redo2 size={14} />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--line)]" />
        <AddBlockMenu sources={sources} onAdd={addBlock} />
        <button className="btn" onClick={() => setTemplateDialog((v) => !v)}>
          <LayoutTemplate size={14} /> {t('editor.saveAsTemplate')}
        </button>
        <button className={clsx('btn', lookOpen && 'border-brand text-brand')} onClick={() => setLookOpen((v) => !v)} aria-expanded={lookOpen}>
          <Palette size={14} /> {t('editor.look')}
        </button>
        {!preview && <AnalyseAllButton reportId={reportId} onDone={setAnalysisNote} />}
        <button className={clsx('btn', preview && 'border-brand text-brand')} onClick={() => (setPreview((v) => !v), setSelected(null), setPanelBlock(null))}>
          {preview ? <Settings2 size={14} /> : <Eye size={14} />} {preview ? t('editor.backToEditing') : t('editor.previewAsClient')}
        </button>
        <span className="ml-auto hidden text-xs text-slate-400 md:inline">{t('editor.gridHint')}</span>
      </div>
      {error && (
        <div className="no-print flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {analysisNote && (
        <div className="no-print flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600" data-analysis-note>
          <span>{analysisNote}</span>
          <button type="button" className="text-slate-400 hover:text-slate-700" aria-label={t('common.dismiss')} onClick={() => setAnalysisNote(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      {templateDialog && <SaveTemplateDialog reportId={reportId} defaultTitle={`${props.title} template`} onClose={() => setTemplateDialog(false)} />}
      {lookOpen && !preview && <LookPanel theme={layout.theme} clientColor={brand ?? '#1a36e6'} onChange={(t) => mutate((l) => (t ? { ...l, theme: t } : (({ theme: _t, ...rest }) => rest)(l)), { coalesce: 'theme' })} onClose={() => setLookOpen(false)} />}

      {/* ───── body: [add-metrics drawer] [blocks] [settings drawer] ───── */}
      {preview ? (
        <ReportBody data={composeReport(data, layout, ctx)} fmt={fmt} brand={brand} cards={cards} />
      ) : (
        <div className="flex items-start gap-5">
          {panel && <AddMetricsPanel block={panel} sources={sources} customMetrics={customMetrics} onAdd={(p) => addWidget(panel.id, p)} onClose={() => setPanelBlock(null)} />}
          <div className="min-w-0 flex-1 space-y-8">
          {layout.blocks.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">{t('editor.noBlocks')}</div>}
          {layout.blocks.map((b, bi) => {
            const sec = composed.sections.find((s) => s.id === b.id);
            const src = sec?.source;
            const platformColor = (src && getIntegrationDef(src.slug)?.color) || '#636d7c';
            const blockColor = blockColorOf(layout.theme, b.id, platformColor);
            const palette = paletteFor(layout.theme?.palette, layout.theme?.accent ?? brand ?? '#1a36e6');
            const BlockIconC = b.icon ? ICONS[b.icon] : null;
            return (
              <Fragment key={b.id}>
              <section data-block={b.id} className="space-y-3" style={blockVars(layout.theme, b.id, platformColor)}>
                <div className={clsx('flex flex-wrap items-center gap-2', b.hideHeader && 'opacity-60')}>
                  {BlockIconC && (
                    <span className="block-icon" data-icon={b.icon} aria-hidden="true">
                      <BlockIconC size={16} />
                    </span>
                  )}
                  <input className="display min-w-[8rem] flex-1 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold outline-none hover:border-[var(--line)] focus:border-brand focus:bg-white md:max-w-md" value={b.title} onChange={(e) => renameBlock(b.id, e.target.value)} aria-label={t('editor.blockTitle')} />
                  {src && src.integrationId > 0 ? (
                    <>
                      <PlatformBadge slug={src.slug} name={src.platform} />
                      <span className="text-[11px] font-medium text-ink-3">{src.account_name}</span>
                      {!preview && isAdsSlug(src.slug) && (
                        <button
                          className={clsx('btn px-2 py-1 text-[11px]', (b.campaigns || scopeBlock === b.id) && 'border-brand text-brand')}
                          title={t('campaigns.title')}
                          onClick={() => {
                            setScopeDraft(effectiveScope(b, data) ?? { mode: 'all' });
                            setScopeBlock(scopeBlock === b.id ? null : b.id);
                          }}
                        >
                          {scopeSummary(effectiveScope(b, data))}
                        </button>
                      )}
                      {!preview && <BlockColor value={layout.theme?.blocks?.[b.id]?.color} fallback={getIntegrationDef(src.slug)?.color ?? '#636d7c'} onChange={(c) => mutate((l) => withBlockColor(l, b.id, c), { coalesce: `color:${b.id}` })} />}
                    </>
                  ) : (
                    <span className="eyebrow">{t('editor.customBlock')}</span>
                  )}
                  {b.hideHeader && <span className="badge bg-slate-100 text-[10px] text-slate-500" title={t('editor.hiddenTitle')}>{t('editor.hiddenTag')}</span>}
                  <div className="no-print ml-auto flex items-center gap-1">
                    {!preview && (
                      <button className={clsx('btn px-2 py-1', (b.icon || b.subtitle || b.hideHeader || optionsBlock === b.id) && 'border-brand text-brand')} title={t('editor.blockOptionsTitle')} data-block-options-toggle onClick={() => setOptionsBlock(optionsBlock === b.id ? null : b.id)}>
                        <Settings2 size={14} /> {t('editor.options')}
                      </button>
                    )}
                    {!preview && <BlockAnalyseMenu reportId={reportId} blockId={b.id} onDone={setAnalysisNote} />}
                    <button className={clsx('btn py-1', panelBlock === b.id && 'border-brand text-brand')} onClick={() => setPanelBlock(panelBlock === b.id ? null : b.id)}>
                      <Plus size={14} /> {t('editor.addMetrics')}
                    </button>
                    <button className="btn px-2 py-1" title={t('editor.moveUp')} disabled={bi === 0} onClick={() => moveBlock(b.id, -1)}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn px-2 py-1" title={t('editor.moveDown')} disabled={bi === layout.blocks.length - 1} onClick={() => moveBlock(b.id, 1)}>
                      <ArrowDown size={14} />
                    </button>
                    <button className="btn-danger px-2 py-1" title={t('editor.removeBlock')} onClick={() => removeBlock(b.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {optionsBlock === b.id && !preview && (
                  <div className="card no-print space-y-3 p-4" data-block-options>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <label className="label" htmlFor={`sub-${b.id}`}>
                          {t('common.subtitle')}
                        </label>
                        <input id={`sub-${b.id}`} className="input" maxLength={120} value={b.subtitle ?? ''} placeholder={t('editor.subtitlePlaceholder')} onChange={(e) => mutate((l) => mapBlock(l, b.id, (x) => (e.target.value ? { ...x, subtitle: e.target.value } : (({ subtitle: _s, ...rest }) => rest)(x))), { coalesce: `${b.id}:subtitle` })} />
                      </div>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <input type="checkbox" name="showHeader" checked={!b.hideHeader} onChange={(e) => mutate((l) => mapBlock(l, b.id, (x) => (e.target.checked ? (({ hideHeader: _h, ...rest }) => rest)(x) : { ...x, hideHeader: true })), { immediate: true })} /> {t('editor.showHeader')}
                      </label>
                    </div>
                    <div>
                      <div className="label">{t('editor.icon')}</div>
                      <div className="flex flex-wrap gap-1" data-icon-grid>
                        <button type="button" className={clsx('btn px-2 py-1 text-[11px]', !b.icon && 'border-brand text-brand')} onClick={() => mutate((l) => mapBlock(l, b.id, (x) => (({ icon: _i, ...rest }) => rest)(x)), { immediate: true })}>
                          {t('common.none')}
                        </button>
                        {ICON_NAMES.map((name) => {
                          const I = ICONS[name];
                          return (
                            <button key={name} type="button" title={name} aria-label={name} className={clsx('btn px-2 py-1', b.icon === name && 'border-brand text-brand')} onClick={() => mutate((l) => mapBlock(l, b.id, (x) => ({ ...x, icon: name })), { immediate: true })}>
                              <I size={14} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {scopeBlock === b.id && src && (
                  <div className="card no-print space-y-3 p-4" data-block-scope>
                    <div className="label">{t('editor.blockCampaigns')}</div>
                    <CampaignScopeEditor key={b.id} value={b.campaigns} load={() => listCampaignsAction(src.integrationId)} name={null} onChange={setScopeDraft} />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary"
                        onClick={() => {
                          // stored as chosen, "all" included, so a block can override a narrowing account default (review I6)
                          mutate((l) => withBlockScope(l, b.id, scopeDraft), { immediate: true });
                          setScopeBlock(null);
                        }}
                      >
                        {t('editor.applyScope')}
                      </button>
                      <button className="btn" onClick={() => setScopeBlock(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
                <GridCanvas
                  items={b.widgets}
                  editable
                  onChange={(items) => setBlockWidgets(b.id, items)}
                  minSize={(w) => MIN_SIZE[compOf(w)]}
                  dropSize={(p) => {
                    const pl = parsePayload(p);
                    return pl ? DEFAULT_SIZE[componentOfPayload(pl)] : { w: 3, h: 2 };
                  }}
                  onDropNew={(p, pos) => {
                    const pl = parsePayload(p);
                    if (pl) addWidget(b.id, pl, pos);
                  }}
                  emptyHint={b.integrationId ? t('editor.emptyBlockHint') : t('editor.emptyCustomHint')}
                  renderItem={(w, api) => {
                    const rb = rendered.get(w.id);
                    const isNumber = rb?.widget.value.type === 'number' || w.component === 'number_v1' || w.component === 'empty_v1' || w.component === 'calculated_v1';
                    return (
                      <div className={clsx('relative h-full', selected === w.id && 'ritem-selected', w.custom?.hidden && 'ritem-hidden')} data-kind={kindOf(w.component)} onClick={() => setSelected(w.id)}>
                        {rb ? <WidgetCard b={rb} fmt={fmt} brand={blockColor} palette={palette} grid /> : <div className="card h-full" />}
                        <div className="rtoolbar no-print" onClick={(e) => e.stopPropagation()}>
                          <button {...api.dragHandle} aria-label={t('editor.dragToMove')}>
                            <GripVertical size={14} />
                          </button>
                          {isNumber && (
                            <button className={clsx(w.custom?.highlight && 'on')} title={w.custom?.highlight ? t('editor.removeHighlight') : t('editor.highlight')} onClick={() => updateCustom(w.id, { highlight: !w.custom?.highlight || undefined })}>
                              <Star size={14} className={w.custom?.highlight ? 'fill-current' : ''} />
                            </button>
                          )}
                          <button title={t('editor.widgetSettings')} className={clsx(selected === w.id && 'on')} onClick={() => setSelected(selected === w.id ? null : w.id)}>
                            <Settings2 size={14} />
                          </button>
                          <button title={w.custom?.hidden ? t('editor.showOnClient') : t('editor.hideFromClient')} onClick={() => updateCustom(w.id, { hidden: !w.custom?.hidden || undefined })}>
                            {w.custom?.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button title={t('common.remove')} className="hover:!text-red-600" onClick={() => removeWidget(w.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {api.resizeHandle}
                      </div>
                    );
                  }}
                />
              </section>
              {(cards ?? []).filter((c) => c.blockId === b.id).map((c) => (
                <AnalysisCardView key={c.id} c={c} />
              ))}
              </Fragment>
            );
          })}
          </div>
          {selectedWidget && (
            <SettingsPanel
          w={selectedWidget}
          rendered={rendered.get(selectedWidget.id)}
          raw={selectedRawKey ? rawIdx.get(selectedRawKey) : undefined}
          rawIdx={rawIdx}
          sources={sources}
          decimal={fmt.decimalSeparatorFormat === 'dot_comma' ? 'dot_comma' : 'comma_dot'}
          range={range}
          comparison={comparison}
          kind={kind}
          onChange={(patch, coalesce) => updateCustom(selectedWidget.id, patch, coalesce)}
          onRemove={() => removeWidget(selectedWidget.id)}
          onDuplicate={() => duplicateWidget(selectedWidget.id)}
          onExport={rendered.get(selectedWidget.id) && !['text', 'error'].includes(rendered.get(selectedWidget.id)!.widget.value.type) ? () => downloadCsv(rendered.get(selectedWidget.id)!) : undefined}
          onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Drawer shell: a sticky side column on large screens, a fixed overlay on small ones. */
const DRAWER = 'no-print z-40 flex flex-col bg-white shadow-xl fixed inset-y-0 w-[22rem] max-w-full lg:sticky lg:top-16 lg:inset-auto lg:z-10 lg:w-80 lg:shrink-0 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:rounded-xl lg:border lg:border-[var(--line)] lg:shadow-sm';

// ───────────── toolbar bits ─────────────
function SaveIndicator({ state, onRetry }: { state: 'saved' | 'dirty' | 'saving' | 'error'; onRetry: () => void }) {
  const t = useT();
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" /> {t('common.saving')}
      </span>
    );
  if (state === 'error')
    return (
      <button className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600" onClick={onRetry}>
        <AlertTriangle size={14} /> {t('editor.saveFailed')}
      </button>
    );
  if (state === 'dirty') return <span className="text-sm text-slate-400">{t('editor.unsaved')}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
      <Check size={14} /> {t('common.saved')}
    </span>
  );
}

function AddBlockMenu({ sources, onAdd }: { sources: SourceInfo[]; onAdd: (s: SourceInfo | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        <Plus size={14} /> {t('editor.addBlock')} <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-full z-40 mt-1 max-h-80 w-72 overflow-y-auto p-1">
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => (onAdd(null), setOpen(false))}>
              <span className="badge bg-slate-100 text-slate-600">{t('editor.custom')}</span> {t('editor.customBlock')}
            </button>
            <div className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('editor.connectedAccounts')}</div>
            {sources.map((s) => {
              const def = getIntegrationDef(s.slug);
              return (
                <button key={s.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => (onAdd(s), setOpen(false))}>
                  <PlatformIcon slug={s.slug} size={16} />
                  <span className="truncate">
                    <span className="font-semibold">{def?.name ?? s.slug}</span> <span className="text-slate-500">· {s.name}</span>
                  </span>
                </button>
              );
            })}
            {sources.length === 0 && <div className="px-2 py-2 text-xs text-slate-400">{t('editor.noAccounts')}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function SaveTemplateDialog({ reportId, defaultTitle, onClose }: { reportId: number; defaultTitle: string; onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; id: number; title: string } | { ok: false; error: string } | null>(null);
  return (
    <div className="no-print card space-y-3 border-brand p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{t('editor.saveLayoutAsTemplate')}</div>
        <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">{t('templates.name')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.description')}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('common.optional')} />
        </div>
      </div>
      <div className="text-xs text-slate-500">{t('editor.saveTemplateHint')}</div>
      {result && !result.ok && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</div>}
      {result && result.ok ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Check size={14} /> Saved “{result.title}”.{' '}
          <Link className="font-semibold underline" href={`/templates/${result.id}`}>
            {t('templates.open')}
          </Link>
        </div>
      ) : (
        <button
          className="btn-primary"
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await saveReportAsTemplateAction({ reportId, title, description });
            setBusy(false);
            setResult(r.ok ? { ok: true, id: r.id, title: r.title } : { ok: false, error: r.error });
          }}
        >
          {busy ? t('editor.saving') : t('editor.saveTemplate')}
        </button>
      )}
    </div>
  );
}

// ───────────── Add metrics drawer ─────────────
function AddMetricsPanel({ block, sources, customMetrics, onAdd, onClose }: { block: LayoutBlock; sources: SourceInfo[]; customMetrics: EditorProps['customMetrics']; onAdd: (p: Payload) => void; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<'predefined' | 'custom'>('predefined');
  const fixed = block.integrationId > 0 ? sources.find((s) => s.id === block.integrationId) : undefined;
  const [sourceId, setSourceId] = useState<number>(fixed?.id ?? sources[0]?.id ?? 0);
  const source = fixed ?? sources.find((s) => s.id === sourceId);
  const [search, setSearch] = useState('');
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setSourceId(fixed?.id ?? sources[0]?.id ?? 0);
  }, [block.id, fixed?.id, sources]);
  useEffect(() => {
    if (!source) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v2/metrics?integration_slug=${source.slug}&integration_id=${source.id}&per_page=100&search=${encodeURIComponent(search)}`, { signal: ctrl.signal });
        const j = await res.json();
        setMetrics(j.data ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [source?.id, source?.slug, search]);
  const grouped = useMemo(() => {
    const m = new Map<string, MetricDef[]>();
    for (const d of metrics) m.set(d.references.group ?? 'Other', [...(m.get(d.references.group ?? 'Other') ?? []), d]);
    return [...m];
  }, [metrics]);
  const payloadFor = (d: MetricDef): Payload => ({ kind: 'metric', slug: source!.slug, integrationId: source!.id, key: d.reference_key.split(':').slice(1).join(':'), component: d.component, title: d.references.title });
  const dragProps = (p: Payload) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      const s = JSON.stringify(p);
      e.dataTransfer.setData(DND_TYPE, s);
      e.dataTransfer.effectAllowed = 'copy';
      setDragPayload(s);
    },
    onDragEnd: () => setDragPayload(null),
  });
  const inBlock = (key: string, iid: number) => block.widgets.some((w) => w.key === key && w.integrationId === iid && !w.custom?.period);
  const specials: { slug: keyof typeof SPECIAL_KEY; title: string; hint: string }[] = [
    { slug: 'analysis', title: t('editor.spAnalysis'), hint: t('editor.spAnalysisHint') },
    { slug: 'manual', title: t('editor.spManual'), hint: t('editor.spManualHint') },
    { slug: 'calculated', title: t('editor.spCalculated'), hint: t('editor.spCalculatedHint') },
    { slug: 'custom_chart', title: t('editor.spCustomChart'), hint: t('editor.spCustomChartHint') },
    { slug: 'infographic', title: t('editor.spInfographic'), hint: t('editor.spInfographicHint') },
    { slug: 'image', title: t('editor.spImage'), hint: t('editor.spImageHint') },
    ...(isAdsSlug(block.slug) ? [{ slug: 'container' as const, title: t('editor.spContainer'), hint: t('editor.spContainerHint') }] : []),
  ];
  return (
    <aside data-add-metrics className={clsx(DRAWER, 'left-0 border-r border-[var(--line)]')}>
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('editor.addMetricsTo')}</div>
          <div className="truncate text-sm font-semibold">{block.title}</div>
        </div>
        <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="flex border-b border-[var(--line)] text-sm">
        {(['predefined', 'custom'] as const).map((tb) => (
          <button key={tb} className={clsx('flex-1 px-3 py-2 font-medium', tab === tb ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:text-slate-700')} onClick={() => setTab(tb)}>
            {tb === 'predefined' ? t('editor.predefinedMetrics') : t('editor.customizable')}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'predefined' ? (
          <div className="space-y-3">
            {!fixed && (
              <select className="input" value={sourceId} onChange={(e) => setSourceId(Number(e.target.value))}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getIntegrationDef(s.slug)?.name ?? s.slug} · {s.name}
                  </option>
                ))}
              </select>
            )}
            <input className="input" placeholder={t('editor.searchMetrics')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <div className="text-xs text-slate-400">{t('editor.drawerHint')}</div>
            {loading && <div className="text-xs text-slate-400">{t('common.loading')}</div>}
            {!loading && !source && <div className="text-xs text-slate-400">{t('editor.connectFirst')}</div>}
            {grouped.map(([g, list]) => (
              <div key={g}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g}</div>
                <div className="space-y-0.5">
                  {list.map((d) => {
                    const p = payloadFor(d);
                    const has = p.kind === 'metric' && inBlock(p.key, p.integrationId);
                    return (
                      <button key={d.reference_key} {...dragProps(p)} onClick={() => onAdd(p)} className={clsx('flex w-full cursor-grab items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-50 active:cursor-grabbing', has && 'opacity-60')} title={d.references.description}>
                        <span className="truncate">{metricLabel({ reference_key: d.reference_key, title: d.references.title }, locale)}</span>
                        <span className="ml-2 flex shrink-0 items-center gap-1">
                          {has && <Check size={11} className="text-emerald-600" />}
                          <span className="rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{COMP_LABEL[d.component] ? t(COMP_LABEL[d.component]) : d.component}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {specials.map((s) => {
              const p: Payload = { kind: 'special', slug: s.slug };
              return (
                <button key={s.slug} {...dragProps(p)} onClick={() => onAdd(p)} className="card w-full cursor-grab p-3 text-left hover:border-brand active:cursor-grabbing">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    {s.title}
                    <span className="rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{t(COMP_LABEL[SPECIAL_COMPONENT[s.slug]])}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.hint}</div>
                </button>
              );
            })}
            {customMetrics.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('editor.blendedWorkspace')}</div>
                <div className="space-y-0.5">
                  {customMetrics.map((m) => {
                    const p: Payload = { kind: 'blended', key: `cm_${m.id}`, title: m.name };
                    return (
                      <button key={m.id} {...dragProps(p)} onClick={() => onAdd(p)} className="flex w-full cursor-grab items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-50" title={m.formula}>
                        <span className="truncate">{m.name}</span>
                        <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">KPI</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// ───────────── Settings drawer ─────────────
interface SettingsProps {
  w: LayoutWidget;
  rendered?: RenderedBlock;
  raw?: RenderedBlock;
  rawIdx: Map<string, RenderedBlock>;
  sources: SourceInfo[];
  range: DateRange;
  comparison: DateRange | null;
  kind: 'report' | 'dashboard';
  decimal: 'comma_dot' | 'dot_comma';
  onChange: (patch: Partial<WidgetCustom>, coalesce?: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onExport?: () => void;
  onClose: () => void;
}
const FORMATS: Format[] = ['number', 'currency', 'percent', 'decimal', 'duration'];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SettingsPanel({ w, rendered, raw, rawIdx, sources, range, comparison, kind, decimal, onChange, onRemove, onDuplicate, onExport, onClose }: SettingsProps) {
  const t = useT();
  const c = w.custom ?? {};
  const comp = w.component;
  const baseLabel = raw?.widget.label ?? rendered?.widget.label ?? w.key;
  const baseDesc = raw?.widget.description ?? '';
  const isNumber = comp === 'number_v1' || comp === 'empty_v1' || comp === 'calculated_v1';
  const isTime = rendered?.widget.value.type === 'chart' && /^\d{4}-\d{2}-\d{2}$/.test((raw?.widget.value as any)?.labels?.[0] ?? (rendered.widget.value as any).labels?.[0] ?? '');
  const tableRaw = raw?.widget.value.type === 'table' ? raw.widget.value : undefined;
  const predefined = !['manual', 'analysis', 'calculated', 'custom_chart', 'infographic', 'image', 'container'].includes(w.slug);
  const [periodDraft, setPeriodDraft] = useState<DateRange>(c.period ?? range);
  useEffect(() => setPeriodDraft(c.period ?? range), [w.id, c.period, range]);
  const refOptions = useMemo(() => {
    const out: { ref: string; label: string }[] = [];
    for (const [k, b] of rawIdx) {
      if (b.widget.value.type !== 'number' || k.includes('@')) continue;
      const src = sources.find((s) => s.id === b.integrationId);
      const prefix = src ? getIntegrationDef(src.slug)?.prefix : b.integrationId === 0 ? null : null;
      if (!prefix) continue;
      const ref = `${prefix}:${b.widget.key}`;
      if (!out.some((o) => o.ref === ref)) out.push({ ref, label: `${b.platform} · ${b.widget.label}` });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [rawIdx, sources]);
  const apiQuery = predefined && w.integrationId > 0 && raw ? JSON.stringify({ start: c.period?.start ?? range.start, end: c.period?.end ?? range.end, integration_id: w.integrationId, metrics: [{ reference_key: raw.widget.reference_key }], ...(comparison && !c.period ? { comparison_start: comparison.start, comparison_end: comparison.end } : {}) }, null, 2) : null;

  return (
    <aside className={clsx(DRAWER, 'right-0 border-l border-[var(--line)]')}>
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('editor.compSettings', { comp: COMP_LABEL[comp] ? t(COMP_LABEL[comp]) : comp })}</div>
          <div className="truncate text-sm font-semibold">{c.title || baseLabel}</div>
        </div>
        <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <div>
            <label className="label">{t('common.title')}</label>
            <input className="input" value={c.title ?? ''} placeholder={baseLabel} onChange={(e) => onChange({ title: e.target.value || undefined }, 'title')} />
          </div>
          <div>
            <label className="label">{t('common.description')}</label>
            <input className="input" value={c.description ?? ''} placeholder={baseDesc || t('editor.tooltipHint')} onChange={(e) => onChange({ description: e.target.value || undefined }, 'description')} />
          </div>
        </div>

        {w.slug === 'manual' && (
          <div className="space-y-2">
            <div className="label">{t('editor.values')}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">{t('editor.current')}</label>
                <input className="input" type="number" step="any" value={c.value ?? ''} onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) }, 'value')} />
              </div>
              <div>
                <label className="text-xs text-slate-500">{t('common.previous')}</label>
                <input className="input" type="number" step="any" value={c.previous ?? ''} onChange={(e) => onChange({ previous: e.target.value === '' ? null : Number(e.target.value) }, 'previous')} />
              </div>
            </div>
            <FormatSelect value={c.format ?? 'number'} onChange={(f) => onChange({ format: f })} />
          </div>
        )}

        {w.slug === 'analysis' && (
          <div className="space-y-2">
            <label className="label">{t('editor.text')}</label>
            <textarea className="input min-h-[200px] text-sm" value={c.html ?? ''} onChange={(e) => onChange({ html: e.target.value }, 'html')} placeholder={t('editor.textPlaceholder')} />
            <div className="text-xs text-slate-400">{t('editor.htmlStripped')}</div>
          </div>
        )}

        {w.slug === 'calculated' && (
          <div className="space-y-2">
            <label className="label">{t('metrics.formula')}</label>
            <textarea className="input min-h-[72px] font-mono text-xs" value={c.formula ?? ''} onChange={(e) => onChange({ formula: e.target.value }, 'formula')} placeholder="({fb_ads:conversion_value} + {gads:conversion_value}) / ({fb_ads:spend} + {gads:spend})" />
            <div className="text-xs text-slate-400">+ − × ÷, parentheses, sum() avg() min() max() round(). A reference adds up every account of that platform in the report; use {'{'}&lt;integration id&gt;:key{'}'} for one account.</div>
            <FormatSelect value={c.format ?? 'decimal'} onChange={(f) => onChange({ format: f })} />
            {refOptions.length > 0 && (
              <details className="rounded-lg border border-[var(--line)] p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Metrics in this report ({refOptions.length})</summary>
                <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                  {refOptions.map((o) => (
                    <button key={o.ref} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-50" onClick={() => onChange({ formula: `${c.formula ?? ''}${c.formula?.trim() ? ' ' : ''}{${o.ref}}` })}>
                      <span className="truncate">{o.label}</span>
                      <code className="shrink-0 text-[11px] text-slate-400">{o.ref}</code>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {w.slug === 'custom_chart' && <CustomChartSettings c={c} sources={sources} decimal={decimal} onChange={onChange} />}
        {w.slug === 'infographic' && <TileSettings c={c} sources={sources} decimal={decimal} rawIdx={rawIdx} onChange={onChange} />}
        {w.slug === 'image' && <ImageSettings c={c} onChange={onChange} />}
        {w.slug === 'container' && <ContainerSettings c={c} sources={sources} integrationId={w.integrationId} rendered={rendered} onChange={onChange} />}

        {isNumber && (
          <div>
            <div className="label">{t('editor.comparison')}</div>
            <Toggle label={t('editor.showPrevious')} checked={c.showComparison !== false} onChange={(v) => onChange({ showComparison: v ? undefined : false })} />
            <Toggle label={t('editor.showVariation')} checked={c.showVariation !== false} onChange={(v) => onChange({ showVariation: v ? undefined : false })} />
            <Toggle label={t('editor.showAbsolute')} checked={!!c.showAbsolute} onChange={(v) => onChange({ showAbsolute: v || undefined })} />
            <Toggle label={t('editor.positiveBad')} checked={c.positiveBad ?? rendered?.widget.diff_type === 'positive_bad'} onChange={(v) => onChange({ positiveBad: v })} />
            <Toggle label={t('editor.highlight')} checked={!!c.highlight} onChange={(v) => onChange({ highlight: v || undefined })} />
          </div>
        )}

        {comp === 'chart_v1' && (
          <div className="space-y-2">
            <div>
              <label className="label">{t('editor.chartType')}</label>
              <div className="flex gap-1">
                {(isTime ? (['line', 'bar'] as const) : (['bar', 'pie'] as const)).map((t) => (
                  <button key={t} className={clsx('btn flex-1 py-1 capitalize', (c.chartType ?? (isTime ? 'line' : rendered && /gender|device|platform|content_type|payment/i.test(w.key) ? 'pie' : 'bar')) === t && 'border-brand text-brand')} onClick={() => onChange({ chartType: t })}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {isTime && (
              <div>
                <label className="label">{t('editor.groupBy')}</label>
                <div className="flex gap-1">
                  {(['day', 'week', 'month', 'quarter'] as const).map((g) => (
                    <button key={g} className={clsx('btn flex-1 px-1 py-1 capitalize', (c.groupBy ?? 'day') === g && 'border-brand text-brand')} onClick={() => onChange({ groupBy: g === 'day' ? undefined : g })}>
                      {g}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-xs text-slate-400">{t('editor.groupHint')}</div>
              </div>
            )}
          </div>
        )}

        {comp === 'datatable_v1' && tableRaw && (
          <div className="space-y-3">
            <div>
              <label className="label">{t('editor.visibleColumns')}</label>
              <div className="space-y-0.5">
                {tableRaw.columns.slice(1).map((col, i) => {
                  const hidden = c.hiddenColumns?.includes(col);
                  const order = c.columnOrder?.length ? [...c.columnOrder.filter((x) => tableRaw.columns.includes(x)), ...tableRaw.columns.slice(1).filter((x) => !c.columnOrder!.includes(x))] : tableRaw.columns.slice(1);
                  const pos = order.indexOf(col);
                  return (
                    <div key={col} className="flex items-center gap-1 text-sm">
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={!hidden} onChange={(e) => onChange({ hiddenColumns: e.target.checked ? (c.hiddenColumns ?? []).filter((x) => x !== col) : [...(c.hiddenColumns ?? []), col] })} />
                        <span className={clsx('truncate', hidden && 'text-slate-400 line-through')}>{tableRaw.columnLabels[i + 1]}</span>
                      </label>
                      <button className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={pos <= 0} title={t('editor.moveLeft')} onClick={() => onChange({ columnOrder: swap(order, pos, pos - 1) })}>
                        <ArrowUp size={12} />
                      </button>
                      <button className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={pos < 0 || pos >= order.length - 1} title={t('editor.moveRight')} onClick={() => onChange({ columnOrder: swap(order, pos, pos + 1) })}>
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t('editor.sortBy')}</label>
                <select className="input" value={c.sortBy ?? ''} onChange={(e) => onChange({ sortBy: e.target.value || undefined })}>
                  <option value="">{t('editor.default')}</option>
                  {tableRaw.columns.map((col, i) => (
                    <option key={col} value={col}>
                      {tableRaw.columnLabels[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('goals.direction')}</label>
                <select className="input" value={c.sortDir ?? 'desc'} onChange={(e) => onChange({ sortDir: e.target.value as 'asc' | 'desc' })}>
                  <option value="desc">{t('editor.descending')}</option>
                  <option value="asc">{t('editor.ascending')}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Rows ({tableRaw.rows.length} available)</label>
              <input className="input" type="number" min={1} max={tableRaw.rows.length} value={c.rows ?? ''} placeholder={String(tableRaw.rows.length)} onChange={(e) => onChange({ rows: e.target.value ? Math.max(1, Number(e.target.value)) : undefined }, 'rows')} />
            </div>
          </div>
        )}

        {predefined && (
          <div className="space-y-2">
            <div className="label">{t('editor.widgetPeriod')}</div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="date" value={periodDraft.start} onChange={(e) => setPeriodDraft({ ...periodDraft, start: e.target.value })} />
              <input className="input" type="date" value={periodDraft.end} onChange={(e) => setPeriodDraft({ ...periodDraft, end: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1 py-1" disabled={!periodDraft.start || !periodDraft.end || periodDraft.start > periodDraft.end || (periodDraft.start === range.start && periodDraft.end === range.end && !c.period)} onClick={() => onChange({ period: periodDraft.start === range.start && periodDraft.end === range.end ? undefined : periodDraft })}>
                {t('editor.applyPeriod')}
              </button>
              {c.period && (
                <button className="btn flex-1 py-1" onClick={() => onChange({ period: undefined })}>
                  {t('editor.useReportPeriod')}
                </button>
              )}
            </div>
            <div className="text-xs text-slate-400">
              {c.period ? t('editor.customPeriodNote', { start: c.period.start, end: c.period.end }) : kind === 'dashboard' ? t('editor.followsDashboardPreset') : t('editor.followsReportPeriod')}
            </div>
          </div>
        )}

        {apiQuery && (
          <details className="rounded-lg border border-[var(--line)] p-2">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Code2 size={12} /> {t('editor.apiQuery')}
            </summary>
            <div className="mt-2 space-y-2">
              <div className="text-xs text-slate-500">
                <code>POST /api/v2/metrics/get-data</code>
              </div>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{apiQuery}</pre>
              <CopyButton text={apiQuery} label={t('editor.copyBody')} />
            </div>
          </details>
        )}
      </div>
      <div className="flex gap-2 border-t border-[var(--line)] p-3">
        <button className="btn flex-1" onClick={onDuplicate}>
          <Copy size={14} /> {t('common.duplicate')}
        </button>
        {onExport && (
          <button className="btn flex-1" title={t('editor.exportCsv')} onClick={onExport}>
            <Download size={14} /> CSV
          </button>
        )}
        <button className="btn-danger flex-1" onClick={onRemove}>
          <Trash2 size={14} /> {t('common.remove')}
        </button>
      </div>
    </aside>
  );
}

function FormatSelect({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  const t = useT();
  return (
    <div>
      <label className="label">{t('common.format')}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Format)}>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
}

const swap = (arr: string[], i: number, j: number) => {
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};
