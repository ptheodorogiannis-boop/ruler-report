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
const idsCalls: { ids: string[]; fields: string; width?: string | null }[] = [];
const oneCalls: string[] = [];
let sizedFails = false; // Meta refuses the creatives call that asks for a sized thumbnail
let withGone = false; // an ad whose ad set was deleted: Graph refuses a whole ?ids= call that names it
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
/** the creatives themselves, read with thumbnail_width / thumbnail_height (Meta sizes the thumbnail to them) */
const CREATIVE_NODES: Record<string, { image_url?: string; thumbnail_url?: string }> = {
  c1: { image_url: 'https://cdn.example/a1-full.jpg', thumbnail_url: 'https://cdn.example/a1-thumb.jpg' },
  c2: { thumbnail_url: 'https://cdn.example/a2-thumb.jpg' },
  c3: { image_url: 'https://cdn.example/a3-full.jpg' },
};
const sized = (u: string | undefined, w: string | null) => (u && u.includes('-thumb') && w ? `${u}?w=${w}` : u);

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const send = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    const fail = () => res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: '(#100) Some of the aliases you requested do not exist: gone', code: 100 } }));
    const width = u.searchParams.get('thumbnail_width');
    const node = (id: string, fields: string): unknown => {
      // the one-call form: an ad's creative with its images expanded
      if (fields.startsWith('creative{')) {
        const a = CREATIVES[id] as { creative?: { id: string } } | undefined;
        const c = a?.creative ? CREATIVE_NODES[a.creative.id] : undefined;
        return a && { id, creative: { id: a.creative?.id, ...(c ?? {}) } };
      }
      if (fields.startsWith('creative')) return manyAds ? { id, creative: { id: `c-${id}` } } : CREATIVES[id];
      if (fields.includes('thumbnail_url')) {
        const c = manyAds ? { thumbnail_url: `https://cdn.example/${id}-thumb.jpg` } : CREATIVE_NODES[id];
        return c && { id, image_url: c.image_url, thumbnail_url: sized(c.thumbnail_url, width) };
      }
      return manyAds ? ADSETS.s1 : ADSETS[id];
    };
    if (u.pathname === '/' && u.searchParams.get('ids')) {
      const ids = u.searchParams.get('ids')!.split(',');
      const fields = u.searchParams.get('fields') ?? '';
      idsCalls.push({ ids, fields, width });
      if (ids.includes('gone')) return fail();
      if (sizedFails && width) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: '(#100) Param thumbnail_width is not supported here', code: 100 } }));
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        const n = node(id, fields);
        if (n) out[id] = n;
      }
      return send(out);
    }
    const one = /^\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
    if (one && u.searchParams.get('fields') && !u.searchParams.get('level')) {
      oneCalls.push(one[1]);
      const n = one[1] === 'gone' || (sizedFails && width) ? null : node(one[1], u.searchParams.get('fields')!);
      return n ? send(n) : fail();
    }
    const level = u.searchParams.get('level');
    if (level === 'ad') {
      if (manyAds) return send({ data: Array.from({ length: manyAds }, (_, i) => row({ ad_id: `m${i}`, ad_name: `Ad ${i}`, adset_id: 's1', spend: String(1000 - i) })) });
      return send({ data: withGone ? [...ADS, row({ ad_id: 'a5', ad_name: 'Old ad', adset_id: 'gone', actions: [{ action_type: 'link_click', value: '9' }] })] : ADS });
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

test('ads level: rows keyed by ad id, results of the ad set event, a 240 px thumbnail else the image', async () => {
  idsCalls.length = 0;
  const rows = await metaConnector.breakdown(ctx, 'ad', ['spend', 'results'], range);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(by).sort(), ['a1', 'a2', 'a3', 'a4']);
  assert.equal(by.a1.label, 'Blue Marathon');
  assert.equal(by.a1.resultType, 'offsite_conversion.fb_pixel_add_to_cart');
  assert.equal(by.a1.values.results, 12);
  assert.equal(by.a3.resultType, 'offsite_conversion.fb_pixel_purchase');
  assert.equal(by.a3.values.results, 2);
  // a small image for a 48 px cell (the full creative is often over the 300 KB a snapshot keeps)
  assert.equal(by.a1.thumb, 'https://cdn.example/a1-thumb.jpg?w=240');
  assert.equal(by.a2.thumb, 'https://cdn.example/a2-thumb.jpg?w=240');
  assert.equal(by.a3.thumb, 'https://cdn.example/a3-full.jpg', 'no thumbnail: the image');
  const nodes = idsCalls.filter((c) => c.fields.startsWith('thumbnail_url'));
  assert.ok(nodes.length > 0 && nodes.every((c) => c.width === '240'), 'creatives asked with thumbnail_width=240');
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

test('one deleted ad set: Graph refuses the whole batch, the other ids are asked one by one and keep their result type', async () => {
  withGone = true;
  oneCalls.length = 0;
  try {
    const rows = await metaConnector.breakdown(ctx, 'ad', ['spend', 'results'], range);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.a1.resultType, 'offsite_conversion.fb_pixel_add_to_cart');
    assert.equal(by.a1.values.results, 12);
    assert.equal(by.a3.resultType, 'offsite_conversion.fb_pixel_purchase');
    assert.equal(by.a5.resultType, null, 'the deleted one has none');
    assert.ok(oneCalls.includes('s1') && oneCalls.includes('gone'));
  } finally {
    withGone = false;
  }
});

test('when Meta refuses the sized thumbnail call, the images come from the one-call form, and the reason is logged without the token', async () => {
  sizedFails = true;
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => void warned.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try {
    const rows = await metaConnector.breakdown(ctx, 'ad', ['spend'], range);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.a1.thumb, 'https://cdn.example/a1-thumb.jpg', 'the default thumbnail of the one-call form');
    assert.equal(by.a2.thumb, 'https://cdn.example/a2-thumb.jpg');
    assert.equal(by.a3.thumb, 'https://cdn.example/a3-full.jpg');
    assert.equal(by.a4.thumb, null);
    assert.ok(warned.some((w) => /thumbnail_width is not supported/.test(w)), warned.join(' | '));
    assert.ok(warned.every((w) => !/EAA-test|access_token/.test(w)), 'never the token');
  } finally {
    console.warn = warn;
    sizedFails = false;
  }
});
