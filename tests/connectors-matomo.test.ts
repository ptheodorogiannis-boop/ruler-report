// Matomo connector (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3) against a stand-in Matomo: the
// token travels in the body, never the URL; visits per day, channels, countries, page titles, goals, errors.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import '../src/lib/i18n';

let server: http.Server;
let base = '';
const urls: string[] = [];
const bodies: URLSearchParams[] = [];

const DAY = (visits: number) => ({ nb_visits: visits, nb_uniq_visitors: String(visits - 2), bounce_count: 4, sum_visit_length: visits * 60, nb_pageviews: visits * 2 });
function answer(q: URLSearchParams): unknown {
  if (q.get('token_auth') === 'bad') return { result: 'error', message: 'token_auth is not valid' };
  const m = q.get('method');
  const day = q.get('period') === 'day';
  switch (m) {
    case 'SitesManager.getSitesWithAtLeastViewAccess':
      return [
        { idsite: '1', name: 'Mina Kaouni & Associates', main_url: 'https://mcaounilaw.gr', currency: 'EUR', timezone: 'Europe/Athens' },
        { idsite: '2', name: 'Peak Fitness', main_url: 'https://peak.example', currency: 'EUR', timezone: 'UTC' },
      ];
    case 'SitesManager.getSiteFromId':
      return { idsite: q.get('idSite'), name: 'Mina Kaouni & Associates', currency: 'EUR', timezone: 'Europe/Athens' };
    case 'Goals.getGoals':
      return [{ idgoal: '1', name: 'Lead form' }, { idgoal: '3', name: 'ClickToPhone' }];
    case 'VisitsSummary.get':
      return day ? { '2026-10-01': DAY(10), '2026-10-02': [], '2026-10-03': DAY(20) } : { nb_visits: 30, nb_uniq_visitors: 25 };
    case 'Actions.get':
      return day ? { '2026-10-01': { nb_pageviews: 21 }, '2026-10-02': [], '2026-10-03': { nb_pageviews: '41' } } : { nb_pageviews: 62 };
    case 'Goals.get': {
      const g = q.get('idGoal');
      if (day) return { '2026-10-01': { nb_conversions: g === '1' ? 2 : 3, revenue: '0' }, '2026-10-02': [], '2026-10-03': { nb_conversions: g === '1' ? '1' : 4, revenue: 12.5 } };
      return { nb_conversions: g === '1' ? 3 : g === '3' ? 4 : 7, revenue: g === '1' ? 0 : 12.5, conversion_rate: g === '3' ? '3.2%' : '-' };
    }
    case 'Referrers.getReferrerType':
      return [{ label: 'Search Engines', nb_visits: 20, nb_uniq_visitors: 15, nb_conversions: 2, revenue: 0 }, { label: 'Direct Entry', nb_visits: '10', nb_uniq_visitors: 9 }];
    case 'UserCountry.getCountry':
      // as Matomo answers over a range: unique visitors only as the sum of daily ones (range processing is off by default)
      return [{ label: 'Greece', code: 'gr', nb_visits: 30, sum_daily_nb_uniq_visitors: 25, nb_conversions: 3, revenue: 12.5 }];
    case 'Actions.getPageTitles':
      // page reports have hits, visits and entry columns, but no conversions, revenue or bounces of their own
      return [{ label: ' Home', nb_hits: 50, nb_visits: 40, sum_daily_nb_uniq_visitors: 33, entry_nb_visits: 20, entry_bounce_count: 8 }, { label: 'Contact - Mina Kaouni', nb_hits: '12', nb_visits: 9, sum_daily_nb_uniq_visitors: 8 }];
    case 'Actions.getEntryPageUrls':
      return [{ label: '/offer', nb_visits: 70, nb_hits: 90, entry_nb_visits: 30, entry_bounce_count: 12, entry_nb_actions: 75, sum_daily_entry_nb_uniq_visitors: 27, goals: { 'idgoal=1': { nb_conversions: 9, nb_conversions_entry: 4, revenue: 0, revenue_entry: 0 }, 'idgoal=ecommerceOrder': { nb_conversions: 3, nb_conversions_entry: 2, revenue: 150, revenue_entry: 100 }, 'idgoal=ecommerceAbandonedCart': { nb_conversions: 5, nb_conversions_entry: 5, revenue: 300, revenue_entry: 300 } } }];
    case 'X.forbidden':
      return { result: 'error', message: "You can't access this resource as it requires view access for the website id = 9." };
    default:
      return { result: 'error', message: `no stand-in for ${m}` };
  }
}

before(async () => {
  server = http.createServer((req, res) => {
    urls.push(req.url ?? '');
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const q = new URLSearchParams(raw);
      bodies.push(q);
      let out: unknown;
      if (q.get('method') === 'API.getBulkRequest') {
        const parts: unknown[] = [];
        for (let i = 0; q.has(`urls[${i}]`); i++) {
          const sub = new URLSearchParams(q.get(`urls[${i}]`)!);
          sub.set('token_auth', q.get('token_auth') ?? '');
          parts.push(answer(sub));
        }
        out = parts;
      } else out = answer(q);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const ctxFor = (token = 'tok', goals = [{ id: '1', name: 'Lead form' }, { id: '3', name: 'ClickToPhone' }]) => ({ integration: { id: 1, slug: 'matomo', name: 'Mina', sourceId: '1', config: { goals }, credentials: { baseUrl: base, tokenAuth: token } } });
const range = { start: '2026-10-01', end: '2026-10-03' };

test('the token travels in the request body, never in the address', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  urls.length = 0;
  bodies.length = 0;
  await matomoConnector.daily(ctxFor(), ['sessions'], range);
  assert.ok(urls.length > 0);
  for (const u of urls) assert.doesNotMatch(u, /token_auth/);
  assert.ok(bodies.every((b) => b.get('token_auth') === 'tok'));
  assert.ok(urls.every((u) => u.startsWith('/index.php')));
});

test('the sites a token can see', async () => {
  const { listMatomoSites } = await import('../src/lib/connectors/matomo');
  const sites = await listMatomoSites({ baseUrl: base, tokenAuth: 'tok' });
  assert.deepEqual(sites[0], { id: '1', name: 'Mina Kaouni & Associates', url: 'https://mcaounilaw.gr', currency: 'EUR', timezone: 'Europe/Athens' });
  assert.equal(sites.length, 2);
});

test('daily keys: every day of the range, an empty day is a real zero', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  const d = await matomoConnector.daily(ctxFor(), ['sessions', 'users', 'pageviews', 'engaged_sessions', 'session_duration', 'conversions', 'revenue'], range);
  assert.deepEqual(Object.keys(d).sort(), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.deepEqual(d['2026-10-02'], { sessions: 0, users: 0, pageviews: 0, engaged_sessions: 0, session_duration: 0, conversions: 0, revenue: 0 });
  assert.equal(d['2026-10-01'].sessions, 10);
  assert.equal(d['2026-10-01'].users, 8);
  assert.equal(d['2026-10-03'].pageviews, 41);
  assert.equal(d['2026-10-01'].engaged_sessions, 6, 'visits minus bounces');
  assert.equal(d['2026-10-03'].session_duration, 1200);
  assert.equal(d['2026-10-03'].revenue, 12.5);
});

test('parses Matomo values: numbers, numeric strings, percentages, dashes', async () => {
  const { num } = await import('../src/lib/connectors/matomo');
  assert.equal(num(12), 12);
  assert.equal(num('12'), 12);
  assert.equal(num('3.2%'), 3.2);
  assert.equal(num('-'), 0);
  assert.equal(num(''), 0);
  assert.equal(num(null), 0);
  assert.equal(num('1,234'), 1234);
});

test('breakdowns: channel, country by name, pages by title, conversions by goal', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  const ch = await matomoConnector.breakdown(ctxFor(), 'channel', ['sessions', 'users', 'conversions'], range);
  assert.deepEqual(ch.map((r) => [r.label, r.values.sessions]), [['Search Engines', 20], ['Direct Entry', 10]]);
  const co = await matomoConnector.breakdown(ctxFor(), 'country', ['sessions'], range);
  assert.equal(co[0].label, 'Greece');
  assert.equal(co[0].key, 'GR');
  const titles = await matomoConnector.breakdown(ctxFor(), 'page_title', ['pageviews', 'users'], range);
  assert.deepEqual(titles.map((r) => [r.label, r.values.pageviews]), [['Home', 50], ['Contact - Mina Kaouni', 12]]);
  const goals = await matomoConnector.breakdown(ctxFor(), 'goal', ['conversions', 'revenue', 'goal_conversion_rate'], range);
  assert.deepEqual(goals.map((r) => [r.key, r.label, r.values.conversions, r.values.goal_conversion_rate]), [['3', 'ClickToPhone', 4, 3.2], ['1', 'Lead form', 3, 0]]);
});

test('goals: one goal per day from Goals.get with its id', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  bodies.length = 0;
  const d = await matomoConnector.daily(ctxFor(), ['goal_3_conversions', 'goal_3_revenue'], range);
  assert.equal(d['2026-10-01'].goal_3_conversions, 3);
  assert.equal(d['2026-10-03'].goal_3_revenue, 12.5);
  assert.equal(d['2026-10-02'].goal_3_conversions, 0);
  const asked = bodies.flatMap((b) => (b.get('method') === 'API.getBulkRequest' ? [...b.keys()].filter((k) => k.startsWith('urls[')).map((k) => new URLSearchParams(b.get(k)!)) : [b]));
  assert.ok(asked.some((q) => q.get('method') === 'Goals.get' && q.get('idGoal') === '3'));
});

test('validate: the site name, its currency and time zone, and the goals', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  const res = await matomoConnector.validate!(ctxFor('tok', []));
  assert.deepEqual(res, { name: 'Mina Kaouni & Associates', config: { currency: 'EUR', timezone: 'Europe/Athens', goals: [{ id: '1', name: 'Lead form' }, { id: '3', name: 'ClickToPhone' }] } });
});

test('errors: Matomo says why; a bad token means reconnect; only https (or a local test server)', async () => {
  const { matomoApi, matomoConnector } = await import('../src/lib/connectors/matomo');
  // a site the token lost access to asks for a reconnect too (spec §4), with Matomo's own words
  await assert.rejects(matomoApi({ baseUrl: base, tokenAuth: 'tok' }, 'X.forbidden', {}), /^Error: invalid_token: Matomo: You can't access this resource/);
  await assert.rejects(matomoConnector.daily(ctxFor('bad'), ['sessions'], range), /invalid_token/);
  await assert.rejects(matomoApi({ baseUrl: 'http://example.com/matomo', tokenAuth: 'tok' }, 'API.getMatomoVersion', {}), /https/);
});

test('GA4 pages by title ask for the pageTitle dimension', async () => {
  const { ga4Connector } = await import('../src/lib/connectors/ga4');
  const saved = globalThis.fetch;
  const seen: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    if (u.includes(':runReport')) {
      seen.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
  }) as typeof fetch;
  try {
    await ga4Connector.breakdown({ integration: { id: 9, slug: 'google_analytics_4', name: 'GA4', sourceId: '123', config: {}, credentials: { accessToken: 'at' } } }, 'page_title', ['pageviews'], range);
  } finally {
    globalThis.fetch = saved;
  }
  assert.equal(seen[0]?.dimensions?.[0]?.name, 'pageTitle');
});

test('tables read the columns each Matomo report has; a column a report lacks is missing ("—"), never 0 (final review)', async () => {
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  const [gr] = await matomoConnector.breakdown(ctxFor(), 'country', ['sessions', 'users', 'conversions', 'revenue'], range);
  assert.deepEqual(gr.values, { sessions: 30, users: 25, conversions: 3, revenue: 12.5 });
  const titles = await matomoConnector.breakdown(ctxFor(), 'page_title', ['pageviews', 'users', 'conversions', 'engaged_sessions'], range);
  const home = titles.find((r) => r.label === 'Home')!;
  assert.equal(home.values.pageviews, 50);
  assert.equal(home.values.users, 33);
  assert.ok(Number.isNaN(home.values.conversions), 'a page has no conversions of its own');
  assert.ok(Number.isNaN(home.values.engaged_sessions), 'nor bounces');
  const [offer] = await matomoConnector.breakdown(ctxFor(), 'landing_page', ['sessions', 'engaged_sessions', 'users', 'conversions', 'revenue'], range);
  // a landing page: the visits that started there, and the conversions of those visits (abandoned carts are not conversions)
  assert.deepEqual(offer.values, { sessions: 30, engaged_sessions: 18, users: 27, conversions: 6, revenue: 100 });
});

test('the Top pages table shows "—" for what Matomo does not report, and Source / medium is not offered for Matomo', async () => {
  const { resolveWidget, FetchSession } = await import('../src/lib/engine/resolve');
  const { findWidget, getCatalog } = await import('../src/lib/catalog/build');
  const { pickableMetrics } = await import('../src/lib/catalog/pickable');
  const { WidgetCard } = await import('../src/components/widgets');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const integ = { ...ctxFor().integration, currency: 'EUR' } as any;
  const value = await resolveWidget({ integration: integ, widget: findWidget('matomo', 'top_page_titles')!, range, session: new FetchSession() });
  assert.equal(value.type, 'table');
  const stored = JSON.parse(JSON.stringify(value)); // as a snapshot keeps it
  const html = renderToStaticMarkup(createElement(WidgetCard, { b: { integrationId: 1, platform: 'Matomo', slug: 'matomo', account_name: 'Mina', widget: { reference_key: 'matomo:top_page_titles', key: 'top_page_titles', label: 'Top pages by title', format: 'number', diff_type: 'neutral', value: stored } } as any, fmt: {} }));
  const home = /<tr[^>]*>(?:(?!<\/tr>).)*Home(?:(?!<\/tr>).)*<\/tr>/s.exec(html)?.[0] ?? '';
  assert.match(home, />—</, 'conversions show a dash');
  assert.doesNotMatch(home, />0</);
  assert.equal(pickableMetrics('matomo', getCatalog('matomo')).some((w) => w.key === 'source_medium'), false);
  assert.equal(pickableMetrics('google_analytics_4', getCatalog('google_analytics_4')).some((w) => w.key === 'source_medium'), true);
});
