import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RenderedBlock, ReportData } from '../src/lib/engine/types';

const block = (id: string, value: any, extra: Partial<RenderedBlock> = {}, x = 0): RenderedBlock => ({
  id,
  integrationId: 1,
  platform: 'Meta Ads',
  slug: 'facebook_ads',
  account_name: 'Acme',
  layout: { x, y: 0, w: 3, h: 2 },
  widget: { reference_key: `fb_ads:${id}`, key: id, label: id, format: 'number', diff_type: 'positive_good', value },
  ...extra,
});
const kpi = (id: string, x = 0) => block(id, { type: 'number', value: 10, comparison: { value: 8, change_pct: 25, absolute: 2 } }, {}, x);
const table = (id: string) => block(id, { type: 'table', columns: ['name', 'spend'], columnLabels: ['Campaign', 'Spend'], columnFormats: ['text', 'currency'], rows: [['A', 1]], total_rows: 1 });
const bars = (id: string) => block(id, { type: 'chart', labels: ['Organic', 'Paid', 'Email'], series: [[3, 9, 4]] }, { custom: { chartType: 'bar' } } as any);
const section = (id: string, blocks: RenderedBlock[]) => ({ id, title: id, source: { integrationId: 1, slug: 'facebook_ads', name: 'Acme' }, blocks }) as any;

test('tones: the first block with KPIs is grey, tables and bar charts are dark; the Look option turns it all back to glass', async () => {
  const { blockTone } = await import('../src/lib/layout/tones');
  assert.equal(blockTone(true, kpi('a'), undefined), 'smoke');
  assert.equal(blockTone(false, kpi('a'), undefined), undefined, 'later blocks keep glass KPI tiles');
  assert.equal(blockTone(false, table('t'), undefined), 'solid');
  assert.equal(blockTone(false, bars('c'), undefined), 'solid');
  const line = block('l', { type: 'chart', labels: ['2026-09-01', '2026-09-02'], series: [[1, 2]] });
  assert.equal(blockTone(false, line, undefined), undefined, 'a line chart over time stays light');
  const pie = block('p', { type: 'chart', labels: ['Mobile', 'Desktop'], series: [[1, 2]] }, { custom: { chartType: 'pie' } } as any);
  assert.equal(blockTone(false, pie, undefined), undefined);
  assert.equal(blockTone(true, kpi('a'), 'glass'), undefined);
  assert.equal(blockTone(false, table('t'), 'glass'), undefined);
});

test('tones: the Look option is stored only when it differs from the default, and a wrong value is refused', async () => {
  const { cleanTheme } = await import('../src/lib/layout/theme');
  const { normalizeLayout } = await import('../src/lib/layout/compose');
  assert.equal(cleanTheme({ tones: 'contrast' }), undefined, 'the default is not stored');
  assert.deepEqual(cleanTheme({ tones: 'glass' }), { tones: 'glass' });
  assert.throws(() => normalizeLayout({ version: 1, blocks: [], theme: { tones: 'neon' } }));
  assert.equal(normalizeLayout({ version: 1, blocks: [], theme: { tones: 'glass' } }).theme?.tones, 'glass');
});

test('tones in the rendered report: grey KPI tiles only in the first KPI block, dark tables and bar charts; none with glass', async () => {
  const { ReportBody } = await import('../src/components/widgets');
  const data = (theme?: any): ReportData => ({ range: { start: '2026-09-01', end: '2026-09-30' }, comparison: null, generated_at: '', sources: [], theme, sections: [section('s1', [kpi('k1'), kpi('k2', 3)]), section('s2', [kpi('k3'), table('t1'), bars('c1')])] }) as any;
  const html = renderToStaticMarkup(createElement(ReportBody, { data: data(), fmt: {} }));
  const s1 = html.slice(html.indexOf('id="s1"'), html.indexOf('id="s2"'));
  const s2 = html.slice(html.indexOf('id="s2"'));
  assert.equal((s1.match(/card kpi[^"]*tone-smoke/g) ?? []).length, 2, 'both KPI tiles of the first block');
  assert.equal((s2.match(/tone-smoke/g) ?? []).length, 0, 'not in later blocks');
  assert.equal((s2.match(/tone-solid/g) ?? []).length, 2, 'the table and the bar chart');
  const glass = renderToStaticMarkup(createElement(ReportBody, { data: data({ tones: 'glass' }), fmt: {} }));
  assert.ok(!/tone-(smoke|solid)/.test(glass));
});

test('leading bar: the largest value, or the last bucket of a chart grouped by month', async () => {
  const { leadingIndex } = await import('../src/components/charts');
  assert.equal(leadingIndex([3, 9, 4], ['a', 'b', 'c']), 1);
  assert.equal(leadingIndex([3, 9, 4], ['2026-07', '2026-08', '2026-09'], 'month'), 2);
  assert.equal(leadingIndex([], []), -1);
});
