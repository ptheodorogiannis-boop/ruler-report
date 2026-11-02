// Meta Ads connector against a local mock Graph API. Regression: Graph API v26 rejects a trailing comma in `fields`
// ("Syntax error \"Expected name.\" at character 72"), which the daily and totals calls used to send.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { metaConnector, metaInsightsFields } from '../src/lib/connectors/meta';
import { endpoints } from '../src/lib/oauth/endpoints';

const savedGraph = endpoints.meta.graph;
const seen: URLSearchParams[] = [];
let server: http.Server;
const range = { start: '2026-10-01', end: '2026-10-02' };
const ctx = { integration: { id: 1, slug: 'facebook_ads', name: 'Acme', sourceId: 'act_100200300400', config: {}, credentials: { accessToken: 'EAA-test' } } };

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    seen.push(u.searchParams);
    const fields = u.searchParams.get('fields') ?? '';
    // behave like Graph v26: an empty name in the list is a syntax error
    if (fields.split(',').some((f) => !f.trim()))
      return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: `Syntax error "Expected name." at character ${fields.length}: ${fields}`, type: 'OAuthException', code: 2500 } }));
    const level = u.searchParams.get('level');
    const row = (extra: Record<string, unknown>) => ({ impressions: '1000', reach: '600', clicks: '40', inline_link_clicks: '30', spend: '25.50', actions: [{ action_type: 'omni_purchase', value: '2' }], action_values: [{ action_type: 'omni_purchase', value: '120' }], ...extra });
    const data =
      level === 'campaign'
        ? [row({ campaign_id: '11', campaign_name: 'Brand' })]
        : u.searchParams.get('time_increment')
          ? [row({ date_start: '2026-10-01' }), row({ date_start: '2026-10-02' })]
          : [row({})];
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoints.meta.graph = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  endpoints.meta.graph = savedGraph;
});

test('insights fields never end with a comma, with or without breakdown fields', () => {
  assert.equal(metaInsightsFields(), 'impressions,reach,clicks,inline_link_clicks,spend,actions,action_values');
  assert.equal(metaInsightsFields(''), 'impressions,reach,clicks,inline_link_clicks,spend,actions,action_values');
  assert.equal(metaInsightsFields('campaign_name,campaign_id'), 'impressions,reach,clicks,inline_link_clicks,spend,actions,action_values,campaign_name,campaign_id');
});

test('daily, totals and campaign breakdown reach the Graph API with a valid field list', async () => {
  const daily = await metaConnector.daily(ctx, ['spend', 'clicks', 'purchases'], range);
  assert.deepEqual(daily, { '2026-10-01': { spend: 25.5, clicks: 40, purchases: 2 }, '2026-10-02': { spend: 25.5, clicks: 40, purchases: 2 } });
  const totals = await metaConnector.totals!(ctx, ['reach', 'conversion_value'], range);
  assert.deepEqual(totals, { reach: 600, conversion_value: 120 });
  const camps = await metaConnector.breakdown(ctx, 'campaign', ['spend'], range);
  assert.deepEqual(camps, [{ key: '11', label: 'Brand', values: { spend: 25.5 } }]);
  for (const q of seen) {
    assert.ok(!/,$|,,/.test(q.get('fields')!), `clean fields: ${q.get('fields')}`);
    assert.equal(q.get('extraFields'), null, 'the helper parameter is not sent');
  }
});
