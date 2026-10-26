import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RenderedBlock, WidgetValue } from '../src/lib/engine/types';

const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
const block = (key: string, value: WidgetValue, label = key): RenderedBlock => ({ id: key, integrationId: 0, platform: 'Infographic', slug: 'infographic', account_name: '', widget: { reference_key: key, key, label, format: 'number', diff_type: 'positive_good', value }, layout: { x: 0, y: 0, w: 3, h: 2 } });

test('TileCard: progress ring with the percentage, ranking rows in order, stat with icon and delta, compare with two values', async () => {
  const { TileCard } = await import('../src/components/infographic');
  const progress = renderToStaticMarkup(createElement(TileCard, { b: block('p', { type: 'tile', kind: 'progress', format: 'currency', value: 25, target: 100, note: '25% of target' }, 'Budget used'), fmt, grid: true }));
  assert.match(progress, /class="tile tile-progress/);
  assert.match(progress, /<svg[^>]*class="ring"/);
  assert.match(progress, />25%</);
  assert.match(progress, /25% of target/);
  const ranking = renderToStaticMarkup(createElement(TileCard, { b: block('r', { type: 'tile', kind: 'ranking', format: 'number', items: [{ label: 'Brand', value: 300 }, { label: 'Generic', value: 150 }, { label: 'Retargeting', value: 75 }] }, 'Top campaigns'), fmt, grid: true }));
  const order = ['Brand', 'Generic', 'Retargeting'].map((l) => ranking.indexOf(l));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'rows keep their order');
  assert.match(ranking, /style="width:50%"/, 'bars are proportional to the top value');
  const stat = renderToStaticMarkup(createElement(TileCard, { b: block('s', { type: 'tile', kind: 'stat', format: 'currency', value: 1234.5, comparison: { value: 1000, change_pct: 23.5, absolute: 234.5 }, icon: 'euro' }, 'Revenue'), fmt, grid: true }));
  assert.match(stat, /data-icon="euro"/);
  assert.match(stat, /class="delta delta-up"/);
  assert.match(stat, /23\.5%/);
  const compare = renderToStaticMarkup(createElement(TileCard, { b: block('c', { type: 'tile', kind: 'compare', format: 'number', items: [{ label: 'Meta', value: 80 }, { label: 'Google', value: 120 }] }, 'Leads by source'), fmt, grid: true }));
  assert.match(compare, /Meta/);
  assert.match(compare, /Google/);
  assert.match(compare, /class="tile tile-compare/);
});

test('ImageCard: image with caption, placeholder without', async () => {
  const { ImageCard } = await import('../src/components/image-card');
  const img = renderToStaticMarkup(createElement(ImageCard, { b: block('i', { type: 'image', url: '/api/media/abc', alt: 'Spring creative', caption: 'Spring 2026', fit: 'cover' }), fmt, grid: true }));
  assert.match(img, /<img[^>]*src="\/api\/media\/abc"/);
  assert.match(img, /Spring 2026/);
  assert.match(img, /object-fit:cover/);
  const { WidgetCard } = await import('../src/components/widgets');
  const viaCard = renderToStaticMarkup(createElement(WidgetCard, { b: block('i', { type: 'image', url: '', alt: 'x', fit: 'contain' }), fmt, grid: true }));
  assert.match(viaCard, /media-ph/);
});
