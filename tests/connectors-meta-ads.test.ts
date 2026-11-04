// Meta Ads at ad and ad-set level (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1): rows keyed by
// id, the result type from the ad set's optimisation, creative thumbnails; lookups only for the rows kept, ≤ 50 ids a call.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import '../src/lib/i18n';
import { metaConnector } from '../src/lib/connectors/meta';
import { promotedObjectAction, resultLabel } from '../src/lib/connectors/meta-results';
import { endpoints } from '../src/lib/oauth/endpoints';
import { tFor } from '../src/lib/i18n';

const savedGraph = endpoints.meta.graph;
let server: http.Server;
const idsCalls: { ids: string[]; fields: string }[] = [];
let manyAds = 0; // > 0: the insights answer that many ads instead of the fixture
const range = { start: '2026-10-01', end: '2026-10-31' };
const ctx = { integration: { id: 1, slug: 'facebook_ads', name: 'Acme', sourceId: 'act_100200300400', config: {}, credentials: { accessToken: 'EAA-test' } } };

const row = (extra: Record<string, unknown>) => ({ impressions: '1000', reach: '600', clicks: '40', inline_link_clicks: '30', spend: '20', ...extra });
const ADS = [
  row({ ad_id: 'a1', ad_name: 'Blue Marathon', adset_id: 's1', actions: [{ action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '12' }, { action_type: 'link_click', value: '30' }] }),
  row({ ad_id: 'a2', ad_name: 'Proto Gamma', adset_id: 's1', actions: [{ action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '3' }] }),
  row({ ad_id: 'a3', ad_name: 'Dynamic Catalog', adset_id: 's2', spend: '19.47', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }] }),
  row({ ad_id: 'a4', ad_name: 'Orphan', adset_id: 's9', actions: [{ action_type: 'link_click', value: '5' }] }),
];
const ADSETS: Record<string, unknown> = {
  s1: { id: 's1', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: 'p', custom_event_type: 'ADD_TO_CART' } },
  s2: { id: 's2', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: 'p', custom_event_type: 'PURCHASE' } },
  // s9 is not readable: left out of the answer
};
const CREATIVES: Record<string, unknown> = {
  a1: { id: 'a1', creative: { id: 'c1', image_url: 'https://cdn.example/a1-full.jpg', thumbnail_url: 'https://cdn.example/a1-thumb.jpg' } },
  a2: { id: 'a2', creative: { id: 'c2', thumbnail_url: 'https://cdn.example/a2-thumb.jpg' } },
  a3: { id: 'a3', creative: { id: 'c3' } },
  // a4: no creative readable
};

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const send = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (u.pathname === '/' && u.searchParams.get('ids')) {
      const ids = u.searchParams.get('ids')!.split(',');
      const fields = u.searchParams.get('fields') ?? '';
      idsCalls.push({ ids, fields });
      const src = fields.startsWith('creative') ? CREATIVES : ADSETS;
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        if (manyAds && fields.startsWith('creative')) out[id] = { id, creative: { id: `c-${id}`, thumbnail_url: `https://cdn.example/${id}.jpg` } };
        else if (manyAds) out[id] = ADSETS.s1;
        else if (src[id]) out[id] = src[id];
      }
      return send(out);
    }
    const level = u.searchParams.get('level');
    if (level === 'ad') {
      if (manyAds) return send({ data: Array.from({ length: manyAds }, (_, i) => row({ ad_id: `m${i}`, ad_name: `Ad ${i}`, adset_id: 's1', spend: String(1000 - i) })) });
      return send({ data: ADS });
    }
    if (level === 'adset') return send({ data: [row({ adset_id: 's1', adset_name: 'Cart builders', actions: [{ action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '15' }] })] });
    if (level === 'campaign') return send({ data: [row({ campaign_id: '11', campaign_name: 'Brand' })] });
    return send({ data: [] });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoints.meta.graph = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  endpoints.meta.graph = savedGraph;
});

test('promotedObjectAction: the ad set optimisation becomes the action type that counts as a result', () => {
  assert.equal(promotedObjectAction('OFFSITE_CONVERSIONS', { custom_event_type: 'ADD_TO_CART' }), 'offsite_conversion.fb_pixel_add_to_cart');
  assert.equal(promotedObjectAction('OFFSITE_CONVERSIONS', { custom_event_type: 'PURCHASE' }), 'offsite_conversion.fb_pixel_purchase');
  assert.equal(promotedObjectAction('OFFSITE_CONVERSIONS', { custom_event_type: 'CONTENT_VIEW' }), 'offsite_conversion.fb_pixel_view_content');
  assert.equal(promotedObjectAction('OFFSITE_CONVERSIONS', { custom_event_type: 'OTHER' }), 'offsite_conversion.fb_pixel_custom');
  assert.equal(promotedObjectAction('OFFSITE_CONVERSIONS', { custom_conversion_id: '987' }), 'offsite_conversion.custom.987');
  assert.equal(promotedObjectAction('LINK_CLICKS'), 'link_click');
  assert.equal(promotedObjectAction('LANDING_PAGE_VIEWS'), 'landing_page_view');
  assert.equal(promotedObjectAction('LEAD_GENERATION'), 'lead');
  assert.equal(promotedObjectAction('CONVERSATIONS'), 'onsite_conversion.messaging_conversation_started_7d');
  assert.equal(promotedObjectAction('THRUPLAY'), 'video_thruplay_watched');
  assert.equal(promotedObjectAction('REACH'), null);
  assert.equal(promotedObjectAction(undefined), null);
});

test('resultLabel: plain words for the common types, humanised otherwise, a dash for none', () => {
  const en = tFor('en');
  assert.equal(resultLabel('offsite_conversion.fb_pixel_purchase', en), 'Purchase');
  assert.equal(resultLabel('offsite_conversion.fb_pixel_add_to_cart', en), 'Add to cart (pixel)');
  assert.match(resultLabel('offsite_conversion.fb_pixel_purchase', tFor('el')), /Αγορά/);
  assert.equal(resultLabel('offsite_conversion.fb_pixel_custom', en), 'Fb pixel custom');
  assert.equal(resultLabel(null, en), '–');
});

test('ads level: rows keyed by ad id, results of the ad set event, thumbnails from image_url then thumbnail_url', async () => {
  idsCalls.length = 0;
  const rows = await metaConnector.breakdown(ctx, 'ad', ['spend', 'results'], range);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(by).sort(), ['a1', 'a2', 'a3', 'a4']);
  assert.equal(by.a1.label, 'Blue Marathon');
  assert.equal(by.a1.resultType, 'offsite_conversion.fb_pixel_add_to_cart');
  assert.equal(by.a1.values.results, 12);
  assert.equal(by.a3.resultType, 'offsite_conversion.fb_pixel_purchase');
  assert.equal(by.a3.values.results, 2);
  assert.equal(by.a1.thumb, 'https://cdn.example/a1-full.jpg');
  assert.equal(by.a2.thumb, 'https://cdn.example/a2-thumb.jpg');
  assert.equal(by.a3.thumb, null);
});

test('missing ad set and creative: that row has no type, no results and no thumbnail; the others are filled', async () => {
  const rows = await metaConnector.breakdown(ctx, 'ad', ['spend', 'results'], range);
  const a4 = rows.find((r) => r.key === 'a4')!;
  assert.equal(a4.resultType, null);
  assert.equal(a4.values.results, 0);
  assert.equal(a4.thumb, null);
  assert.equal(rows.find((r) => r.key === 'a1')!.values.results, 12);
});

test('ad sets level: keyed by ad set id with its own result type; no thumbnails asked', async () => {
  idsCalls.length = 0;
  const rows = await metaConnector.breakdown(ctx, 'adset', ['spend', 'results'], range);
  assert.equal(rows[0].key, 's1');
  assert.equal(rows[0].label, 'Cart builders');
  assert.equal(rows[0].resultType, 'offsite_conversion.fb_pixel_add_to_cart');
  assert.equal(rows[0].values.results, 15);
  assert.ok(idsCalls.every((c) => !c.fields.startsWith('creative')), 'no creative lookups for ad sets');
});

test('batches ids: lookups only for the rows kept, at most 50 ids a call', async () => {
  idsCalls.length = 0;
  manyAds = 120;
  try {
    const rows = await metaConnector.breakdown(ctx, 'ad', ['spend', 'results'], range, { limit: 60 });
    assert.equal(rows.length, 60);
    const creative = idsCalls.filter((c) => c.fields.startsWith('creative'));
    assert.equal(creative.reduce((n, c) => n + c.ids.length, 0), 60);
    assert.ok(creative.every((c) => c.ids.length <= 50));
    assert.equal(creative.length, 2);
  } finally {
    manyAds = 0;
  }
});

test('campaign level is unchanged: no id lookups', async () => {
  idsCalls.length = 0;
  const rows = await metaConnector.breakdown(ctx, 'campaign', ['spend'], range);
  assert.equal(rows[0].key, '11');
  assert.equal(idsCalls.length, 0);
});
