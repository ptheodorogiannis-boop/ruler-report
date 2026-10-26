// Plan C review fix pass: one test per Important finding (each watched RED before the fix).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { db } from '../src/lib/db';
import { createReport } from '../src/lib/services/reports';
import { reportView, saveLayout } from '../src/lib/layout/service';
import { rebucket, storeKey } from '../src/lib/layout/compose';
import { customChartValue } from '../src/lib/layout/custom-chart';
import type { ChartValue, RenderedBlock, WidgetValue } from '../src/lib/engine/types';
import type { ReportLayout } from '../src/lib/layout/types';
import { addIntegration, makeCompany } from './helpers';

const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
const block = (key: string, value: WidgetValue, label = key): RenderedBlock => ({ id: key, integrationId: 0, platform: 'Infographic', slug: 'infographic', account_name: '', widget: { reference_key: key, key, label, format: 'number', diff_type: 'neutral', value } });

test('saveLayout: an account referenced only inside a chart series or a tile ref joins the report and resolves; a foreign account never joins and its card says so (review Important 1)', async () => {
  const { widgetRefIds } = await import('../src/lib/layout/refs');
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const fb2 = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_second' });
  const other = await makeCompany('Other Co');
  const foreign = await addIntegration(other.company.id, other.project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Refs', start: '2026-09-01', end: '2026-09-30', comparisonStart: '2026-08-01', comparisonEnd: '2026-08-31', templateId: tpl.id, integrationIds: [fb.id] });
  const r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const layout: ReportLayout = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  const chart = { id: 'cc', slug: 'custom_chart', key: 'chart', component: 'custom_chart_v1', integrationId: 0, x: 0, y: 0, w: 6, h: 4, custom: { series: [{ integrationId: fb2.id, key: 'spend_by_date' }] } };
  const stat = { id: 'st', slug: 'infographic', key: 'tile', component: 'infographic_v1', integrationId: 0, x: 6, y: 0, w: 3, h: 2, custom: { kind: 'stat', ref: { integrationId: fb2.id, key: 'cpm' } } };
  assert.deepEqual(widgetRefIds(chart as any), [fb2.id]);
  assert.deepEqual(widgetRefIds(stat as any), [fb2.id]);
  layout.blocks.push({ id: 'refs', title: 'Refs', integrationId: 0, slug: 'custom', widgets: [chart, stat] as any });
  const saved = await saveLayout(r, layout);
  assert.ok(((await db.report.findUniqueOrThrow({ where: { id: r.id } })).integrationIds as number[]).includes(fb2.id), 'the referenced account joined the report');
  const stored = saved.data.widgets?.[storeKey(fb2.id, 'spend_by_date')];
  assert.equal(stored?.widget.value.type, 'chart', JSON.stringify(stored?.widget.value));
  const r2 = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  const refs = (await reportView(r2)).data.sections.find((s) => s.id === 'refs')!;
  const by = Object.fromEntries(refs.blocks.map((b) => [b.id!, b.widget.value]));
  assert.equal(by.cc.type, 'chart');
  assert.equal(by.st.type, 'tile');
  // a ref to another project's account (a template reused across clients): the save goes through, the account never joins
  // the report, and the card explains instead of the whole save failing
  const bad: ReportLayout = JSON.parse(JSON.stringify(saved.layout));
  bad.blocks.find((b) => b.id === 'refs')!.widgets[1].custom!.ref = { integrationId: foreign.id, key: 'cpm' };
  await saveLayout(r2, bad);
  assert.ok(!((await db.report.findUniqueOrThrow({ where: { id: r.id } })).integrationIds as number[]).includes(foreign.id), 'a foreign account never joins the report');
  const r3 = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  const st = (await reportView(r3)).data.sections.find((s) => s.id === 'refs')!.blocks.find((b) => b.id === 'st')!.widget.value;
  assert.equal(st.type, 'error', JSON.stringify(st));
  assert.match((st as any).message, /not connected/);
});

test('report images load eagerly so print and PDF include them; only the media picker list is lazy (review declined item 5, re-graded)', async () => {
  const { MediaImage } = await import('../src/components/media-image');
  const inReport = renderToStaticMarkup(createElement(MediaImage, { src: '/api/media/abc123', alt: 'Creative' }));
  assert.doesNotMatch(inReport, /loading="lazy"/, 'report images are not deferred');
  const inPicker = renderToStaticMarkup(createElement(MediaImage, { src: '/api/media/abc123', alt: 'Creative', lazy: true }));
  assert.match(inPicker, /loading="lazy"/, 'the picker list opts in');
});

test('live dashboards: the cache fingerprint changes when a tile ref or a chart series changes, not when a widget moves (review Important 2)', async () => {
  const { layoutFingerprint } = await import('../src/lib/engine/report');
  const base: ReportLayout = { version: 1, blocks: [{ id: 'b', title: 'B', integrationId: 0, slug: 'custom', widgets: [
    { id: 't', slug: 'infographic', key: 'tile', component: 'infographic_v1', integrationId: 0, x: 0, y: 0, w: 3, h: 2, custom: { kind: 'stat', ref: { integrationId: 1, key: 'cpm' } } },
    { id: 'c', slug: 'custom_chart', key: 'chart', component: 'custom_chart_v1', integrationId: 0, x: 3, y: 0, w: 6, h: 4, custom: { series: [{ integrationId: 1, key: 'spend_by_date' }] } },
  ] }] };
  const moved = JSON.parse(JSON.stringify(base));
  moved.blocks[0].widgets[0].x = 9;
  const retargeted = JSON.parse(JSON.stringify(base));
  retargeted.blocks[0].widgets[0].custom.ref.key = 'cpc';
  const extraSeries = JSON.parse(JSON.stringify(base));
  extraSeries.blocks[0].widgets[1].custom.series.push({ integrationId: 2, key: 'clicks_by_date' });
  assert.equal(layoutFingerprint(moved), layoutFingerprint(base), 'moving a widget keeps the cached numbers');
  assert.notEqual(layoutFingerprint(retargeted), layoutFingerprint(base), 'a different tile ref needs fresh numbers');
  assert.notEqual(layoutFingerprint(extraSeries), layoutFingerprint(base), 'a new series needs fresh numbers');
});

test('custom chart: an errored ref is passed through, not reported as "not a chart metric" (review Important 3)', () => {
  const err = { type: 'error' as const, code: 'invalid_metrics_combination' as const, message: 'This account is not connected to the report.' };
  const idx = new Map<string, RenderedBlock>([[storeKey(7, 'spend_by_date'), { id: 'x', integrationId: 7, platform: 'Meta Ads', slug: 'facebook_ads', account_name: '', widget: { reference_key: 'spend_by_date', key: 'spend_by_date', label: 'Spend', format: 'currency', diff_type: 'neutral', value: err } }]]);
  const w = { id: 'cc', slug: 'custom_chart', key: 'chart', component: 'custom_chart_v1', integrationId: 0, x: 0, y: 0, w: 6, h: 4, custom: { series: [{ integrationId: 7, key: 'spend_by_date' }] } };
  assert.deepEqual(customChartValue(w as any, idx), err);
});

test('rebucket: a week with no data in a shorter series stays null, not 0 (review Important 4, Review Focus 1)', () => {
  const v: ChartValue = { type: 'chart', labels: ['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-15'], series: [[1, 2, 3, 4], [null, null, 5, 6]] as any, agg: ['sum', 'sum'] };
  assert.deepEqual(rebucket(v, 'week').series, [[3, 7], [null, 11]]);
  assert.deepEqual(rebucket({ ...v, agg: ['avg', 'avg'] }, 'week').series, [[1.5, 3.5], [null, 5.5]]);
});

test('ranking tile: the column fallback is said on the card and in the settings panel (review Important 5, Review Focus 5)', async () => {
  const { TileCard } = await import('../src/components/infographic');
  const html = renderToStaticMarkup(createElement(TileCard, { b: block('r', { type: 'tile', kind: 'ranking', format: 'number', items: [{ label: 'Brand', value: 300 }], note: 'Column not found, showing Clicks' }), fmt, grid: true }));
  assert.match(html, /Column not found, showing Clicks/);
  const { columnNote } = await import('../src/components/widget-settings/tile');
  const cols = [{ col: 'clicks', label: 'Clicks' }, { col: 'spend', label: 'Spend' }];
  assert.equal(columnNote('conversions', cols), 'Column "conversions" is not in this table any more; ranking by the first numeric column instead.');
  assert.equal(columnNote('clicks', cols), null);
  assert.equal(columnNote(undefined, cols), null);
  assert.equal(columnNote('x', []), null, 'nothing to compare against before the table is resolved');
});

test('custom chart: a series colour chosen in the panel reaches the chart palette (review Important 6)', async () => {
  const { seriesColors } = await import('../src/lib/layout/custom-chart');
  const pal = ['#111111', '#222222', '#333333'];
  assert.deepEqual(seriesColors([{ integrationId: 1, key: 'a', color: '#ff0000' }, { integrationId: 1, key: 'b' }], pal), ['#ff0000', '#222222', '#333333']);
  assert.equal(seriesColors(undefined, pal), pal, 'no series: the palette as is');
  assert.equal(seriesColors([{ integrationId: 1, key: 'a' }], pal), pal, 'no colour chosen: the palette as is');
  assert.deepEqual(seriesColors([{ integrationId: 1, key: 'a' }, { integrationId: 1, key: 'b', color: '#00ff00' }], undefined)?.[1], '#00ff00', 'works without a report palette too');
});
