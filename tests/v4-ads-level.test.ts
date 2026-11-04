// Campaign table levels (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1): Campaigns / Ad sets / Ads,
// rows carry the thumbnail and the result type; Results and Cost per result exist for Meta Ads, in the campaign table only.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BreakdownRow } from '../src/lib/engine/types';

const ctx = { id: 7, slug: 'facebook_ads', name: 'Acme', sourceId: 'act_1', config: {}, credentials: { demo: true } } as any;
const range = { start: '2026-10-01', end: '2026-10-31' };

function fakeSession(rows: BreakdownRow[]) {
  const calls: { dimension: string; ids?: string[] }[] = [];
  const session = { getBreakdown: async (_c: unknown, dimension: string, _p: string[], _r: unknown, _s: string, ids?: string[]) => (calls.push({ dimension, ids }), rows) } as any;
  return { session, calls };
}

test('containerFromRows keeps the thumbnail and the result type of each row', async () => {
  const { containerFromRows } = await import('../src/lib/layout/container');
  const rows: BreakdownRow[] = [
    { key: 'a1', label: 'Blue Marathon', values: { spend: 98.66 }, thumb: 'https://cdn.example/a1.jpg', resultType: 'offsite_conversion.fb_pixel_purchase' },
    { key: 'a2', label: 'Dynamic Catalog', values: { spend: 19.47 }, thumb: null, resultType: null },
  ];
  const v = containerFromRows(rows, null, [{ key: 'spend', label: 'Spend', format: 'currency' }], {}, []);
  assert.equal(v.rows[0].thumb, 'https://cdn.example/a1.jpg');
  assert.equal(v.rows[0].resultType, 'offsite_conversion.fb_pixel_purchase');
  assert.equal(v.rows[1].thumb, null);
});

test('Ads level: the session is asked for ads with the campaign scope; rows are not dropped for not being campaign ids', async () => {
  const { resolveContainer } = await import('../src/lib/layout/container');
  const { session, calls } = fakeSession([{ key: 'a1', label: 'Blue Marathon', values: { spend: 10, clicks: 5 }, thumb: 'https://cdn.example/a1.jpg' }]);
  const w = { id: 'w', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 7, x: 0, y: 0, w: 12, h: 6, custom: { level: 'ad', metrics: ['spend'] } } as any;
  const v = (await resolveContainer(ctx, w, range, null, session, [{ id: '11', name: 'Brand', status: 'active' }], ['11'])) as any;
  assert.equal(calls[0].dimension, 'ad');
  assert.deepEqual(calls[0].ids, ['11']);
  assert.equal(v.type, 'container');
  assert.equal(v.level, 'ad');
  assert.equal(v.rows.length, 1);
  assert.equal(v.rows[0].thumb, 'https://cdn.example/a1.jpg');
});

test('no level: campaigns, as before', async () => {
  const { resolveContainer } = await import('../src/lib/layout/container');
  const { session, calls } = fakeSession([{ key: '11', label: 'Brand', values: { spend: 10 } }]);
  const w = { id: 'w', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 7, x: 0, y: 0, w: 12, h: 6, custom: { metrics: ['spend'] } } as any;
  const v = (await resolveContainer(ctx, w, range, null, session, [{ id: '11', name: 'Brand', status: 'active' }], ['11'])) as any;
  assert.equal(calls[0].dimension, 'campaign');
  assert.equal(v.level ?? 'campaign', 'campaign');
});

test('changing the level changes the stored value key (so the rows are fetched again)', async () => {
  const { valueKey } = await import('../src/lib/layout/compose');
  const base = { slug: 'container', key: 'campaigns', integrationId: 7 };
  const a = valueKey({ ...base, custom: { metrics: ['spend'] } } as any);
  const b = valueKey({ ...base, custom: { metrics: ['spend'], level: 'ad' } } as any);
  const c = valueKey({ ...base, custom: { metrics: ['spend'], level: 'campaign' } } as any);
  assert.notEqual(a, b);
  assert.equal(a, c, 'campaign is the default');
});

test('Results and Cost per result: Meta Ads only, campaign table only', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { pickableMetrics } = await import('../src/lib/catalog/pickable');
  const meta = getCatalog('facebook_ads');
  const results = meta.find((w) => w.key === 'results');
  const cpr = meta.find((w) => w.key === 'cost_per_result');
  assert.ok(results?.containerOnly && cpr?.containerOnly);
  assert.equal(cpr!.diff, 'positive_bad');
  assert.equal(cpr!.format, 'currency');
  assert.equal(getCatalog('google_adwords').some((w) => w.key === 'results'), false);
  assert.equal(pickableMetrics('facebook_ads', meta).some((w) => w.key === 'results' || w.key === 'cost_per_result'), false);
});

test('a container-only metric outside the campaign table is an error, not a number', async () => {
  const { resolveWidget } = await import('../src/lib/engine/resolve');
  const { getCatalog } = await import('../src/lib/catalog/build');
  const widget = getCatalog('facebook_ads').find((w) => w.key === 'results')!;
  const v = await resolveWidget({ integration: ctx, widget, range, comparison: null, session: {} as any } as any);
  assert.deepEqual(v, { type: 'error', code: 'invalid_metrics_combination', message: 'Only in the campaign table (Ads or Ad sets level).' });
});

test('the level setting is checked', async () => {
  const { customSchema } = await import('../src/lib/layout/compose');
  assert.equal(customSchema.safeParse({ level: 'ad' }).success, true);
  assert.equal(customSchema.safeParse({ level: 'keyword' }).success, false);
});
