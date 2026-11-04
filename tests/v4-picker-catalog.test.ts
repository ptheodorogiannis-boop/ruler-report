import assert from 'node:assert/strict';
import test from 'node:test';
import { api, makeCompany } from './helpers';

// What the editor offers (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §3): the "… on Facebook /
// Instagram" variants only where they load (Meta Ads), groups in a fixed order, nothing a connector cannot provide.

const VARIANT = /_(facebook|instagram|messenger|audience_network)$/;

test('platform variants exist on Meta Ads only', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  assert.ok(getCatalog('facebook_ads').some((w) => w.key === 'reach_facebook'));
  for (const slug of ['google_adwords', 'tiktok_ads', 'linkedin_ads']) assert.equal(getCatalog(slug).filter((w) => VARIANT.test(w.key)).length, 0, slug);
  assert.equal(getCatalog('google_adwords').length, 38);
  assert.equal(getCatalog('facebook_ads').length, 66);
});

test('group ids', async () => {
  const { groupId } = await import('../src/lib/catalog/groups');
  assert.equal(groupId('By platform'), 'by_platform');
  assert.equal(groupId('E-commerce'), 'e_commerce');
  assert.equal(groupId('Charts'), 'charts');
});

test('pickable metrics follow the fixed group order', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { GROUP_ORDER, groupId } = await import('../src/lib/catalog/groups');
  const { pickableMetrics } = await import('../src/lib/catalog/pickable');
  for (const [slug, arch] of [['facebook_ads', 'ads'], ['google_analytics_4', 'web'], ['instagram_business', 'social']] as const) {
    const seq = [...new Set(pickableMetrics(slug, getCatalog(slug)).map((w) => groupId(w.group ?? 'Other')))];
    assert.deepEqual(seq, GROUP_ORDER[arch].filter((g) => seq.includes(g)), slug);
    assert.equal(seq.length, new Set(seq).size);
  }
});

test('metrics a connector cannot provide are not offered, but stay in the catalog', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { pickableMetrics } = await import('../src/lib/catalog/pickable');
  const { metricNames } = await import('../src/lib/catalog/build');
  const uses = (slug: string, prim: string, list: ReturnType<typeof getCatalog>) => list.filter((w) => metricNames(w.calc).includes(prim)).map((w) => `${slug}:${w.key}`);
  assert.ok(uses('facebook', 'link_clicks', getCatalog('facebook')).length > 0, 'the catalog has it');
  assert.deepEqual(uses('facebook', 'link_clicks', pickableMetrics('facebook', getCatalog('facebook'))), []);
  for (const prim of ['unfollows', 'video_views']) {
    assert.ok(uses('ig', prim, getCatalog('instagram_business')).length > 0, prim);
    assert.deepEqual(uses('ig', prim, pickableMetrics('instagram_business', getCatalog('instagram_business'))), [], prim);
  }
});

test('the API answers as before without pickable=1', async () => {
  const { token } = await makeCompany('Picker Co');
  const all = await api(token, 'GET', '/metrics?integration_slug=instagram_business&per_page=100');
  const pick = await api(token, 'GET', '/metrics?integration_slug=instagram_business&per_page=100&pickable=1');
  assert.equal(all.status, 200);
  assert.ok(all.json.data.some((d: any) => d.metrics.includes('unfollows')));
  assert.ok(!pick.json.data.some((d: any) => d.metrics.includes('unfollows')));
  assert.ok(pick.json.data.length < all.json.data.length);
});

test('templates only use widgets their platform has', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { PLATFORM_TEMPLATES } = await import('../src/lib/templates/defaults');
  const missing: string[] = [];
  for (const t of PLATFORM_TEMPLATES) for (const s of t.sections) for (const w of s.widgets) if (!getCatalog(w.slug).some((c) => c.key === w.key)) missing.push(`${t.title}/${w.slug}:${w.key}`);
  assert.deepEqual(missing.filter((m) => VARIANT.test(m)), []);
});
