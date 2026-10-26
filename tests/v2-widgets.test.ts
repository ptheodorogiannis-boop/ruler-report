import assert from 'node:assert/strict';
import test from 'node:test';
import type { RenderedBlock, ReportData } from '../src/lib/engine/types';
import { normalizeLayout } from '../src/lib/layout/compose';
import { reportToCsv } from '../src/lib/services/export';
import type { LayoutWidget } from '../src/lib/layout/types';

const W = (id: string, slug: string, key: string, component: LayoutWidget['component'], custom: LayoutWidget['custom'], x = 0, y = 0, w = 6, h = 4): LayoutWidget => ({ id, slug, key, component, integrationId: 0, x, y, w, h, custom });
const layoutWith = (...widgets: LayoutWidget[]) => ({ version: 1, blocks: [{ id: 'b', title: 'Custom', integrationId: 0, slug: 'custom', widgets }] });

test('registries: custom chart, infographic and image widgets pass validation with their settings; bad values are rejected', () => {
  const ok = normalizeLayout(
    layoutWith(
      W('c', 'custom_chart', 'chart', 'custom_chart_v1', { title: 'Spend vs sessions', chartType: 'donut', series: [{ integrationId: 1, key: 'spend_by_date', label: 'Spend', color: '#b8321f' }], groupBy: 'week' }),
      W('t', 'infographic', 'tile', 'infographic_v1', { kind: 'progress', ref: { integrationId: 1, key: 'spend' }, target: 100, icon: 'target' }, 6, 0, 3, 2),
      W('i', 'image', 'image', 'image_v1', { url: '/api/media/abc123', fit: 'cover', caption: 'Spring creative', alt: 'Ad' }, 0, 4)
    )
  );
  assert.deepEqual(
    ok.blocks[0].widgets.map((w) => w.component),
    ['custom_chart_v1', 'infographic_v1', 'image_v1']
  );
  assert.equal(ok.blocks[0].widgets[0].custom?.series?.[0].key, 'spend_by_date');
  assert.throws(() => normalizeLayout(layoutWith(W('t', 'infographic', 'tile', 'infographic_v1', { kind: 'pie' as any }))), 'unknown tile kind');
  assert.throws(() => normalizeLayout(layoutWith(W('i', 'image', 'image', 'image_v1', { url: 'javascript:alert(1)' }))), 'unsafe image url');
  assert.throws(() => normalizeLayout(layoutWith(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { chartType: 'stacked', items: Array.from({ length: 51 }, (_, i) => ({ label: String(i), value: i })) }))), 'too many typed items');
  assert.throws(() => normalizeLayout(layoutWith(W('c', 'custom_chart', 'chart', 'custom_chart_v1', { chartType: 'radar' as any }))), 'unknown chart type');
});

test('csv export: tile and image values become rows', () => {
  const block = (key: string, value: RenderedBlock['widget']['value']): RenderedBlock => ({ integrationId: 0, platform: 'Custom', slug: 'custom', account_name: '', widget: { reference_key: key, key, label: key, format: 'number', diff_type: 'neutral', value } });
  const data: ReportData = {
    range: { start: '2026-09-01', end: '2026-09-30' },
    comparison: null,
    generated_at: '',
    sources: [],
    sections: [
      {
        id: 's',
        title: 'Extras',
        blocks: [
          block('ranking', { type: 'tile', kind: 'ranking', format: 'number', items: [{ label: 'Brand', value: 10 }, { label: 'Generic', value: 4 }] }),
          block('progress', { type: 'tile', kind: 'progress', format: 'number', value: 25, target: 100, note: '25% of target' }),
          block('creative', { type: 'image', url: '/api/media/abc', alt: 'Spring creative', fit: 'cover' }),
        ],
      },
    ],
  };
  const csv = reportToCsv(data);
  assert.match(csv, /Extras,Custom,,ranking,tile,Brand,10/);
  assert.match(csv, /Extras,Custom,,ranking,tile,Generic,4/);
  assert.match(csv, /Extras,Custom,,progress,tile,progress,25,100/);
  assert.match(csv, /Extras,Custom,,creative,image,Spring creative,\/api\/media\/abc/);
});
