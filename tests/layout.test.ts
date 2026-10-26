import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { createReport } from '../src/lib/services/reports';
import { reportToCsv } from '../src/lib/services/export';
import { layoutOf, liveDashboardData, snapshotReport } from '../src/lib/engine/report';
import type { ChartValue, RenderedBlock, ReportData, TableValue, TemplateSection } from '../src/lib/engine/types';
import { applyTableCustom, composeReport, fillRows, indexValues, justifyKpiRows, layoutToSections, normalizeLayout, rebucket, sectionsFromData, seedLayout, storeKey } from '../src/lib/layout/compose';
import { compact, firstFree, flow, moveItem, overlaps, resizeItem } from '../src/lib/layout/grid';
import { persistSeed, reportView, saveAsTemplate, saveLayout } from '../src/lib/layout/service';
import type { LayoutWidget, ReportLayout } from '../src/lib/layout/types';
import { addIntegration, api, makeCompany } from './helpers';

const W = (id: string, x: number, y: number, w: number, h: number, extra: Partial<LayoutWidget> = {}): LayoutWidget => ({ id, slug: 'facebook_ads', key: id, component: 'number_v1', integrationId: 1, x, y, w, h, ...extra });

test('grid maths: compact, move with push-down, resize clamped to 12 columns, first free slot, flow', () => {
  const items = [W('a', 0, 3, 3, 2), W('b', 3, 0, 3, 2), W('c', 0, 8, 6, 4)];
  const c = compact(items);
  assert.deepEqual(c.map((i) => [i.id, i.x, i.y]), [['a', 0, 0], ['b', 3, 0], ['c', 0, 2]], 'gaps removed, order kept');

  const moved = moveItem(c, 'c', 0, 0);
  assert.equal(moved.find((i) => i.id === 'c')!.y, 0);
  assert.ok(!overlaps(moved), 'no overlaps after move');
  assert.equal(moved.find((i) => i.id === 'a')!.y, 4, 'a pushed below the 4-row chart');
  assert.equal(moved.find((i) => i.id === 'b')!.y, 4, 'b pushed too');
  assert.equal(moveItem(c, 'c', 0, 2), c, 'moving to the same cell returns the same array');

  const resized = resizeItem(c, 'b', 20, 1, { w: 2, h: 2 });
  const b = resized.find((i) => i.id === 'b')!;
  assert.equal(b.w, 9, 'width clamped so x + w <= 12');
  assert.equal(b.h, 2, 'minimum height respected');
  assert.ok(!overlaps(resized));

  assert.deepEqual(firstFree([W('a', 0, 0, 3, 2), W('b', 3, 0, 3, 2)], 6, 4), { x: 6, y: 0 });
  assert.deepEqual(firstFree([W('a', 0, 0, 12, 2)], 3, 2), { x: 0, y: 2 });
  const flowed = flow([W('x', -1, -1, 3, 2), W('y', -1, -1, 3, 2), W('z', -1, -1, 12, 6), W('k', -1, -1, 3, 2)]);
  assert.deepEqual(flowed.map((i) => [i.id, i.x, i.y]), [['x', 0, 0], ['y', 3, 0], ['z', 0, 2], ['k', 6, 0]], 'KPIs fill the first row, table goes below, next KPI backfills');
  assert.ok(!overlaps(flowed));
});

const sections: TemplateSection[] = [
  { id: 'ads', title: 'Paid media', widgets: [{ slug: 'facebook_ads', key: 'spend' }, { slug: 'facebook_ads', key: 'impressions' }, { slug: 'facebook_ads', key: 'spend_by_date' }, { slug: 'facebook_ads', key: 'campaigns' }, { slug: 'google_adwords', key: 'spend' }] },
  { id: 'notes', title: 'Notes', widgets: [{ slug: 'custom', key: 'cm_1' }, { slug: 'manual', key: 'number', custom: { title: 'Budget', value: 5000 } }, { slug: 'analysis', key: 'text', custom: { html: '<p>hi</p>' }, layout: { x: 0, y: 4, w: 12, h: 2 } }] },
];
const componentOf = (slug: string, key: string) => (key === 'spend_by_date' ? 'chart_v1' : key === 'campaigns' ? 'datatable_v1' : slug === 'analysis' ? 'analysis_v1' : slug === 'manual' ? 'empty_v1' : 'number_v1') as any;

test('seedLayout: one block per section × account plus a custom block; Reportei default sizes; stored positions honoured', () => {
  const l = seedLayout(sections, [{ id: 11, slug: 'facebook_ads', name: 'FB A' }, { id: 12, slug: 'facebook_ads', name: 'FB B' }, { id: 13, slug: 'google_adwords', name: 'G' }, { id: 14, slug: 'shopify', name: 'Shop' }], componentOf);
  assert.deepEqual(l.blocks.map((b) => [b.id, b.integrationId, b.widgets.length]), [['ads_11', 11, 4], ['ads_12', 12, 4], ['ads_13', 13, 1], ['notes_custom', 0, 3]]);
  const fb = l.blocks[0].widgets;
  assert.deepEqual(fb.map((w) => [w.key, w.x, w.y, w.w, w.h]), [['spend', 0, 0, 6, 2], ['impressions', 6, 0, 6, 2], ['spend_by_date', 0, 2, 12, 4], ['campaigns', 0, 6, 12, 6]], 'a chart beside two KPIs would leave a void under them, so it drops below them at full width; the two KPIs then share their row');
  assert.ok(l.blocks.every((b) => !overlaps(b.widgets)));
  const notes = l.blocks[3].widgets;
  assert.equal(notes.find((w) => w.slug === 'manual')!.custom?.title, 'Budget', 'custom settings copied from the template');
  const text = notes.find((w) => w.slug === 'analysis')!;
  assert.deepEqual([text.x, text.y, text.w, text.h, text.component], [0, 2, 12, 2, 'analysis_v1'], 'stored position used (then compacted up from y=4 to y=2)');
  assert.ok(new Set(l.blocks.flatMap((b) => b.widgets.map((w) => w.id))).size === 12, 'ids unique');
});

test('justifyKpiRows: short KPI rows widen to the edge, runs re-pack evenly, a lone KPI and mixed rows are left alone', () => {
  const K = (id: string, x: number, y: number) => W(id, x, y, 3, 2);
  const C = (id: string, x: number, y: number, w: number, h: number) => W(id, x, y, w, h, { component: 'chart_v1' });
  const pos = (ws: LayoutWidget[]) => ws.map((w) => [w.id, w.x, w.y, w.w, w.h]);
  // five KPIs flowed 4 + 1, then a chart: the run becomes 3 + 2 (widths 4 and 6), the chart stays where it was
  const five = [K('a', 0, 0), K('b', 3, 0), K('c', 6, 0), K('d', 9, 0), K('e', 0, 2), C('ch', 0, 4, 12, 4)];
  assert.deepEqual(pos(justifyKpiRows(five)), [['a', 0, 0, 4, 2], ['b', 4, 0, 4, 2], ['c', 8, 0, 4, 2], ['d', 0, 2, 6, 2], ['e', 6, 2, 6, 2], ['ch', 0, 4, 12, 4]]);
  assert.ok(!overlaps(justifyKpiRows(five)));
  // three KPIs → four columns each; four → unchanged; one → unchanged
  assert.deepEqual(pos(justifyKpiRows([K('a', 0, 0), K('b', 3, 0), K('c', 6, 0), C('ch', 0, 2, 12, 4)])).slice(0, 3), [['a', 0, 0, 4, 2], ['b', 4, 0, 4, 2], ['c', 8, 0, 4, 2]]);
  const four = [K('a', 0, 0), K('b', 3, 0), K('c', 6, 0), K('d', 9, 0), C('ch', 0, 2, 12, 4)];
  assert.deepEqual(justifyKpiRows(four), four);
  const lone = [K('a', 0, 0), C('ch', 0, 2, 12, 4)];
  assert.deepEqual(justifyKpiRows(lone), lone, 'one number is not stretched across the page');
  // a row that also holds a chart is not a KPI row; KPIs below a chart are not a leading run
  const mixed = [K('a', 0, 0), K('b', 3, 0), C('ch', 6, 0, 6, 2), K('c', 0, 2), K('d', 3, 2)];
  assert.deepEqual(justifyKpiRows(mixed), mixed);
  const below = [C('ch', 0, 0, 12, 4), K('a', 0, 4), K('b', 3, 4)];
  assert.deepEqual(justifyKpiRows(below), below);
  // through fillRows: two KPIs beside a half-width chart → chart drops below at full width, the pair shares the row
  assert.deepEqual(pos(fillRows(flow([K('a', -1, -1), K('b', -1, -1), C('ch', -1, -1, 6, 4)]))), [['a', 0, 0, 6, 2], ['b', 6, 0, 6, 2], ['ch', 0, 2, 12, 4]]);
});

test('rebucket: daily → week / month / quarter with sum, avg and last-of-bucket semantics; comparison follows', () => {
  const labels = Array.from({ length: 31 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  const v: ChartValue = { type: 'chart', labels, series: [labels.map(() => 10), labels.map((_, i) => i + 1), labels.map(() => 2)], agg: ['sum', 'last', 'avg'], comparison: { series: [labels.map(() => 1), labels.map(() => 1), labels.map(() => 1)] } };
  const m = rebucket(v, 'month');
  assert.deepEqual(m.labels, ['2026-09-01']);
  assert.deepEqual(m.series.map((s) => s[0]), [310, 31, 2]);
  assert.deepEqual(m.comparison!.series.map((s) => s[0]), [31, 1, 1]);
  const w = rebucket(v, 'week');
  assert.equal(w.labels[0], '2026-08-31', 'weeks start on Monday (1 Sep 2026 is a Tuesday)');
  assert.equal(w.labels.length, 5);
  assert.equal(w.series[0].reduce((a, b) => a + b, 0), 310, 'weekly sums add up to the month');
  assert.equal(rebucket(v, 'quarter').labels[0], '2026-07-01');
  assert.equal(rebucket(v, 'day'), v, 'day is a no-op');
  assert.equal(rebucket({ ...v, labels: ['Mobile', 'Desktop'], series: [[1, 2]] }, 'month').labels[0], 'Mobile', 'categorical charts are left alone');
});

test('applyTableCustom: hide + reorder columns, sort by any column, row limit', () => {
  const t: TableValue = { type: 'table', columns: ['campaign', 'spend', 'clicks', 'ctr'], columnLabels: ['Campaign', 'Spend', 'Clicks', 'CTR'], columnFormats: ['text', 'currency', 'number', 'percent'], rows: [['A', 100, 5, 1.1], ['B', 50, 9, 2.2], ['C', 75, 1, 3.3]], total_rows: 3 };
  const out = applyTableCustom(t, { hiddenColumns: ['spend'], columnOrder: ['ctr', 'clicks'], sortBy: 'clicks', sortDir: 'asc', rows: 2 });
  assert.deepEqual(out.columns, ['campaign', 'ctr', 'clicks']);
  assert.deepEqual(out.columnLabels, ['Campaign', 'CTR', 'Clicks']);
  assert.deepEqual(out.columnFormats, ['text', 'percent', 'number']);
  assert.deepEqual(out.rows, [['C', 3.3, 1], ['A', 1.1, 5]]);
  assert.equal(applyTableCustom(t, undefined), t);
});

function fakeData(): ReportData {
  const block = (integrationId: number, key: string, value: RenderedBlock['widget']['value'], extra: Partial<RenderedBlock['widget']> = {}): RenderedBlock => ({ integrationId, platform: 'Meta Ads', slug: 'facebook_ads', account_name: `acct ${integrationId}`, widget: { reference_key: `fb_ads:${key}`, key, label: key.toUpperCase(), format: 'number', diff_type: 'positive_good', value, ...extra } });
  return {
    range: { start: '2026-09-01', end: '2026-09-30' },
    comparison: { start: '2026-08-01', end: '2026-08-31' },
    generated_at: '',
    sources: [{ integrationId: 1, source_id: 'a', platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'acct 1', currency: 'EUR', data_status: 'ok' }, { integrationId: 2, source_id: 'b', platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'acct 2', currency: 'EUR', data_status: 'ok' }],
    sections: [
      { id: 'ads', title: 'Paid media', blocks: [block(1, 'spend', { type: 'number', value: 100, comparison: { value: 80, change_pct: 25, absolute: 20 } }), block(1, 'conversions', { type: 'number', value: 10, comparison: { value: 20, change_pct: -50, absolute: -10 } }), block(2, 'spend', { type: 'number', value: 50, comparison: { value: 50, change_pct: 0, absolute: 0 } }), block(2, 'conversions', { type: 'number', value: 5, comparison: { value: 5, change_pct: 0, absolute: 0 } })] },
    ],
    widgets: { [storeKey(1, 'spend', { start: '2026-09-15', end: '2026-09-30' })]: block(1, 'spend', { type: 'number', value: 42 }) },
  };
}

test('composeReport: overrides, hidden widgets, manual / analysis / calculated widgets, custom period lookup, pending values', () => {
  const data = fakeData();
  const layout: ReportLayout = {
    version: 1,
    blocks: [
      { id: 'b1', title: 'Meta', integrationId: 1, slug: 'facebook_ads', widgets: [W('spend', 0, 0, 3, 2, { custom: { title: 'Investment', positiveBad: true, highlight: true } }), W('conversions', 3, 0, 3, 2, { custom: { hidden: true } }), W('spend_mtd', 6, 0, 3, 2, { key: 'spend', custom: { period: { start: '2026-09-15', end: '2026-09-30' } } }), W('cpm_new', 9, 0, 3, 2, { key: 'cpm' })] },
      { id: 'b2', title: 'Custom', integrationId: 0, slug: 'custom', widgets: [W('m', 0, 0, 3, 2, { slug: 'manual', key: 'number', component: 'empty_v1', integrationId: 0, custom: { title: 'Budget', value: 1000, previous: 800, format: 'currency' } }), W('t', 3, 0, 9, 2, { slug: 'analysis', key: 'text', component: 'analysis_v1', integrationId: 0, custom: { html: '<p>ok</p><script>x()</script>' } }), W('c', 0, 2, 3, 2, { slug: 'calculated', key: 'formula', component: 'calculated_v1', integrationId: 0, custom: { title: 'Cost / conv', formula: '{fb_ads:spend} / {fb_ads:conversions}', format: 'currency' } }), W('c2', 3, 2, 3, 2, { slug: 'calculated', key: 'formula', component: 'calculated_v1', integrationId: 0, custom: { formula: '{fb_ads:nothing} * 2' } })] },
    ],
  };
  const ctx = { sources: [{ id: 1, slug: 'facebook_ads', name: 'acct 1' }, { id: 2, slug: 'facebook_ads', name: 'acct 2' }], currency: 'EUR', range: data.range, comparison: data.comparison };
  const out = composeReport(data, layout, ctx);
  assert.equal(out.sections.length, 2);
  assert.deepEqual(out.sections[0].source, { integrationId: 1, slug: 'facebook_ads', platform: 'Meta Ads', account_name: 'acct 1' });
  const b1 = out.sections[0].blocks;
  assert.deepEqual(b1.map((b) => b.id), ['spend', 'spend_mtd', 'cpm_new'], 'hidden widget removed from the client view');
  assert.equal(b1[0].widget.label, 'Investment');
  assert.equal(b1[0].widget.diff_type, 'positive_bad');
  assert.deepEqual(b1[0].layout, { x: 0, y: 0, w: 3, h: 2 });
  assert.equal((b1[0].custom as any).highlight, true);
  assert.equal((b1[1].widget.value as any).value, 42, 'custom-period value comes from the widgets map');
  assert.equal(b1[2].widget.value.type, 'error');
  assert.equal((b1[2].widget.value as any).code, 'pending', 'a value the store does not have yet is pending, not an error');
  const b2 = out.sections[1].blocks;
  assert.equal(b2[0].widget.label, 'Budget');
  assert.deepEqual(b2[0].widget.value, { type: 'number', value: 1000, comparison: { value: 800, change_pct: 25, absolute: 200 } });
  assert.equal(b2[0].widget.format, 'currency');
  assert.equal((b2[1].widget.value as any).html, '<p>ok</p>', 'analysis html is sanitised');
  assert.deepEqual(b2[2].widget.value, { type: 'number', value: 10, comparison: { value: 5.2, change_pct: 92.31, absolute: 4.8 } }, '(100+50)/(10+5) across both accounts; previous (80+50)/(20+5)');
  assert.equal((b2[3].widget.value as any).code, 'pending');
  assert.equal(composeReport(data, layout, ctx, { includeHidden: true }).sections[0].blocks.length, 4, 'editor keeps hidden widgets');

  // round trip through sections (save as template) keeps settings and positions, drops hidden widgets
  const secs = layoutToSections(layout);
  assert.equal(secs.length, 2);
  assert.deepEqual(secs[0].widgets.map((w) => w.key), ['spend', 'spend', 'cpm']);
  assert.deepEqual(secs[0].widgets[0].layout, { x: 0, y: 0, w: 3, h: 2 });
  assert.equal((secs[0].widgets[0].custom as any).title, 'Investment');
  assert.equal(sectionsFromData(data).sources.length, 2);
});

test('normalizeLayout: rejects widgets outside the grid and duplicate ids, drops empty custom objects, compacts', () => {
  const ok = normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'T', integrationId: 1, slug: 'facebook_ads', widgets: [{ ...W('a', 0, 5, 3, 2), custom: {} }] }] });
  assert.equal(ok.blocks[0].widgets[0].y, 0, 'compacted');
  assert.equal(ok.blocks[0].widgets[0].custom, undefined);
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'T', integrationId: 1, slug: 'x', widgets: [W('a', 10, 0, 3, 2)] }] }), /does not fit/);
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'T', integrationId: 1, slug: 'x', widgets: [W('a', 0, 0, 3, 2), W('a', 3, 0, 3, 2)] }] }), /Duplicate/);
  assert.throws(() => normalizeLayout({ version: 2, blocks: [] }));
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'T', integrationId: 1, slug: 'x', widgets: [{ ...W('a', 0, 0, 3, 2), custom: { evil: 1 } }] }] }), 'unknown custom keys are rejected');
});

test('service: seed on first open, save layout (new widget, custom period, calculated), prune, sync integrationIds, client view + CSV follow the layout', async () => {
  const { company, project, token } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const gads = await addIntegration(company.id, project.id, 'google_adwords'); // connected to the project, not to the report
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Editable', start: '2026-09-01', end: '2026-09-30', comparisonStart: '2026-08-01', comparisonEnd: '2026-08-31', templateId: tpl.id, integrationIds: [fb.id, ga.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  assert.equal(layoutOf(r), null, 'no layout until opened');

  const view = await reportView(r, { includeHidden: true });
  assert.ok(view.seeded);
  assert.ok(view.layout.blocks.length >= 2, 'one block per section × account');
  assert.ok(view.layout.blocks.every((b) => b.widgets.length > 0 && !overlaps(b.widgets)));
  assert.ok(view.data.sections.every((s) => s.source && s.blocks.every((b) => b.layout && b.id)), 'composed sections carry grid positions');
  assert.ok(view.data.sections.flatMap((s) => s.blocks).every((b) => b.widget.value.type !== 'error'), 'every seeded widget has its generated value');
  const fbBlock = view.layout.blocks.find((b) => b.integrationId === fb.id)!;
  const spend = fbBlock.widgets.find((w) => w.key === 'spend')!;
  assert.deepEqual([spend.w, spend.h, spend.component], [4, 2, 'number_v1'], 'nine KPIs seed as three justified rows of three (four columns each), not 4 + 4 + 1');
  assert.equal(fbBlock.widgets.find((w) => w.key === 'campaigns')!.w, 12);
  await persistSeed(r, view);
  r = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  assert.deepEqual(layoutOf(r), view.layout, 'seed persisted');
  assert.equal((await reportView(r)).seeded, false);

  // edit: rename spend, hide impressions, add CPM (not in the template), add a custom-period copy, a calculated widget and a block for Google Ads
  const layout: ReportLayout = JSON.parse(JSON.stringify(view.layout));
  const blk = layout.blocks.find((b) => b.integrationId === fb.id)!;
  blk.widgets.find((w) => w.key === 'spend')!.custom = { title: 'Investment', showAbsolute: true };
  blk.widgets.find((w) => w.key === 'impressions')!.custom = { hidden: true };
  blk.widgets.push({ id: 'new_cpm', slug: 'facebook_ads', key: 'cpm', component: 'number_v1', integrationId: fb.id, x: 0, y: 50, w: 3, h: 2 });
  blk.widgets.push({ id: 'spend_h2', slug: 'facebook_ads', key: 'spend', component: 'number_v1', integrationId: fb.id, x: 3, y: 50, w: 3, h: 2, custom: { period: { start: '2026-09-16', end: '2026-09-30' } } });
  blk.widgets.push({ id: 'cpa', slug: 'calculated', key: 'formula', component: 'calculated_v1', integrationId: 0, x: 6, y: 50, w: 3, h: 2, custom: { title: 'CPA (formula)', formula: '{fb_ads:spend} / {fb_ads:conversions}', format: 'currency' } });
  layout.blocks.push({ id: 'gads_block', title: 'Google Ads', integrationId: gads.id, slug: 'google_adwords', widgets: [{ id: 'g_spend', slug: 'google_adwords', key: 'spend', component: 'number_v1', integrationId: gads.id, x: 0, y: 0, w: 3, h: 2 }] });
  const saved = await saveLayout(r, layout);
  const keys = Object.keys(saved.data.widgets ?? {});
  assert.ok(keys.includes(`${fb.id}:cpm`), `cpm resolved into the store: ${keys}`);
  assert.ok(keys.includes(`${fb.id}:spend@2026-09-16..2026-09-30`), 'custom period stored under a period key');
  assert.ok(keys.includes(`${gads.id}:spend`), 'widget of the newly added block resolved');
  assert.ok(keys.includes(`${fb.id}:conversions`) || indexValues(saved.data).has(`${fb.id}:conversions`), 'calculated refs available');
  r = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  assert.deepEqual((r.integrationIds as number[]).sort(), [fb.id, ga.id, gads.id].sort(), 'integrationIds follow the blocks');
  const v2 = await reportView(r);
  const fbSec = v2.data.sections.find((s) => s.id === blk.id)!;
  const byId = Object.fromEntries(fbSec.blocks.map((b) => [b.id!, b]));
  assert.equal(byId[spend.id].widget.label, 'Investment');
  assert.ok(!fbSec.blocks.some((b) => b.widget.key === 'impressions'), 'hidden widget absent from the client view');
  assert.equal(byId.new_cpm.widget.value.type, 'number');
  assert.equal(byId.new_cpm.widget.label, 'CPM');
  assert.equal(byId.spend_h2.widget.value.type, 'number');
  assert.notEqual((byId.spend_h2.widget.value as any).value, (byId[spend.id].widget.value as any).value, 'half-month value differs from the full month');
  assert.equal(byId.cpa.widget.value.type, 'number', JSON.stringify(byId.cpa.widget.value));
  assert.equal(byId.cpa.widget.format, 'currency');
  const gSec = v2.data.sections.find((s) => s.id === 'gads_block')!;
  assert.equal(gSec.source!.platform, 'Google Ads');
  assert.equal(gSec.blocks[0].widget.value.type, 'number');

  // the client link and CSV render the same composition
  const csv = reportToCsv(v2.data);
  assert.match(csv, /Investment/);
  assert.ok(!/,IMPRESSIONS,|Impressions,number/.test(csv.split('\n').filter((l) => l.startsWith('Paid media,Meta Ads')).join('\n')), 'hidden widget not exported');
  assert.match(csv, /CPA \(formula\)/);
  const viaApi = await api(token, 'GET', `/reports/${r.id}/data`);
  assert.equal(viaApi.status, 200);
  assert.equal(viaApi.json.data.layout.blocks.length, layout.blocks.length);
  assert.ok(viaApi.json.data.sections.some((s: any) => s.blocks.some((b: any) => b.widget.label === 'Investment')));
  const csvApi = await api(token, 'GET', `/reports/${r.id}/export.csv`);
  assert.match(String(csvApi.json), /Investment/);

  // refresh (re-snapshot) keeps the layout's extra values; removing a widget prunes its stored value
  const fresh = await snapshotReport(r);
  assert.ok(indexValues(fresh).has(`${fb.id}:cpm`), 'refresh generates editor-added widgets as part of the snapshot');
  assert.ok(indexValues(fresh).has(`${fb.id}:spend@2026-09-16..2026-09-30`), 'refresh re-resolves custom periods');
  const layout2: ReportLayout = JSON.parse(JSON.stringify(saved.layout));
  const b2 = layout2.blocks.find((b) => b.integrationId === fb.id)!;
  b2.widgets = b2.widgets.filter((w) => w.id !== 'new_cpm' && w.id !== 'spend_h2');
  const saved2 = await saveLayout(r, layout2);
  assert.ok(!Object.keys(saved2.data.widgets ?? {}).includes(`${fb.id}:cpm`), 'pruned');
  assert.ok(!Object.keys(saved2.data.widgets ?? {}).some((k) => k.includes('@')), 'period variant pruned');

  // tenant / project guard
  const other = await db.project.create({ data: { companyId: company.id, name: 'Other' } });
  const foreign = await addIntegration(company.id, other.id, 'facebook_ads');
  const bad: ReportLayout = { version: 1, blocks: [{ id: 'x', title: 'X', integrationId: foreign.id, slug: 'facebook_ads', widgets: [] }] };
  await assert.rejects(saveLayout(r, bad), /does not belong/);
});

test('save as template: blocks → sections with settings and positions; a new report seeds from them (manual + analysis included)', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', title: 'Executive summary' } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Exec', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [fb.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const view = await reportView(r);
  const layout: ReportLayout = JSON.parse(JSON.stringify(view.layout));
  const blk = layout.blocks.find((b) => b.integrationId === fb.id)!;
  blk.title = 'Meta — overview';
  blk.widgets[0].custom = { title: 'Media investment', highlight: true };
  blk.widgets[0].w = 6;
  blk.widgets.push({ id: 'hid', slug: 'facebook_ads', key: 'cpm', component: 'number_v1', integrationId: fb.id, x: 0, y: 40, w: 3, h: 2, custom: { hidden: true } });
  layout.blocks.push({ id: 'cb', title: 'Next steps', integrationId: 0, slug: 'custom', widgets: [{ id: 'txt', slug: 'analysis', key: 'text', component: 'analysis_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 3, custom: { title: 'Plan', html: '<p>Scale the winners.</p>' } }, { id: 'man', slug: 'manual', key: 'number', component: 'empty_v1', integrationId: 0, x: 0, y: 3, w: 3, h: 2, custom: { title: 'Budget', value: 9000, format: 'currency' } }] });
  await saveLayout(r, layout);
  r = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });

  const t = await saveAsTemplate(r, company.id, { title: 'From report' });
  assert.equal(t.companyId, company.id);
  assert.equal(t.kind, 'report');
  const secs = t.sections as unknown as TemplateSection[];
  const meta = secs.find((s) => s.title === 'Meta — overview')!;
  assert.ok(meta, JSON.stringify(secs.map((s) => s.title)));
  assert.equal(meta.widgets[0].slug, 'facebook_ads');
  assert.deepEqual(meta.widgets[0].layout, { x: 0, y: 0, w: 6, h: 2 });
  assert.equal((meta.widgets[0].custom as any).title, 'Media investment');
  assert.ok(!meta.widgets.some((w) => w.key === 'cpm'), 'hidden widgets are not saved into the template');
  const next = secs.find((s) => s.title === 'Next steps')!;
  assert.deepEqual(next.widgets.map((w) => w.slug), ['analysis', 'manual']);
  await assert.rejects(saveAsTemplate(r, company.id, { title: '  ' }), /Title/);

  // a report generated from it gets the edited layout back — including the manual/analysis widgets
  const fb2 = await addIntegration(company.id, project.id, 'facebook_ads');
  const r2 = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'From tpl', start: '2026-09-01', end: '2026-09-30', templateId: t.id, integrationIds: [fb.id, fb2.id] });
  const full2 = await db.report.findUniqueOrThrow({ where: { id: r2.id }, include: { project: true } });
  const v2 = await reportView(full2);
  const metaBlocks = v2.layout.blocks.filter((b) => b.title === 'Meta — overview');
  assert.equal(metaBlocks.length, 2, 'one block per Meta account');
  assert.equal(metaBlocks[0].widgets[0].w, 6);
  assert.equal(metaBlocks[0].widgets[0].custom?.title, 'Media investment');
  const custom = v2.layout.blocks.find((b) => b.integrationId === 0)!;
  assert.deepEqual(custom.widgets.map((w) => w.slug), ['analysis', 'manual']);
  const rendered = v2.data.sections.find((s) => s.id === custom.id)!;
  assert.equal((rendered.blocks[0].widget.value as any).html, '<p>Scale the winners.</p>');
  assert.equal((rendered.blocks[1].widget.value as any).value, 9000);
  assert.equal(v2.data.sections.find((s) => s.id === metaBlocks[0].id)!.blocks[0].widget.label, 'Media investment');
});

test('dashboards: the live view follows the layout and caches by the set of values it needs', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'dashboard' } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'dashboard', title: 'Live', preset: 'last_7d', templateId: tpl.id, integrationIds: [fb.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const view = await reportView(r);
  await persistSeed(r, view);
  r = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  const layout: ReportLayout = JSON.parse(JSON.stringify(view.layout));
  const blk = layout.blocks.find((b) => b.integrationId === fb.id)!;
  blk.widgets.push({ id: 'd_cpm', slug: 'facebook_ads', key: 'cpm', component: 'number_v1', integrationId: fb.id, x: 0, y: 30, w: 3, h: 2, custom: { title: 'CPM (live)' } });
  const saved = await saveLayout(r, layout);
  assert.ok(indexValues(saved.data).has(`${fb.id}:cpm`), 'live data regenerated with the new widget');
  r = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  const live = await liveDashboardData(r);
  assert.equal(live.range.start, saved.range.start);
  const v2 = await reportView(r);
  const cpm = v2.data.sections.find((s) => s.id === blk.id)!.blocks.find((b) => b.id === 'd_cpm')!;
  assert.equal(cpm.widget.label, 'CPM (live)');
  assert.equal(cpm.widget.value.type, 'number');
  // moving a widget does not change the fingerprint → same cached data object
  const moved: ReportLayout = JSON.parse(JSON.stringify(saved.layout));
  moved.blocks.find((b) => b.integrationId === fb.id)!.widgets.find((w) => w.id === 'd_cpm')!.x = 3;
  const saved2 = await saveLayout(r, moved);
  assert.equal(saved2.data, live.data, 'moving widgets re-uses the cached live data');
});
