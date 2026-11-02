// Google Ads connector (GAQL over REST) against a local mock. Never run against a live account.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { gadsBreakdownQuery, gadsConnector, gadsDailyQuery } from '../src/lib/connectors/gads';
import { endpoints } from '../src/lib/oauth/endpoints';

const saved = { ads: endpoints.google.ads, token: endpoints.google.token, dev: process.env.GOOGLE_ADS_DEVELOPER_TOKEN, id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
const calls: { path: string; headers: http.IncomingHttpHeaders; query: string; pageToken?: string }[] = [];
let server: http.Server;
const range = { start: '2026-10-01', end: '2026-10-03' };

before(async () => {
  server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const send = (s: number, b: unknown) => res.writeHead(s, { 'content-type': 'application/json' }).end(JSON.stringify(b));
    if (req.url === '/token') return send(200, { access_token: 'ya29.ads', expires_in: 3600 });
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ path: req.url!, headers: req.headers, query: body.query, pageToken: body.pageToken });
    if (req.url === '/ads/customers/1234567890/googleAds:search') {
      const q: string = body.query;
      if (q.includes('FROM customer LIMIT 1')) return send(200, { results: [{ customer: { descriptiveName: 'Acme Running Co', currencyCode: 'EUR' } }] });
      if (q.includes("campaign.status != 'REMOVED'"))
        return send(200, { results: [{ campaign: { id: '11', name: 'Brand', status: 'ENABLED', advertisingChannelType: 'SEARCH' } }, { campaign: { id: '12', name: 'PMax', status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' } }] });
      if (q.includes('segments.device'))
        return send(200, { results: [{ segments: { device: 'MOBILE' }, metrics: { clicks: '40' } }, { segments: { device: 'DESKTOP' }, metrics: { clicks: '25' } }, { segments: { device: 'MOBILE' }, metrics: { clicks: '5' } }] });
      if (q.includes('FROM campaign') && q.includes('campaign.name'))
        return send(200, { results: [{ campaign: { id: '11', name: 'Brand' }, metrics: { costMicros: '12500000', clicks: '10' } }, { campaign: { id: '12', name: 'PMax' }, metrics: { costMicros: '30000000', clicks: '4' } }] });
      if (q.includes('FROM ad_group_ad')) return send(200, { results: [{ adGroupAd: { ad: { id: '77' } }, metrics: { clicks: '3' } }] });
      if (q.includes('FROM campaign') && q.includes('segments.date')) {
        // campaign level: two campaigns on the same day are summed
        return send(200, { results: [{ segments: { date: '2026-10-01' }, metrics: { costMicros: '1000000', clicks: '2' } }, { segments: { date: '2026-10-01' }, metrics: { costMicros: '500000', clicks: '1' } }] });
      }
      // account-level daily, two pages
      if (!body.pageToken)
        return send(200, { results: [{ segments: { date: '2026-10-01' }, metrics: { impressions: '1000', clicks: '40', costMicros: '25370000', conversions: 2.5, conversionsValue: 120.4 } }], nextPageToken: 'p2' });
      return send(200, { results: [{ segments: { date: '2026-10-02' }, metrics: { impressions: '800', clicks: '30', costMicros: '19000000', conversions: 1, conversionsValue: 50 } }] });
    }
    if (req.url === '/ads/customers/2222222222/googleAds:search')
      return send(400, { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure', errors: [{ errorCode: { queryError: 'UNRECOGNIZED_FIELD' }, message: "Unrecognized field in the query: 'metrics.nope'." }] }] } });
    send(404, { error: { message: `no mock for ${req.url}` } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  endpoints.google.ads = `${base}/ads`;
  endpoints.google.token = `${base}/token`;
  Object.assign(process.env, { GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-123', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' });
});
after(() => {
  server.close();
  endpoints.google.ads = saved.ads;
  endpoints.google.token = saved.token;
  for (const [k, v] of [['GOOGLE_ADS_DEVELOPER_TOKEN', saved.dev], ['GOOGLE_CLIENT_ID', saved.id], ['GOOGLE_CLIENT_SECRET', saved.secret]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ctx = (sourceId = '123-456-7890', config: Record<string, any> = {}) => ({ integration: { id: 1, slug: 'google_adwords', name: 'G', sourceId, config, credentials: { refreshToken: 'rt-ads', oauth: 'google' } } });

test('GAQL: account level by default, campaign level under a scope, ids sanitised, dates validated', () => {
  assert.equal(gadsDailyQuery(['spend', 'clicks', 'reach'], range), "SELECT segments.date, metrics.cost_micros, metrics.clicks FROM customer WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-03'");
  assert.equal(gadsDailyQuery(['clicks'], range, ['11', '12; DROP', 'x']), "SELECT segments.date, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-03' AND campaign.id IN (11,12)");
  assert.match(gadsDailyQuery(['clicks'], range, []), /campaign\.id IN \(0\)/, 'an empty scope matches nothing instead of everything');
  assert.throws(() => gadsDailyQuery(['clicks'], { start: "2026-10-01' OR 1=1", end: '2026-10-03' }), /Bad date range/);
  assert.equal(gadsBreakdownQuery('country', ['clicks'], range), null, 'unsupported dimensions return nothing');
});

test('daily: developer token + manager header, cost micros in currency units, pages followed', async () => {
  const d = await gadsConnector.daily(ctx('123-456-7890', { loginCustomerId: '999-888-7777' }), ['spend', 'clicks', 'impressions', 'conversions', 'conversion_value'], range);
  assert.deepEqual(d, {
    '2026-10-01': { spend: 25.37, clicks: 40, impressions: 1000, conversions: 2.5, conversion_value: 120.4 },
    '2026-10-02': { spend: 19, clicks: 30, impressions: 800, conversions: 1, conversion_value: 50 },
  });
  const c = calls.filter((x) => x.path.includes('1234567890')).slice(-2);
  assert.equal(c[0].headers['developer-token'], 'dev-123');
  assert.equal(c[0].headers['login-customer-id'], '9998887777');
  assert.equal(c[0].headers.authorization, 'Bearer ya29.ads', 'access token from the stored refresh token');
  assert.equal(c[1].pageToken, 'p2');
});

test('daily under a campaign scope sums the campaigns per day; Meta-only slices return no data', async () => {
  assert.deepEqual(await gadsConnector.daily(ctx(), ['spend', 'clicks'], range, undefined, ['11', '12']), { '2026-10-01': { spend: 1.5, clicks: 3 } });
  const before = calls.length;
  assert.deepEqual(await gadsConnector.daily(ctx(), ['spend'], range, { dimension: 'publisher_platform', value: 'instagram' }), {});
  assert.equal(calls.length, before, 'no API call for a slice Google Ads does not have');
  assert.ok(gadsConnector.unsupported!.includes('reach'));
});

test('breakdowns: campaigns keyed by id and labelled by name, devices merged and named, ads fall back to their id', async () => {
  const camps = await gadsConnector.breakdown(ctx(), 'campaign', ['spend', 'clicks'], range, { sortBy: 'spend' });
  assert.deepEqual(camps, [
    { key: '12', label: 'PMax', values: { spend: 30, clicks: 4 } },
    { key: '11', label: 'Brand', values: { spend: 12.5, clicks: 10 } },
  ]);
  const dev = await gadsConnector.breakdown(ctx(), 'device', ['clicks'], range, { limit: 1 });
  assert.deepEqual(dev, [{ key: 'MOBILE', label: 'Mobile', values: { clicks: 45 } }]);
  assert.deepEqual(await gadsConnector.breakdown(ctx(), 'ad', ['clicks'], range), [{ key: '77', label: 'Ad 77', values: { clicks: 3 } }]);
  assert.deepEqual(await gadsConnector.breakdown(ctx(), 'country', ['clicks'], range), []);
});

test('campaign list, validation and readable errors', async () => {
  assert.deepEqual(await gadsConnector.listCampaigns!(ctx()), [
    { id: '11', name: 'Brand', status: 'active', objective: 'SEARCH' },
    { id: '12', name: 'PMax', status: 'paused', objective: 'PERFORMANCE_MAX' },
  ]);
  assert.deepEqual(await gadsConnector.validate!(ctx('1234567890', { loginCustomerId: '9998887777' })), { name: 'Acme Running Co', config: { loginCustomerId: '9998887777', currency: 'EUR' } });
  await assert.rejects(gadsConnector.daily(ctx('2222222222'), ['clicks'], range), /Unrecognized field in the query: 'metrics.nope'. \(UNRECOGNIZED_FIELD\)/);
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  try {
    await assert.rejects(gadsConnector.daily(ctx(), ['clicks'], range), /needs a developer token/);
  } finally {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-123';
  }
});
