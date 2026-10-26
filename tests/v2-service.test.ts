import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { createReport } from '../src/lib/services/reports';
import { reportView, saveLayout } from '../src/lib/layout/service';
import { composeReport, indexValues, storeKey } from '../src/lib/layout/compose';
import type { ReportLayout } from '../src/lib/layout/types';
import { addIntegration, makeCompany } from './helpers';

test('image widget: composed from its settings; without an image it says so', () => {
  const data = { range: { start: '2026-09-01', end: '2026-09-30' }, comparison: null, generated_at: '', sources: [], sections: [] } as any;
  const ctx = { sources: [], currency: 'EUR', range: data.range, comparison: null };
  const layout: ReportLayout = { version: 1, blocks: [{ id: 'b', title: 'Images', integrationId: 0, slug: 'custom', widgets: [
    { id: 'i1', slug: 'image', key: 'image', component: 'image_v1', integrationId: 0, x: 0, y: 0, w: 6, h: 4, custom: { url: '/api/media/abc', fit: 'cover', caption: 'Spring creative', alt: 'Ad' } },
    { id: 'i2', slug: 'image', key: 'image', component: 'image_v1', integrationId: 0, x: 6, y: 0, w: 6, h: 4, custom: { title: 'Logo' } },
  ] }] };
  const out = composeReport(data, layout, ctx);
  const [a, b] = out.sections[0].blocks.map((x) => x.widget.value);
  assert.deepEqual(a, { type: 'image', url: '/api/media/abc', alt: 'Ad', caption: 'Spring creative', fit: 'cover' });
  assert.deepEqual([b.type, (b as any).message], ['error', 'Choose an image.']);
});

test('custom widgets: saveLayout fetches the metrics they reference into the store, composes them, and prunes them when removed', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Custom widgets', start: '2026-09-01', end: '2026-09-30', comparisonStart: '2026-08-01', comparisonEnd: '2026-08-31', templateId: tpl.id, integrationIds: [fb.id] });
  const r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const view = await reportView(r, { includeHidden: true });
  const layout: ReportLayout = JSON.parse(JSON.stringify(view.layout));
  layout.blocks.push({
    id: 'extras',
    title: 'Extras',
    integrationId: 0,
    slug: 'custom',
    widgets: [
      { id: 'cc', slug: 'custom_chart', key: 'chart', component: 'custom_chart_v1', integrationId: 0, x: 0, y: 0, w: 6, h: 4, custom: { title: 'Spend', series: [{ integrationId: fb.id, key: 'spend_by_date' }] } },
      { id: 'rank', slug: 'infographic', key: 'tile', component: 'infographic_v1', integrationId: 0, x: 6, y: 0, w: 3, h: 2, custom: { kind: 'ranking', tableRef: { integrationId: fb.id, key: 'campaigns', rows: 3 } } },
      { id: 'stat', slug: 'infographic', key: 'tile', component: 'infographic_v1', integrationId: 0, x: 9, y: 0, w: 3, h: 2, custom: { kind: 'stat', ref: { integrationId: fb.id, key: 'cpm' } } },
      { id: 'img', slug: 'image', key: 'image', component: 'image_v1', integrationId: 0, x: 0, y: 4, w: 6, h: 4, custom: { url: '/api/media/abc', fit: 'cover' } },
    ],
  });
  const saved = await saveLayout(r, layout);
  const idx = indexValues(saved.data);
  assert.ok(idx.has(storeKey(fb.id, 'spend_by_date')), 'series ref available');
  assert.ok(Object.keys(saved.data.widgets ?? {}).includes(storeKey(fb.id, 'cpm')), 'the stat ref (not in the template) was fetched into the store');
  const r2 = await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } });
  const v2 = await reportView(r2);
  const extras = v2.data.sections.find((s) => s.id === 'extras')!;
  const by = Object.fromEntries(extras.blocks.map((b) => [b.id!, b.widget.value]));
  assert.equal(by.cc.type, 'chart');
  assert.ok((by.cc as any).labels.length >= 28, 'daily series for September');
  assert.deepEqual([by.rank.type, (by.rank as any).kind, (by.rank as any).items.length], ['tile', 'ranking', 3]);
  assert.deepEqual([by.stat.type, (by.stat as any).kind, typeof (by.stat as any).value], ['tile', 'stat', 'number']);
  assert.equal(by.img.type, 'image');
  // removing the stat widget prunes the value nothing refers to any more
  const layout2: ReportLayout = JSON.parse(JSON.stringify(saved.layout));
  const extrasBlock = layout2.blocks.find((b) => b.id === 'extras')!;
  extrasBlock.widgets = extrasBlock.widgets.filter((w) => w.id !== 'stat');
  const saved2 = await saveLayout(r2, layout2);
  assert.ok(!Object.keys(saved2.data.widgets ?? {}).includes(storeKey(fb.id, 'cpm')), 'pruned');
});
