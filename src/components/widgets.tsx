import clsx from 'clsx';
import { Fragment } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, AlertTriangle, Loader2, Star } from 'lucide-react';
import type { RenderedBlock, RenderedSection, ReportData, SourceStatus, WidgetValue } from '@/lib/engine/types';
import type { WidgetCustom } from '@/lib/layout/types';
import { formatValue, type FormatOpts } from '@/lib/util/format';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { PlatformIcon } from './platform-icon';
import { blockColorOf, blockVars, paletteFor } from '@/lib/layout/theme';
import type { ReportTheme } from '@/lib/layout/types';
import { CategoryChart, TimeChart } from './charts-lazy';
import { ImageCard } from './image-card';
import { seriesColors } from '@/lib/layout/custom-chart';
import { ICONS, TileCard } from './infographic';
import { ContainerCard } from './container-card';
import { reconnectUrl } from '@/lib/health-url';
import { DataNote } from './data-note';
import { getRequestLocale, tr } from '@/lib/i18n/request';
import { metricLabel, tableColumnLabels } from '@/lib/catalog/labels';

/** A card's title: the title typed in the editor as is, else the metric's label in the request locale (spec v3 §5). */
const labelOf = (b: RenderedBlock) => ((b.custom as { title?: string } | undefined)?.title ? b.widget.label : metricLabel({ reference_key: b.widget.reference_key, title: b.widget.label }, getRequestLocale()));

export type Fmt = Pick<FormatOpts, 'decimalSeparatorFormat'>;
export interface CardProps {
  b: RenderedBlock;
  fmt: Fmt;
  brand?: string;
  /** rendered inside a grid cell: fill the cell instead of using intrinsic sizes */
  grid?: boolean;
  /** series colours for multi-series charts (docs/superpowers/specs › §5); the block colour is `brand` */
  palette?: string[];
}
const customOf = (b: RenderedBlock) => (b.custom ?? {}) as WidgetCustom;

/** CSS variables that place a block on the 12-column grid (see .rgrid in globals.css). */
export const gridStyle = (l: { x: number; y: number; w: number; h: number }) => ({ ['--gx' as any]: l.x + 1, ['--gy' as any]: l.y + 1, ['--gw' as any]: l.w, ['--gh' as any]: l.h }) as React.CSSProperties;

/**
 * The caliper (docs/DESIGN.md › Concept card): positions of the previous and current value on a shared scale
 * [0, 1.12 × max], so a KPI can draw its own measurement. Null when the two values cannot share a scale.
 */
export function caliper(cur: number | null | undefined, prev: number | null | undefined, diff: string): { prev: number; cur: number; tone: 'caliper-up' | 'caliper-down' | 'caliper-flat' } | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || cur < 0 || prev < 0) return null;
  const max = Math.max(cur, prev);
  if (max <= 0) return null;
  const scale = max * 1.12;
  const up = cur > prev;
  const good = diff === 'neutral' ? null : diff === 'positive_bad' ? !up : up;
  return { prev: Math.round((prev / scale) * 1000) / 1000, cur: Math.round((cur / scale) * 1000) / 1000, tone: cur === prev || good === null ? 'caliper-flat' : good ? 'caliper-up' : 'caliper-down' };
}

/** Change versus the comparison period: arrow glyph + percentage, coloured by meaning (direction is also carried by the glyph). */
export function Delta({ pct, diff }: { pct: number | null | undefined; diff: string }) {
  if (pct == null) return <span className="text-xs text-ink-3">—</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const good = diff === 'neutral' ? null : diff === 'positive_bad' ? !up : up;
  const tone = flat || good === null ? 'delta-flat' : good ? 'delta-up' : 'delta-down';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${tone}`} aria-label={`${up ? 'up' : flat ? 'unchanged' : 'down'} ${Math.abs(pct).toFixed(1)} percent`}>
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Kpi({ b, fmt, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as Extract<WidgetValue, { type: 'number' }>;
  const c = customOf(b);
  const o = { currency: w.currency, ...fmt };
  const showComparison = c.showComparison !== false;
  const showVariation = c.showVariation !== false;
  const showAbsolute = !!c.showAbsolute;
  const hl = !!c.highlight;
  const abs = v.comparison?.absolute;
  const cal = caliper(v.value, v.comparison?.value, w.diff_type);
  return (
    <div className={clsx('card kpi p-4', grid && 'flex h-full flex-col justify-center overflow-hidden', hl && 'border-l-4')} style={hl ? { borderLeftColor: 'var(--block, var(--brand))' } : undefined} title={w.description}>
      <div className="flex items-center gap-1 text-xs font-medium text-ink-2">
        {hl && <Star size={11} className="shrink-0 fill-brand text-brand" aria-label={tr('public.highlighted')} />}
        <span className="truncate">{labelOf(b)}</span>
      </div>
      <div className={clsx('kpi-value mt-1.5', hl && 'text-brand')}>{formatValue(v.value, w.format, o)}</div>
      {cal && (
        <div className={clsx('caliper caliper-intro', cal.tone)} style={{ ['--prev' as any]: cal.prev, ['--cur' as any]: cal.cur, ['--i' as any]: ((b.layout?.y ?? 0) * 4 + (b.layout?.x ?? 0) / 3) | 0 }} aria-hidden="true">
          <span className="caliper-track" />
          <span className="caliper-bracket" />
          <span className="caliper-prev" />
          <span className="caliper-cur" />
        </div>
      )}
      {v.comparison && (showComparison || showVariation || showAbsolute) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {showVariation && <Delta pct={v.comparison.change_pct} diff={w.diff_type} />}
          {showComparison && <span className="num text-xs text-ink-3">vs {formatValue(v.comparison.value, w.format, o)}</span>}
          {showAbsolute && abs != null && (
            <span className="num text-xs font-medium text-ink-2">
              {abs > 0 ? '+' : abs < 0 ? '−' : ''}
              {formatValue(Math.abs(abs), w.format, o)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ChartCard({ b, fmt, brand, grid, palette }: CardProps) {
  const w = b.widget;
  const v = w.value as Extract<WidgetValue, { type: 'chart' }>;
  const c = customOf(b);
  const isTime = /^\d{4}-\d{2}-\d{2}$/.test(v.labels[0] ?? '');
  const o = { currency: w.currency, ...fmt };
  const pie = c.chartType ? c.chartType === 'pie' || c.chartType === 'donut' : /gender|device|platform|content_type|payment/i.test(w.key);
  const kind = c.chartType === 'bar' || c.chartType === 'stacked' || c.chartType === 'area' ? c.chartType : 'line';
  const colors = seriesColors(c.series, palette); // colours chosen per series in the panel, else the report palette
  const first = c.series?.[0]?.color ?? brand;
  return (
    <div className={clsx('card flex flex-col p-4', grid && 'h-full overflow-hidden')} title={w.description}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="truncate text-sm font-semibold">{labelOf(b)}</div>
        {c.groupBy && c.groupBy !== 'day' && <span className="eyebrow shrink-0">{c.groupBy === 'week' || c.groupBy === 'month' || c.groupBy === 'quarter' ? tr(`public.by_${c.groupBy}`) : `by ${c.groupBy}`}</span>}
      </div>
      <div className={clsx('chart-area', grid && 'min-h-0 flex-1')}>
        {v.labels.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">{tr('public.noData')}</div>
        ) : isTime ? (
          <TimeChart labels={v.labels} series={v.series} seriesLabels={v.seriesLabels ?? []} format={w.format} opts={o} comparison={v.comparison?.series} color={first} fill={grid} kind={kind} palette={colors} />
        ) : (
          <CategoryChart labels={v.labels} series={v.series} seriesLabels={v.seriesLabels ?? []} format={w.format} opts={o} pie={pie} donut={c.chartType === 'donut'} stacked={c.chartType === 'stacked'} fill={grid} palette={colors} />
        )}
      </div>
    </div>
  );
}

function TableCard({ b, fmt, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as Extract<WidgetValue, { type: 'table' }>;
  const o = { currency: w.currency, ...fmt };
  const heads = tableColumnLabels(getIntegrationDef(b.slug)?.prefix ?? b.slug, v, getRequestLocale());
  return (
    <div className={clsx('card flex flex-col overflow-hidden', grid ? 'h-full' : 'lg:col-span-2')} title={w.description}>
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="truncate text-sm font-semibold">{labelOf(b)}</div>
        <div className="num shrink-0 text-xs text-ink-3">
          {tr('public.topOf', { n: v.rows.length, total: v.total_rows })}
        </div>
      </div>
      <div className={clsx('scroll-region mt-2 overflow-auto', grid && 'min-h-0 flex-1')} {...(v.rows.length > 12 ? { tabIndex: 0, role: 'region', 'aria-label': `${w.label}, table` } : {})}>
        <table className="w-full">
          <thead className="sticky top-0 border-b border-[var(--line)] bg-[var(--card)]">
            <tr>
              {heads.map((c, i) => (
                <th key={i} className={`th ${i > 0 ? 'text-right' : ''}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {v.rows.map((r, ri) => (
              <tr key={ri} className="hover:bg-slate-50/50">
                {r.map((cell, ci) => (
                  <td key={ci} className={`td ${ci === 0 ? 'max-w-[280px] truncate font-medium' : 'text-right tabular-nums'}`}>
                    {ci === 0 ? String(cell) : formatValue(cell as number, v.columnFormats[ci], o)}
                  </td>
                ))}
              </tr>
            ))}
            {v.rows.length === 0 && (
              <tr>
                <td className="td text-center text-slate-400" colSpan={v.columnLabels.length}>
                  {tr('public.noRows')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelCard({ b, fmt, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as Extract<WidgetValue, { type: 'funnel' }>;
  const o = { currency: w.currency, ...fmt };
  const maxv = Math.max(...v.steps.filter((s) => !/spent|spend|revenue/i.test(s.label)).map((s) => s.value ?? 0), 1);
  return (
    <div className={clsx('card flex flex-col p-4', grid ? 'h-full overflow-hidden' : 'lg:col-span-2')} title={w.description}>
      <div className="mb-3 truncate text-sm font-semibold">{labelOf(b)}</div>
      <div className={clsx('scroll-region space-y-2', grid && 'min-h-0 flex-1 overflow-auto')} {...(grid && v.steps.length > 8 ? { tabIndex: 0, role: 'region', 'aria-label': `${w.label}, funnel` } : {})}>
        {v.steps.map((s, i) => {
          const isMoney = /spent|spend|revenue/i.test(s.label);
          const width = isMoney ? 100 : Math.max(4, ((s.value ?? 0) / maxv) * 100);
          const prev = i > 0 && !isMoney && !/spent|spend/i.test(v.steps[i - 1].label) ? v.steps[i - 1].value : null;
          const conv = prev ? ((s.value ?? 0) / prev) * 100 : null;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-xs text-slate-500">{s.label}</div>
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div className="h-full rounded-md bg-brand/80" style={{ width: `${width}%`, opacity: isMoney ? 0.35 : 1 - i * 0.07 }} />
                <div className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-slate-800">{formatValue(s.value, isMoney ? 'currency' : 'number', o)}</div>
              </div>
              <div className="w-28 shrink-0 text-right text-xs text-slate-400">{conv != null ? `${conv.toFixed(1)}% of prev` : s.comparison?.change_pct != null ? `${s.comparison.change_pct > 0 ? '+' : ''}${s.comparison.change_pct}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextCard({ b, grid }: CardProps) {
  const v = b.widget.value as Extract<WidgetValue, { type: 'text' }>;
  return (
    <div className={clsx('card p-4', grid && 'h-full overflow-auto')} tabIndex={grid ? 0 : undefined}>
      <div className="mb-1 text-sm font-semibold">{labelOf(b)}</div>
      {v.html ? <div className="analysis" dangerouslySetInnerHTML={{ __html: v.html }} /> : <div className="text-sm text-slate-400">{tr('public.emptyAnalysis')}</div>}
    </div>
  );
}

function ErrorCard({ b, grid }: CardProps) {
  const v = b.widget.value as Extract<WidgetValue, { type: 'error' }>;
  if (v.code === 'pending')
    return (
      <div className={clsx('card flex items-center gap-2 border-dashed p-4 text-sm text-slate-500', grid && 'h-full')}>
        <Loader2 size={15} className="shrink-0 animate-spin text-brand" />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-600">{labelOf(b)}</div>
          <div className="text-xs">{v.message}</div>
        </div>
      </div>
    );
  return (
    <div className={clsx('card flex items-start gap-2 border-amber-200 bg-amber-50/50 p-4', grid && 'h-full overflow-hidden')}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-600">{labelOf(b)}</div>
        <div className="text-xs text-amber-700">{v.message}</div>
      </div>
    </div>
  );
}

/** One rendered widget. `grid` makes the card fill its grid cell. */
export function WidgetCard(props: CardProps) {
  const t = props.b.widget.value.type;
  if (t === 'number') return <Kpi {...props} />;
  if (t === 'chart') return <ChartCard {...props} />;
  if (t === 'table') return <TableCard {...props} />;
  if (t === 'funnel') return <FunnelCard {...props} />;
  if (t === 'text') return <TextCard {...props} />;
  if (t === 'tile') return <TileCard {...props} />;
  if (t === 'image') return <ImageCard {...props} />;
  if (t === 'container') return <ContainerCard {...props} />;
  return <ErrorCard {...props} />;
}

export function PlatformBadge({ slug, name }: { slug: string; name: string }) {
  const def = getIntegrationDef(slug);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
      <span className="inline-flex" style={{ color: `var(--block, ${def?.color ?? '#636d7c'})` }}>
        <PlatformIcon slug={slug} size={14} tone="ink" />
      </span>
      {name}
    </span>
  );
}

/** Block header: eyebrow (platform · account) above a display title, so structure reads before words. */
export function BlockHeader({ s, dataNotes, editor }: { s: RenderedSection; dataNotes?: boolean; /** the editor keeps a hidden header visible, dimmed and tagged */ editor?: boolean }) {
  const src = s.source;
  const Icon = s.icon ? ICONS[s.icon] : null;
  return (
    <div className={clsx('space-y-0.5', editor && s.hideHeader && 'opacity-50')} data-block-header>
      {src && src.integrationId > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <PlatformBadge slug={src.slug} name={src.platform} />
          <span className="text-[11px] font-medium text-ink-3">{src.account_name}</span>
          {dataNotes && <DataNote slug={src.slug} campaigns={s.campaignScope} />}
        </div>
      ) : src ? (
        <div className="eyebrow">{tr('public.customBlock')}</div>
      ) : null}
      <h2 className="display flex items-center text-xl font-semibold">
        {Icon && (
          <span className="block-icon" data-icon={s.icon} aria-hidden="true">
            <Icon size={16} />
          </span>
        )}
        {s.title}
        {editor && s.hideHeader && <span className="badge ml-2 bg-slate-100 text-[10px] font-normal text-slate-500">{tr('public.hiddenOnClient')}</span>}
      </h2>
      {s.subtitle && <div className="block-sub">{s.subtitle}</div>}
    </div>
  );
}

/** A layout block: header + widgets positioned on the 12-column grid. */
function LayoutSection({ s, fmt, brand, theme, dataNotes }: { s: RenderedSection; fmt: Fmt; brand?: string; theme?: ReportTheme; dataNotes?: boolean }) {
  // the block's colour (its own, else the platform's) drives the badge, KPI highlights and the first chart series
  const platformColor = (s.source && getIntegrationDef(s.source.slug)?.color) || '#636d7c';
  const blockColor = blockColorOf(theme, s.id, platformColor);
  const palette = paletteFor(theme?.palette, brand ?? '#1a36e6');
  return (
    <section id={s.id} className="print-section space-y-3" style={blockVars(theme, s.id, platformColor)}>
      {!s.hideHeader && <BlockHeader s={s} dataNotes={dataNotes} />}
      {s.blocks.length === 0 ? (
        <div className="card p-6 text-center text-sm text-ink-3">{tr('public.noWidgets')}</div>
      ) : (
        <div className="rgrid">
          {s.blocks.map((b, i) => (
            <div key={b.id ?? i} className="ritem" style={gridStyle(b.layout!)} data-w={b.layout!.w} data-kind={b.widget.value.type}>
              <WidgetCard b={b} fmt={fmt} brand={blockColor} palette={palette} grid />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Legacy auto-layout for reports generated before the editor existed (no `layout` on the blocks). */
function AutoSection({ s, fmt, brand }: { s: RenderedSection; fmt: Fmt; brand?: string }) {
  const groups: { key: string; slug: string; platform: string; account: string; blocks: RenderedBlock[] }[] = [];
  for (const b of s.blocks) {
    const k = `${b.integrationId}`;
    let g = groups.find((x) => x.key === k);
    if (!g) groups.push((g = { key: k, slug: b.slug, platform: b.platform, account: b.account_name, blocks: [] }));
    g.blocks.push(b);
  }
  return (
    <section className="print-section space-y-4">
      <h2 className="display text-xl font-semibold">{s.title}</h2>
      {groups.map((g) => {
        const nums = g.blocks.filter((b) => b.widget.value.type === 'number' || (b.widget.value.type === 'error' && b.widget.value.code === 'invalid_metrics_combination'));
        const others = g.blocks.filter((b) => !nums.includes(b));
        return (
          <div key={g.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <PlatformBadge slug={g.slug} name={g.platform} />
              <span className="text-[11px] font-medium text-ink-3">{g.account}</span>
            </div>
            {nums.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {nums.map((b, i) => (
                  <WidgetCard key={i} b={b} fmt={fmt} brand={brand} />
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {others.map((b, i) => (
                  <WidgetCard key={i} b={b} fmt={fmt} brand={brand} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Signed-in writers get Reconnect + Retry per failed source (spec v3 §1.3); the public page passes no actions. */
export interface SourceActions {
  reportId: number;
  projectId: number;
  retry: (fd: FormData) => Promise<void>;
}

export function SourceStatusList({ sources, actions }: { sources: SourceStatus[]; actions?: SourceActions }) {
  const bad = sources.filter((s) => s.data_status !== 'ok');
  if (!bad.length) return null;
  return (
    <div className="card border-amber-200 bg-amber-50/60 p-3 text-sm">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-800">
        <AlertTriangle size={14} /> {tr('public.sourcesAttention')}
      </div>
      <ul className="space-y-0.5 text-xs text-amber-900">
        {bad.map((s) => (
          <li key={s.integrationId} className="flex flex-wrap items-center gap-2">
            <span>
              <strong>{s.platform}</strong> · {s.account_name}: {s.data_status === 'error' ? s.error ?? tr('public.failedToLoad') : tr('public.noDataPeriod')}
            </span>
            {actions && s.data_status === 'error' && (
              <span className="no-print inline-flex items-center gap-1">
                <a href={reconnectUrl({ id: s.integrationId, projectId: actions.projectId, slug: s.slug })} className="btn px-2 py-0.5 text-[11px]">
                  {tr('public.reconnect')}
                </a>
                <form action={actions.retry}>
                  <input type="hidden" name="reportId" value={actions.reportId} />
                  <input type="hidden" name="integrationId" value={s.integrationId} />
                  <button className="btn px-2 py-0.5 text-[11px]" title={tr('public.fetchAgain')}>
                    {tr('public.retry')}
                  </button>
                </form>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An analysis card as the body renders it (html already sanitised by the caller). */
export interface BodyCard {
  id: string;
  title: string;
  html: string;
  blockId?: string;
}
export function AnalysisCardView({ c }: { c: BodyCard }) {
  return (
    <article className="card analysis-card p-6 md:p-7" data-analysis-card={c.id}>
      <h2 className="display mb-2 text-lg font-semibold">{c.title}</h2>
      <div className="analysis" dangerouslySetInnerHTML={{ __html: c.html }} />
    </article>
  );
}

export function ReportBody({ data, fmt, brand, sourceActions, dataNotes, cards }: { data: ReportData; fmt: Fmt; brand?: string; sourceActions?: SourceActions; /** "About these numbers" controls in block headers (client pages, company switch) */ dataNotes?: boolean; /** analysis cards: without a blockId at the top, with one right after that block (spec v3 §4.4) */ cards?: BodyCard[] }) {
  const accent = data.theme?.accent ?? brand ?? '#1a36e6';
  const known = new Set(data.sections.map((s) => s.id));
  const top = (cards ?? []).filter((c) => !c.blockId || !known.has(c.blockId));
  const forBlock = (id: string) => (cards ?? []).filter((c) => c.blockId === id);
  return (
    <div className="space-y-8">
      <SourceStatusList sources={data.sources} actions={sourceActions} />
      {top.length > 0 && (
        <section className="space-y-4">
          <h2 className="sr-only">{tr('public.analysis')}</h2>
          {top.map((c) => (
            <AnalysisCardView key={c.id} c={c} />
          ))}
        </section>
      )}
      {data.sections.length === 0 && <div className="card p-8 text-center text-sm text-ink-2">{tr('public.noMatchingWidgets')}</div>}
      {data.sections.map((s) => (
        <Fragment key={s.id}>
          {s.source ? <LayoutSection s={s} fmt={fmt} brand={accent} theme={data.theme} dataNotes={dataNotes} /> : <AutoSection s={s} fmt={fmt} brand={accent} />}
          {forBlock(s.id).map((c) => (
            <AnalysisCardView key={c.id} c={c} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
