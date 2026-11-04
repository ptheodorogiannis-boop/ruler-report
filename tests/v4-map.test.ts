import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_MAP_PANEL, colourSteps, mapRefs, mapValue } from '../src/lib/layout/map';
import { composeReport, normalizeLayout, storeKey } from '../src/lib/layout/compose';
import { widgetRefs } from '../src/lib/layout/refs';
import type { MetricRef } from '../src/lib/layout/types';
import type { RenderedBlock } from '../src/lib/engine/types';

const range = { start: '2026-09-01', end: '2026-09-30' };
const comparison = { start: '2026-08-02', end: '2026-08-31' };
const shade: MetricRef = { integrationId: 7, key: 'sessions_by_country' };
const spend: MetricRef = { integrationId: 8, key: 'spend_by_country' };

const byCountry = (integrationId: number, key: string, label: string, labels: string[], cur: number[], prev: number[], format: 'number' | 'currency' = 'number'): RenderedBlock => ({
  integrationId,
  platform: integrationId === 7 ? 'Google Analytics 4' : 'Meta Ads',
  slug: integrationId === 7 ? 'google_analytics_4' : 'facebook_ads',
  account_name: `Account ${integrationId}`,
  widget: { reference_key: `x:${key}`, key, label, format, diff_type: 'positive_good', currency: 'EUR', value: { type: 'chart', labels, series: [cur], comparison: { series: [prev] } } },
});
const sessions = byCountry(7, 'sessions_by_country', 'Sessions by country', ['Greece', 'Cyprus', '(not set)'], [300, 120, 7], [250, 100, 5]);
const spendBlock = byCountry(8, 'spend_by_country', 'Spend by country', ['GR', 'DE'], [900, 40], [800, 50], 'currency');
const lookupOf = (blocks: Record<string, RenderedBlock | undefined>) => (r: MetricRef) => blocks[`${r.integrationId}:${r.key}`];

test('map refs: the colour metric first, then the panel metrics, without repeats, at most six panel metrics', () => {
  assert.equal(MAX_MAP_PANEL, 6);
  assert.deepEqual(mapRefs({ custom: { mapShade: shade, mapPanel: [shade, spend] } }), [shade, spend]);
  const many = Array.from({ length: 9 }, (_, i) => ({ integrationId: 20 + i, key: 'spend_by_country' }));
  assert.equal(mapRefs({ custom: { mapShade: shade, mapPanel: many } }).length, 1 + 6);
  assert.deepEqual(mapRefs({ custom: {} }), []);
  assert.deepEqual(widgetRefs({ slug: 'map', custom: { mapShade: shade, mapPanel: [spend] } }), [shade, spend], 'the engine and the account list read the same refs');
});

test('map value: countries by code with this and the previous period; unmatched rows kept apart', () => {
  const v = mapValue({ custom: { mapShade: shade, mapPanel: [spend] } }, lookupOf({ '7:sessions_by_country': sessions, '8:spend_by_country': spendBlock }));
  assert.equal(v.type, 'map');
  if (v.type !== 'map') return;
  assert.equal(v.metrics[0].label, 'Sessions by country');
  assert.equal(v.metrics[1].format, 'currency');
  const gr = v.countries.find((c) => c.code === 'GR')!;
  const cy = v.countries.find((c) => c.code === 'CY')!;
  const de = v.countries.find((c) => c.code === 'DE')!;
  assert.deepEqual([gr.values, gr.previous], [[300, 900], [250, 800]], 'GA4 name and Meta code meet on GR');
  assert.deepEqual([cy.values, cy.previous], [[120, null], [100, null]]);
  assert.deepEqual(de.values, [null, 40], 'a country only the panel metric has still appears');
  assert.equal(gr.name, 'Greece');
  assert.deepEqual(v.unmatched, [{ label: '(not set)', values: [7, null] }]);
  assert.equal(v.steps.length, 4);
});

test('map value: a failing panel metric shows its error, the rest still renders; bad set-ups explain themselves', () => {
  const failing: RenderedBlock = { ...spendBlock, widget: { ...spendBlock.widget, value: { type: 'error', code: 'integration_error', message: 'Token expired' } as any } };
  const v = mapValue({ custom: { mapShade: shade, mapPanel: [spend] } }, lookupOf({ '7:sessions_by_country': sessions, '8:spend_by_country': failing }));
  assert.equal(v.type, 'map');
  if (v.type !== 'map') return;
  assert.equal(v.metrics[1].error, 'Token expired');
  assert.deepEqual(v.countries.find((c) => c.code === 'GR')!.values, [300, null]);
  const none = mapValue({ custom: {} }, () => undefined);
  assert.deepEqual(none, { type: 'error', code: 'invalid_metrics_combination', message: 'Pick a metric to colour the countries by.' });
  const notCountry: RenderedBlock = { ...sessions, widget: { ...sessions.widget, value: { type: 'number', value: 3 } } };
  const bad = mapValue({ custom: { mapShade: shade } }, lookupOf({ '7:sessions_by_country': notCountry }));
  assert.deepEqual(bad, { type: 'error', code: 'invalid_metrics_combination', message: 'Pick a "by country" metric.' });
});

test('colour steps: four ascending thresholds; equal values or one country collapse to one step without dividing by zero', () => {
  assert.deepEqual(colourSteps([]), []);
  assert.deepEqual(colourSteps([5, 5, 5]), [5, 5, 5, 5]);
  assert.deepEqual(colourSteps([0, 0]), [0, 0, 0, 0]);
  assert.deepEqual(colourSteps([42]), [42, 42, 42, 42]);
  const s = colourSteps([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(s.length, 4);
  assert.ok(s.every((x, i) => i === 0 || x >= s[i - 1]), 'ascending');
  assert.ok(s[0] > 1 && s[3] < 10, 'thresholds sit between the extremes');
});

test('map widget through the layout: normalised, composed into a map value, a seventh panel metric refused', () => {
  const widget = { id: 'm', slug: 'map', key: 'map', component: 'map_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 7, custom: { mapShade: shade, mapPanel: [spend] } };
  const layout = normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'Where', integrationId: 0, slug: 'custom', widgets: [widget] }] });
  assert.deepEqual(layout.blocks[0].widgets[0].custom?.mapPanel, [spend]);
  const seven = Array.from({ length: 7 }, (_, i) => ({ integrationId: 30 + i, key: 'spend_by_country' }));
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'Where', integrationId: 0, slug: 'custom', widgets: [{ ...widget, custom: { mapShade: shade, mapPanel: seven } }] }] }), 'at most six panel metrics');
  const data = { range, comparison, generated_at: '', sources: [], sections: [], widgets: { [storeKey(7, 'sessions_by_country')]: sessions, [storeKey(8, 'spend_by_country')]: spendBlock } } as any;
  const out = composeReport(data, layout, { sources: [], currency: 'EUR', range, comparison });
  const v = out.sections[0].blocks[0].widget.value;
  assert.equal(v.type, 'map');
  assert.equal(out.sections[0].blocks[0].widget.label, 'Map');
});

test('catalog: country breakdowns for visits, users, conversions and revenue (GA4) and spend, clicks and conversions (Meta Ads) for the map', async () => {
  const { findWidget } = await import('../src/lib/catalog/build');
  for (const [slug, key] of [
    ['google_analytics_4', 'sessions_by_country'],
    ['google_analytics_4', 'users_by_country'],
    ['google_analytics_4', 'conversions_by_country'],
    ['google_analytics_4', 'revenue_by_country'],
    ['facebook_ads', 'spend_by_country'],
    ['facebook_ads', 'clicks_by_country'],
    ['facebook_ads', 'conversions_by_country'],
  ]) {
    const w = findWidget(slug, key);
    assert.ok(w, `${slug}:${key}`);
    assert.equal((w!.calc as any).kind, 'chart_breakdown', key);
    assert.equal((w!.calc as any).dimension, 'country', key);
  }
});
