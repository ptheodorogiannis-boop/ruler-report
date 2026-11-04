import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTokens, parseToken, tokenRefs } from '../src/lib/layout/tokens';
import { composeReport, normalizeLayout, storeKey } from '../src/lib/layout/compose';
import type { RenderedBlock } from '../src/lib/engine/types';

const num = (integrationId: number, key: string, value: number, prev: number, format: 'currency' | 'percent' | 'number' = 'currency'): RenderedBlock => ({
  integrationId,
  platform: 'Meta Ads',
  slug: 'facebook_ads',
  account_name: 'Acme',
  widget: { reference_key: `fb_ads:${key}`, key, label: key, format, diff_type: 'positive_good', currency: 'EUR', value: { type: 'number', value, comparison: { value: prev, change_pct: null, absolute: null } } },
});

test('text variables: names and dates, metrics like formulas, unknown tokens stay as typed', () => {
  assert.equal(parseToken('client'), 'client');
  assert.deepEqual(parseToken('fb_ads:spend.change'), { prefix: 'fb_ads', key: 'spend', part: 'change' });
  assert.deepEqual(parseToken('12:spend'), { prefix: '12', key: 'spend', part: 'value' });
  assert.equal(parseToken('not a token'), null);
  assert.deepEqual(tokenRefs('{fb_ads:spend} and {fb_ads:spend} and {fb_ads:spend.previous} and {client}'), [
    { prefix: 'fb_ads', key: 'spend', part: 'value' },
    { prefix: 'fb_ads', key: 'spend', part: 'previous' },
  ]);
  assert.equal(applyTokens('Hi {client}, {unknown_var} {x:y}', (t) => (t === 'client' ? '<Acme & Co>' : null)), 'Hi &lt;Acme &amp; Co&gt;, {unknown_var} {x:y}', 'values are escaped; unknown ones stay');
});

test('text card: variables are filled from the report, summed over a platform like formulas, rates never summed', () => {
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const comparison = { start: '2026-08-02', end: '2026-08-31' };
  const html = '<p>{client}: {report}, {period} (vs {comparison}). Spend {fb_ads:spend}, {fb_ads:spend.change} from {fb_ads:spend.previous}. CTR {fb_ads:ctr}. One account {8:spend}. {gads:cost} stays.</p>';
  const layout = normalizeLayout({ version: 1, blocks: [{ id: 'b', title: 'Notes', integrationId: 0, slug: 'custom', widgets: [{ id: 't', slug: 'analysis', key: 'text', component: 'analysis_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 3, custom: { html } }] }] });
  const data = {
    range,
    comparison,
    generated_at: '',
    sources: [],
    sections: [],
    widgets: {
      [storeKey(7, 'spend')]: num(7, 'spend', 1000, 800),
      [storeKey(8, 'spend')]: num(8, 'spend', 500, 400),
      [storeKey(7, 'ctr')]: num(7, 'ctr', 2.5, 2, 'percent'),
      [storeKey(8, 'ctr')]: num(8, 'ctr', 1.5, 1, 'percent'),
    },
  } as any;
  const sources = [
    { id: 7, slug: 'facebook_ads', name: 'Acme' },
    { id: 8, slug: 'facebook_ads', name: 'Acme EU' },
  ];
  const out = composeReport(data, layout, { sources, currency: 'EUR', range, comparison, names: { client: 'Peak Fitness', report: 'September' } });
  const v = out.sections[0].blocks[0].widget.value;
  assert.equal(v.type, 'text');
  if (v.type !== 'text') return;
  assert.match(v.html, /Peak Fitness: September, 01\/09\/2026 – 30\/09\/2026 \(vs 02\/08\/2026 – 31\/08\/2026\)/);
  assert.match(v.html, /Spend €1,500, \+25\.0% from €1,200\./, 'two Meta accounts added up, change against the comparison');
  assert.match(v.html, /CTR 2\.50%\./, 'a rate is read from the first account, never summed');
  assert.match(v.html, /One account €500\./);
  assert.match(v.html, /\{gads:cost\} stays\./, 'no Google Ads account: the token stays as typed');
});
