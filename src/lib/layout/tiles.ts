// Infographic tiles (spec §6): a progress ring, a ranked list, a big number with an icon, or a two-value comparison,
// fed by number / table metrics already in the report's store or by data typed into the editor. Pure.
import type { DateRange, ErrorValue, Format, NumberValue, RenderedBlock, TableValue, TileValue } from '@/lib/engine/types';
import type { LayoutWidget, MetricRef } from './types';
import { scopeHash, type CampaignScope } from '@/lib/engine/campaigns';
import { tr } from '@/lib/i18n/request';

const key = (integrationId: number, k: string, period?: DateRange, scope?: CampaignScope) => {
  const h = scope ? scopeHash(scope) : '';
  return `${integrationId}:${k}${period ? `@${period.start}..${period.end}` : ''}${h ? `#${h}` : ''}`;
};
/** A ref to the block's own account reads the scoped value (review I8); anything else, or an older snapshot, the plain one. */
const lookup = (idx: Map<string, RenderedBlock>, ref: { integrationId: number; key: string }, period: DateRange | undefined, scope?: CampaignScope, blockIntegrationId = 0) =>
  (scope && ref.integrationId === blockIntegrationId ? idx.get(key(ref.integrationId, ref.key, period, scope)) : undefined) ?? idx.get(key(ref.integrationId, ref.key, period));
const pending = (message = 'Loading…'): ErrorValue => ({ type: 'error', code: 'pending', message });
const invalid = (message: string): ErrorValue => ({ type: 'error', code: 'invalid_metrics_combination', message });

type Num = { value: number | null; comparison?: NumberValue['comparison']; label: string; format: Format };

function number(ref: MetricRef | undefined, idx: Map<string, RenderedBlock>, period?: DateRange, scope?: CampaignScope, blockIntegrationId = 0): Num | ErrorValue | null {
  if (!ref) return null;
  const b = lookup(idx, ref, period, scope, blockIntegrationId);
  if (!b) return pending();
  const v = b.widget.value;
  if (v.type === 'error') return v;
  if (v.type !== 'number') return invalid(`"${ref.key}" is not a number metric.`);
  return { value: v.value, comparison: v.comparison, label: b.widget.label, format: b.widget.format };
}

export function tileValue(w: LayoutWidget, idx: Map<string, RenderedBlock>, scope?: CampaignScope, blockIntegrationId = 0): TileValue | ErrorValue {
  const c = w.custom ?? {};
  const kind = c.kind ?? 'stat';
  const period = c.period;
  const fmt = (f?: Format): Format => c.format ?? f ?? 'number';

  if (kind === 'ranking') {
    if (c.tableRef) {
      const b = lookup(idx, c.tableRef, period, scope, blockIntegrationId);
      if (!b) return pending();
      const v = b.widget.value;
      if (v.type === 'error') return v;
      if (v.type !== 'table') return invalid(`"${c.tableRef.key}" is not a table metric.`);
      const t = v as TableValue;
      let col = c.tableRef.column ? t.columns.indexOf(c.tableRef.column) : -1;
      let note: string | undefined;
      if (col <= 0) {
        col = t.columnFormats.findIndex((f, i) => i > 0 && f !== 'text');
        if (col < 0) return invalid('This table has no numeric column to rank by.');
        if (c.tableRef.column) note = `Column not found, showing ${t.columnLabels[col]}`;
      }
      const rows = [...t.rows].filter((r) => typeof r[col] === 'number').sort((a, b) => (b[col] as number) - (a[col] as number)).slice(0, c.tableRef.rows ?? 5);
      return { type: 'tile', kind, format: fmt(t.columnFormats[col]), items: rows.map((r) => ({ label: String(r[0]), value: r[col] as number })), note };
    }
    const items = [...(c.items ?? [])].sort((a, b) => b.value - a.value).slice(0, 50);
    if (!items.length) return pending('Pick a table metric or type the items to rank.');
    return { type: 'tile', kind, format: fmt(), items };
  }

  if (kind === 'compare') {
    if (c.ref || c.ref2) {
      const a = number(c.ref, idx, period, scope, blockIntegrationId);
      const b = number(c.ref2, idx, period, scope, blockIntegrationId);
      for (const x of [a, b]) if (x && 'type' in x) return x;
      const items = [a, b].filter((x): x is Num => !!x).map((x) => ({ label: x.label, value: x.value }));
      return { type: 'tile', kind, format: fmt((a as Num | null)?.format), items };
    }
    const items = (c.items ?? []).slice(0, 2).map((i) => ({ label: i.label, value: i.value }));
    if (items.length < 2) return pending('Pick two number metrics or type two values to compare.');
    return { type: 'tile', kind, format: fmt(), items };
  }

  // progress and stat: one number
  const n = number(c.ref, idx, period, scope, blockIntegrationId);
  if (n && 'type' in n) return n;
  const value = n ? n.value : (c.value ?? null);
  const comparison = n ? n.comparison : c.previous != null && value != null ? { value: c.previous, change_pct: c.previous === 0 ? null : Number((((value - c.previous) / Math.abs(c.previous)) * 100).toFixed(2)), absolute: value - c.previous } : undefined;
  if (!n && c.value == null) return pending(kind === 'progress' ? tr('editor.pickNumberTarget') : tr('editor.pickNumber'));
  const out: TileValue = { type: 'tile', kind, format: fmt(n?.format), value, comparison, icon: c.icon };
  if (kind === 'progress') {
    const target = c.target ?? null;
    out.target = target;
    out.note = target && target > 0 && value != null ? `${Math.round((Math.max(0, value) / target) * 100)}% of target` : '—';
  }
  return out;
}
