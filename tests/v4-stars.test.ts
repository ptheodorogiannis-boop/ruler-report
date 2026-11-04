import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/lib/i18n';
import type { RenderedBlock } from '../src/lib/engine/types';

// Starred table rows (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §5): kept by row name on the widget,
// tinted on every page; the star button itself only exists in the editor.

const table = (rows: string[], starredRows?: string[]): RenderedBlock =>
  ({
    integrationId: 1,
    platform: 'Meta Ads',
    slug: 'facebook_ads',
    account_name: 'Acme',
    custom: starredRows ? { starredRows } : undefined,
    widget: { reference_key: 'fb_ads:ads', key: 'ads', label: 'Ads', format: 'number', diff_type: 'positive_good', value: { type: 'table', columns: ['ad', 'spend'], columnLabels: ['Ad', 'Spend'], columnFormats: ['text', 'number'], rows: rows.map((r, i) => [r, (i + 1) * 10]), total_rows: rows.length } },
  }) as any;
const container = (names: string[], starredRows?: string[]): RenderedBlock =>
  ({
    integrationId: 1,
    platform: 'Meta Ads',
    slug: 'facebook_ads',
    account_name: 'Acme',
    custom: starredRows ? { starredRows } : undefined,
    widget: { reference_key: 'fb_ads:campaigns', key: 'campaigns', label: 'Campaigns', format: 'number', diff_type: 'positive_good', value: { type: 'container', metrics: [{ key: 'spend', label: 'Spend', format: 'number' }], rows: names.map((n, i) => ({ id: String(i), name: n, status: 'active', values: [i] })), truncated: 0 } },
  }) as any;
const starredCount = (html: string) => (html.match(/data-starred/g) ?? []).length;

test('a starred row is marked on the page, without a star button outside the editor', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: table(['Ad 1', 'Ad 2', 'Ad 3'], ['Ad 2']), fmt: {} }));
  assert.equal(starredCount(html), 1);
  assert.match(html, /<tr[^>]*class="[^"]*row-starred[^"]*"[^>]*data-starred[^>]*>(?:(?!<\/tr>).)*Ad 2/);
  assert.doesNotMatch(html, /aria-pressed/);
});

test('duplicate names: one stored name tints every row with it', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: table(['Ad 1', 'Ad 1', 'Ad 2'], ['Ad 1']), fmt: {} }));
  assert.equal(starredCount(html), 2);
});

test('the editor gets a star button per row, pressed on the starred one', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: table(['Ad 1', 'Ad 2'], ['Ad 2']), fmt: {}, onStarRow: () => {} }));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 1);
});

test('campaign tables star by campaign name too', async () => {
  const { WidgetCard } = await import('../src/components/widgets');
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: container(['Campaign 1', 'Campaign 2'], ['Campaign 2']), fmt: {} }));
  assert.equal(starredCount(html), 1);
  assert.match(html, /data-starred(?:(?!<\/tr>).)*Campaign 2/);
});

test('the stored list is capped at 100 names', async () => {
  const { customSchema } = await import('../src/lib/layout/compose');
  assert.equal(customSchema.safeParse({ starredRows: ['Ad 1'] }).success, true);
  assert.equal(customSchema.safeParse({ starredRows: Array.from({ length: 101 }, (_, i) => `Ad ${i}`) }).success, false);
});
