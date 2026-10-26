import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChartValue, RenderedBlock, ReportData, TableValue, TileValue, WidgetValue } from '../src/lib/engine/types';
import { indexValues, storeKey } from '../src/lib/layout/compose';
import type { LayoutWidget } from '../src/lib/layout/types';

// Pure compose tests for the v2 widget kinds (no database).

const W = (id: string, slug: string, key: string, component: LayoutWidget['component'], custom: LayoutWidget['custom']): LayoutWidget => ({ id, slug, key, component, integrationId: 0, x: 0, y: 0, w: 6, h: 4, custom });
const block = (integrationId: number, key: string, label: string, value: WidgetValue, format: RenderedBlock['widget']['format'] = 'number'): RenderedBlock => ({ integrationId, platform: 'Meta Ads', slug: 'facebook_ads', account_name: `acct ${integrationId}`, widget: { reference_key: `fb_ads:${key}`, key, label, format, diff_type: 'positive_good', value } });
const chart = (labels: string[], series: number[][], seriesLabels?: string[]): ChartValue => ({ type: 'chart', labels, series, seriesLabels, agg: series.map(() => 'sum' as const) });

function store(): ReportData {
  return {
    range: { start: '2026-09-01', end: '2026-09-30' },
    comparison: null,
    generated_at: '',
    sources: [],
    sections: [],
    widgets: {
      [storeKey(1, 'spend_by_date')]: block(1, 'spend_by_date', 'Amount invested per day', chart(['2026-09-01', '2026-09-02'], [[1, 2]]), 'currency'),
      [storeKey(2, 'sessions_by_date')]: block(2, 'sessions_by_date', 'Sessions per day', chart(['2026-09-02', '2026-09-03'], [[5, 6]])),
      [storeKey(1, 'spend')]: block(1, 'spend', 'Amount spent', { type: 'number', value: 100, comparison: { value: 80, change_pct: 25, absolute: 20 } }, 'currency'),
      [storeKey(1, 'campaigns')]: block(1, 'campaigns', 'Campaigns', { type: 'table', columns: ['campaign', 'spend', 'clicks'], columnLabels: ['Campaign', 'Spend', 'Clicks'], columnFormats: ['text', 'currency', 'number'], rows: [['A', 10, 100], ['B', 30, 50], ['C', 20, 70]], total_rows: 3 } as TableValue),
    },
  };
}

test('mergeSeries: union of labels in date order, gaps become null', async () => {
  const { mergeSeries } = await import('../src/lib/layout/custom-chart');
  const m = mergeSeries([
    { labels: ['2026-09-01', '2026-09-02'], values: [1, 2] },
    { labels: ['2026-09-02', '2026-09-03'], values: [5, 6] },
  ]);
  assert.deepEqual(m.labels, ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.deepEqual(m.series, [
    [1, 2, null],
    [null, 5, 6],
  ]);
  const cat = mergeSeries([
    { labels: ['Mobile', 'Desktop'], values: [1, 2] },
    { labels: ['Desktop', 'Tablet'], values: [3, 4] },
  ]);
  assert.deepEqual(cat.labels, ['Mobile', 'Desktop', 'Tablet'], 'non-date labels keep first-seen order');
});

test('customChartValue: refs merge into one chart, a number ref is refused, typed data charts directly, nothing resolved is pending', async () => {
  const { customChartValue } = await import('../src/lib/layout/custom-chart');
  const idx = indexValues(store());
  const v = customChartValue(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { series: [{ integrationId: 1, key: 'spend_by_date', label: 'Spend' }, { integrationId: 2, key: 'sessions_by_date' }] }), idx) as ChartValue;
  assert.equal(v.type, 'chart');
  assert.deepEqual(v.labels, ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.deepEqual(v.series, [
    [1, 2, null],
    [null, 5, 6],
  ]);
  assert.deepEqual(v.seriesLabels, ['Spend', 'Sessions per day']);
  const bad = customChartValue(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { series: [{ integrationId: 1, key: 'spend' }] }), idx);
  assert.equal(bad.type, 'error');
  assert.match((bad as any).message, /"spend" is not a chart metric/);
  const manual = customChartValue(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { manual: { labels: ['Jan', 'Feb'], series: [{ label: 'Offline sales', values: [10, null] }] } }), idx) as ChartValue;
  assert.deepEqual([manual.labels, manual.series, manual.seriesLabels, manual.agg], [['Jan', 'Feb'], [[10, null]], ['Offline sales'], ['sum']]);
  const pending = customChartValue(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { series: [{ integrationId: 9, key: 'nothing_by_date' }] }), idx);
  assert.deepEqual([pending.type, (pending as any).code], ['error', 'pending']);
  const empty = customChartValue(W('c', 'custom_chart', 'chart', 'custom_chart_v1', {}), idx);
  assert.equal((empty as any).code, 'pending');
});

test('tileValue: progress, stat, compare and ranking tiles from references or typed data; zero target and missing columns handled', async () => {
  const { tileValue } = await import('../src/lib/layout/tiles');
  const idx = indexValues(store());
  const T = (custom: LayoutWidget['custom']) => W('t', 'infographic', 'tile', 'infographic_v1', custom);
  const p0 = tileValue(T({ kind: 'progress', ref: { integrationId: 1, key: 'spend' }, target: 0 }), idx) as TileValue;
  assert.deepEqual([p0.type, p0.kind, p0.value, p0.note], ['tile', 'progress', 100, '—'], 'a zero target shows a dash, never Infinity');
  const p = tileValue(T({ kind: 'progress', ref: { integrationId: 1, key: 'spend' }, target: 400 }), idx) as TileValue;
  assert.deepEqual([p.note, p.target, p.format], ['25% of target', 400, 'currency']);
  const neg = tileValue(T({ kind: 'progress', value: -5, target: 100 }), idx) as TileValue;
  assert.equal(neg.note, '0% of target');
  const stat = tileValue(T({ kind: 'stat', ref: { integrationId: 1, key: 'spend' }, icon: 'euro' }), idx) as TileValue;
  assert.deepEqual([stat.value, stat.comparison?.change_pct, stat.icon, stat.format], [100, 25, 'euro', 'currency']);
  const cmp = tileValue(T({ kind: 'compare', ref: { integrationId: 1, key: 'spend' }, ref2: { integrationId: 1, key: 'spend' } }), idx) as TileValue;
  assert.deepEqual(cmp.items, [
    { label: 'Amount spent', value: 100 },
    { label: 'Amount spent', value: 100 },
  ]);
  const rank = tileValue(T({ kind: 'ranking', tableRef: { integrationId: 1, key: 'campaigns', column: 'gone', rows: 2 } }), idx) as TileValue;
  assert.deepEqual(rank.items, [
    { label: 'B', value: 30 },
    { label: 'C', value: 20 },
  ]);
  assert.match(rank.note ?? '', /Column not found, showing Spend/);
  assert.equal(rank.format, 'currency');
  const rank2 = tileValue(T({ kind: 'ranking', tableRef: { integrationId: 1, key: 'campaigns', column: 'clicks' } }), idx) as TileValue;
  assert.deepEqual(rank2.items?.map((i) => i.label), ['A', 'C', 'B']);
  assert.equal(rank2.format, 'number');
  const typed = tileValue(T({ kind: 'ranking', items: [{ label: 'x', value: 1 }, { label: 'y', value: 3 }] }), idx) as TileValue;
  assert.deepEqual(typed.items, [
    { label: 'y', value: 3 },
    { label: 'x', value: 1 },
  ]);
  const pend = tileValue(T({ kind: 'stat', ref: { integrationId: 9, key: 'nope' } }), idx);
  assert.equal((pend as any).code, 'pending');
});
