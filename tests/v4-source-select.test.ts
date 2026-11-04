// The source dropdown in Add metrics and widgets from another account (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §2).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/lib/i18n';
import type { RenderedBlock, ReportData } from '../src/lib/engine/types';

const sources = [
  { id: 7, slug: 'google_analytics_4', name: 'acmerunning.gr' },
  { id: 3, slug: 'facebook_ads', name: 'Acme Running – Ads' },
  { id: 9, slug: 'matomo', name: 'Acme Running Co' },
  { id: 4, slug: 'facebook', name: 'Acme Running' },
];

// the open list (each source once, icon and name, keyboard) is checked in tests/v4-source-browser.test.ts
test('SourceSelect: the current account on the button; closed, no options in the page; ads first, then social, then analytics', async () => {
  const { SourceSelect, sortSources } = await import('../src/components/source-select');
  const html = renderToStaticMarkup(createElement(SourceSelect, { sources, value: 3, onChange: () => {} }));
  const button = /<button[^>]*aria-haspopup="listbox"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(button, html);
  assert.match(button[1], /Meta Ads/);
  assert.match(button[1], /Acme Running – Ads/);
  assert.match(button[1], /<svg/, 'the platform icon');
  assert.match(html, /aria-expanded="false"/);
  // the drawer's metric list is the only list of options while the dropdown is closed
  assert.doesNotMatch(html, /role="option"/);
  // by kind (paid media, social, analytics…), then platform, then account name
  assert.deepEqual(sortSources(sources).map((s) => s.id), [3, 4, 7, 9]);
});

const kpi = (integrationId: number, slug: string, platform: string, key: string, label: string): RenderedBlock =>
  ({ id: `w-${key}`, integrationId, platform, slug, account_name: 'Acme', layout: { x: 0, y: 0, w: 3, h: 2 }, widget: { reference_key: `${slug}:${key}`, key, label, format: 'number', diff_type: 'positive', value: { type: 'number', value: 1200, comparison: null } } }) as any;

test('a widget from another account than its block shows that platform icon before its title; the block own widgets do not', async () => {
  const { ReportBody } = await import('../src/components/widgets');
  const data = {
    range: { start: '2026-10-01', end: '2026-10-31' },
    comparison: null,
    generated_at: '2026-11-01T00:00:00Z',
    sources: [],
    sections: [
      {
        id: 'b1',
        title: 'Meta Ads',
        source: { integrationId: 3, slug: 'facebook_ads', platform: 'Meta Ads', account_name: 'Acme Running – Ads' },
        blocks: [kpi(3, 'facebook_ads', 'Meta Ads', 'spend', 'Spend'), kpi(7, 'google_analytics_4', 'Google Analytics 4', 'sessions', 'Sessions')],
      },
    ],
  } as unknown as ReportData;
  const html = renderToStaticMarkup(createElement(ReportBody, { data, fmt: {} }));
  const marks = [...html.matchAll(/data-foreign-source="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(marks, ['google_analytics_4']);
  assert.match(html, /data-foreign-source="google_analytics_4"[^>]*aria-label="Google Analytics 4 · Acme"/);
  assert.match(html, /<\/span>Sessions</, 'the icon sits right before the title');
});
