// Thumbnails and result types on the page (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/lib/i18n';
import type { RenderedBlock } from '../src/lib/engine/types';

const block = (value: unknown, key = 'campaigns'): RenderedBlock =>
  ({ integrationId: 1, platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', widget: { reference_key: `fb_ads:${key}`, key, label: 'Ads', format: 'number', diff_type: 'neutral', value } }) as any;

const adsValue = (level?: 'ad') => ({
  type: 'container',
  ...(level ? { level } : {}),
  metrics: [
    { key: 'results', label: 'Results', format: 'number' },
    { key: 'cost_per_result', label: 'Cost per result', format: 'currency' },
    { key: 'spend', label: 'Spend', format: 'currency' },
  ],
  rows: [
    { id: 'a1', name: 'Blue Marathon', status: 'active', values: [2, 49.33, 98.66], thumb: 'https://cdn.example/a1.jpg', resultType: 'offsite_conversion.fb_pixel_purchase' },
    { id: 'a2', name: 'Dynamic Catalog', status: 'active', values: [2, 9.74, 19.47], thumb: null, resultType: 'offsite_conversion.fb_pixel_add_to_cart' },
  ],
  truncated: 0,
});

test('Ads level: a thumbnail (or a placeholder) before each ad, the result type under Results and Cost per result', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: block(adsValue('ad')), fmt: {} }));
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\/a1\.jpg"/);
  assert.equal((html.match(/data-row-thumb/g) ?? []).length, 2, 'one thumbnail cell per ad');
  assert.match(html, /aria-label="No image"/, 'the placeholder for the ad without one');
  assert.equal((html.match(/>Purchase</g) ?? []).length, 2, 'under Results and Cost per result');
  assert.equal((html.match(/>Add to cart \(pixel\)</g) ?? []).length, 2);
  assert.match(html, />Ad</, 'the name column says Ad');
});

test('Campaign level: no thumbnails, no result notes', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const v = adsValue();
  v.rows = v.rows.map(({ thumb: _t, resultType: _r, ...r }) => r) as any;
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: block(v), fmt: {} }));
  assert.doesNotMatch(html, /data-row-thumb/);
  assert.doesNotMatch(html, /cell-note/);
  assert.match(html, />Campaign</);
});

test('a table with thumbnails and links: the image, and the name links to the post', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const value = { type: 'table', columns: ['post', 'reach'], columnLabels: ['Post', 'Reach'], columnFormats: ['text', 'number'], rows: [['Spring launch', 1200], ['Behind the scenes', 800]], total_rows: 2, thumbs: ['https://cdn.example/p1.jpg', null], links: ['https://facebook.com/p1', null] };
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: block(value, 'top_posts'), fmt: {} }));
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\/p1\.jpg"/);
  assert.match(html, /<a[^>]*href="https:\/\/facebook\.com\/p1"[^>]*target="_blank"[^>]*rel="noreferrer"[^>]*>Spring launch<\/a>/);
  assert.doesNotMatch(html, /<a[^>]*>Behind the scenes<\/a>/, 'no link without one');
  assert.equal((html.match(/data-row-thumb/g) ?? []).length, 2);
});
