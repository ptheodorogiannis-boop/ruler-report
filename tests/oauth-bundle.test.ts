// One consent per provider ("Connect with Google" / "Connect with Meta") and the accounts-found picker, against the
// local mock providers in scripts/mock-providers.mjs. Nothing here talks to real Google or Meta.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { NextRequest } from 'next/server';
import { createMockProviders, mockCode } from '../scripts/mock-providers.mjs';
import { decryptJson } from '../src/lib/crypto';
import { db } from '../src/lib/db';
import { endpoints } from '../src/lib/oauth/endpoints';
import { accountsPath, bundleMatches, finalizeBundle, handleCallback, pendingMatches, pickValue, splitPick, startOAuth } from '../src/lib/oauth/flow';
import { PENDING_COOKIE, openPending, sealPending } from '../src/lib/oauth/pending';
import { PROVIDER_SLUGS, bundleSlugs, listBundle, oauthAvailable, scopesFor } from '../src/lib/oauth/providers';
import { verifyState } from '../src/lib/oauth/state';
import { makeCompany } from './helpers';
import { principalFor } from './principal';

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'META_LOGIN_CONFIG_ID'] as const;
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const savedEndpoints = { google: { ...endpoints.google }, meta: { ...endpoints.meta } };
const setEnv = () => Object.assign(process.env, { GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret', META_APP_ID: 'm-app', META_APP_SECRET: 'm-secret', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token' });

const mock = createMockProviders();
let base = '';
before(async () => {
  await new Promise<void>((r) => mock.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
  Object.assign(endpoints.google, { auth: `${base}/g/auth`, token: `${base}/g/token`, analyticsAdmin: `${base}/g/ga`, searchConsole: `${base}/g/gsc`, businessAccounts: `${base}/g/gbp-acc`, businessInfo: `${base}/g/gbp-info`, youtube: `${base}/g/yt`, ads: `${base}/g/ads` });
  Object.assign(endpoints.meta, { dialog: `${base}/m/dialog`, graph: `${base}/m` });
  setEnv();
});
after(() => {
  mock.server.close();
  Object.assign(endpoints.google, savedEndpoints.google);
  Object.assign(endpoints.meta, savedEndpoints.meta);
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const G = 'https://www.googleapis.com/auth/';
const get = (path: string) => new NextRequest(`http://localhost:3100${path}`);
const location = (res: Response) => new URL(res.headers.get('location')!, 'http://localhost:3100');

/** start (bundle) → consent with `granted` scopes → callback */
async function bundleConsent(provider: 'google' | 'meta', p: Awaited<ReturnType<typeof principalFor>>, projectId: number, granted?: string[], entry = '') {
  const start = await startOAuth(get(`/api/oauth/${provider}/start?projectId=${projectId}&bundle=1${entry ? `&slug=${entry}` : ''}`), p, provider);
  assert.equal(start.status, 307, 'start redirects to the consent screen');
  const to = location(start);
  const asked = provider === 'google' ? to.searchParams.get('scope')!.split(' ') : to.searchParams.get('scope')!.split(',');
  const code = mockCode(granted ?? asked);
  const cb = await handleCallback(get(`/api/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(to.searchParams.get('state')!)}`), p, provider);
  return { start: to, asked, cb };
}

test('one sign-in covers every network of the provider; Google Ads joins only with a developer token', () => {
  assert.deepEqual(bundleSlugs('google'), PROVIDER_SLUGS.google);
  assert.deepEqual(bundleSlugs('meta'), ['facebook_ads', 'facebook', 'instagram_business']);
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  assert.ok(!bundleSlugs('google').includes('google_adwords'));
  assert.equal(oauthAvailable('google_adwords'), null, 'no developer token, no one-click Google Ads');
  assert.equal(oauthAvailable('google_analytics_4'), 'google', 'the other Google networks are unaffected');
  setEnv();
  assert.equal(oauthAvailable('google_adwords'), 'google');
  assert.deepEqual(scopesFor(['facebook', 'instagram_business']), ['pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_manage_insights'], 'shared permissions are asked once');
});

test('Google: one consent asks for every network and lands on the accounts-found picker', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { start, asked, cb } = await bundleConsent('google', p, project.id, undefined, 'google_analytics_4');
  for (const s of ['adwords', 'analytics.readonly', 'webmasters.readonly', 'youtube.readonly', 'yt-analytics.readonly', 'business.manage']) assert.ok(asked.includes(G + s), `asks for ${s}`);
  assert.equal(start.searchParams.get('include_granted_scopes'), 'true');
  assert.equal(start.searchParams.get('access_type'), 'offline');
  const st = await verifyState(start.searchParams.get('state'));
  assert.deepEqual(st.slugs, PROVIDER_SLUGS.google);
  assert.equal(st.slug, 'google_analytics_4', 'the page the user started from is remembered for error redirects');

  assert.equal(cb.status, 307);
  assert.equal(location(cb).pathname + location(cb).search, accountsPath(project.id, 'google'));
  const cookie = cb.cookies.get(PENDING_COOKIE)!.value;
  assert.ok(!cookie.includes('mock-rt-google'), 'tokens stay encrypted');
  const pending = openPending(cookie)!;
  assert.deepEqual(pending.granted, PROVIDER_SLUGS.google);
  assert.ok(bundleMatches(pending, p, project.id, 'google'));
  assert.ok(!bundleMatches(pending, p, project.id, 'meta'), 'a Google sign-in never opens the Meta picker');
  assert.ok(!(pendingMatches as (...a: any[]) => boolean)(pending, p, project.id, ''), 'the single-integration picker does not accept a bundle');
  assert.ok(Buffer.byteLength(cookie) < 3500, 'the pending cookie stays under the browser limit');
});

test('Google: unticking networks on the consent screen drops only those networks', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { cb } = await bundleConsent('google', p, project.id, ['openid', 'email', G + 'analytics.readonly', G + 'webmasters.readonly', G + 'youtube.readonly']);
  const pending = openPending(cb.cookies.get(PENDING_COOKIE)!.value)!;
  assert.deepEqual(pending.granted, ['google_analytics_4', 'search_console'], 'YouTube needs both of its scopes; Ads and Business Profile were unticked');

  const none = await bundleConsent('google', p, project.id, ['openid', 'email']);
  assert.equal(none.cb.cookies.get(PENDING_COOKIE), undefined);
  assert.equal(location(none.cb).pathname, `/projects/${project.id}/connect`, 'started from the catalog, so it goes back there');
  assert.match(location(none.cb).searchParams.get('oauth_error')!, /No permission was granted/);
});

test('the picker lists every network side by side; one failing network does not blank the others', async () => {
  mock.state.gbpQuota = true;
  try {
    const creds = { accessToken: `mock-at.${Buffer.from(JSON.stringify({ scopes: [G + 'analytics.readonly'] })).toString('base64url')}` };
    const all = await listBundle(PROVIDER_SLUGS.google, ['google_adwords', 'google_analytics_4', 'search_console', 'google_my_business'], creds);
    const by = Object.fromEntries(all.map((n) => [n.slug, n]));
    assert.deepEqual(by.google_analytics_4.options.map((o) => [o.sourceId, o.name]), [['312456789', 'acmerunning.gr'], ['312456790', 'Acme Running app'], ['298765432', 'olivegrove.gr']]);
    assert.deepEqual(by.search_console.options.map((o) => o.sourceId), ['https://acmerunning.gr/', 'sc-domain:olivegrove.gr']);
    assert.match(by.google_my_business.error!, /429.*limit is 0/s, 'Business Profile shows its own quota error');
    assert.equal(by.youtube.notGranted, true);
    assert.deepEqual(by.youtube.options, []);
    // Google Ads: direct account + client accounts under the manager, deduplicated, cancelled account skipped
    const ads = by.google_adwords.options;
    assert.deepEqual(ads.map((o) => [o.sourceId, o.name, o.config?.loginCustomerId ?? null]), [
      ['5550001111', 'Acme Running Co', null],
      ['5550004444', 'Northwind Optics', '5550002222'],
      ['5550003333', 'Olive Grove Taverna', '5550002222'],
    ]);
    assert.equal(ads[0].detail, '555-000-1111 · EUR');
    const adsCalls = mock.state.seen.filter((r) => r.path.startsWith('/g/ads/'));
    assert.ok(adsCalls.every((r) => r.headers['developer-token'] === 'dev-token'), 'every Google Ads call carries the developer token');
    const clientCall = adsCalls.find((r) => /customer_client/.test(r.body?.query ?? ''))!;
    assert.equal(clientCall.headers['login-customer-id'], '5550002222', 'manager listing sends login-customer-id');
  } finally {
    mock.state.gbpQuota = false;
  }
});

test('submitting the picker adds accounts from several networks at once, validated against a fresh listing', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { cb } = await bundleConsent('google', p, project.id);
  const pending = openPending(cb.cookies.get(PENDING_COOKIE)!.value)!;

  const picks = [pickValue('google_analytics_4', '312456789'), pickValue('google_analytics_4', '298765432'), pickValue('search_console', 'sc-domain:olivegrove.gr'), pickValue('google_adwords', '5550003333'), pickValue('google_adwords', '9999999999'), 'nonsense', pickValue('woo_commerce', 'x')];
  const { ids, ...r } = await finalizeBundle(pending, picks);
  assert.deepEqual(r, { created: 4, reconnected: 0, errors: [] });
  const rows = await db.integration.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } });
  assert.deepEqual(ids, rows.map((x) => x.id), 'the new rows are reported, in pick order, so the tab can name them');
  assert.deepEqual(rows.map((x) => [x.slug, x.sourceId]), [
    ['google_analytics_4', '312456789'],
    ['google_analytics_4', '298765432'],
    ['search_console', 'sc-domain:olivegrove.gr'],
    ['google_adwords', '5550003333'],
  ]);
  const ads = rows.find((x) => x.slug === 'google_adwords')!;
  assert.equal((ads.config as any).loginCustomerId, '5550002222', 'the manager id is kept for later calls');
  assert.deepEqual(rows.map((x) => x.name), ['acmerunning.gr – Google Analytics 4', 'olivegrove.gr – Google Analytics 4', 'sc-domain:olivegrove.gr – Google Search Console', 'Olive Grove Taverna – Google Ads'], 'one sign-in names say which network each row is');
  assert.equal((ads.config as any).currency, 'EUR');
  assert.deepEqual(decryptJson<any>(ads.credentials), { refreshToken: 'mock-rt-google', oauth: 'google', account: 'jane@agency.test' });

  const again = await finalizeBundle(pending, [pickValue('google_analytics_4', '312456789')]);
  assert.deepEqual(again, { created: 0, reconnected: 1, errors: [], ids: [rows[0].id] }, 'picking an account that is already connected refreshes it');
  await assert.rejects(finalizeBundle(pending, []), /Select at least one/);
  await assert.rejects(finalizeBundle(pending, [pickValue('youtube', 'UCnope')]), /YouTube: None of the selected accounts/);
  assert.deepEqual(splitPick('search_console:https://acmerunning.gr/'), { slug: 'search_console', key: 'https://acmerunning.gr/' }, 'keys with colons survive');
});

test('a network whose permission was declined cannot be submitted even with a forged pick', async () => {
  const { company, project } = await makeCompany();
  const pending = openPending(sealPending({ provider: 'google', companyId: company.id, projectId: project.id, slug: '', userId: 1, credentials: { accessToken: 'mock-at.e30', refreshToken: 'rt' }, slugs: PROVIDER_SLUGS.google, granted: ['search_console'] }))!;
  await assert.rejects(finalizeBundle(pending, [pickValue('google_analytics_4', '312456789')]), /Select at least one/);
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 0);
});

test('Meta: one consent for ad accounts, Pages and Instagram; a declined Instagram permission drops only Instagram', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { start, asked, cb } = await bundleConsent('meta', p, project.id);
  assert.deepEqual(asked, ['ads_read', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_manage_insights', 'business_management', 'pages_read_user_content'], 'business_management and pages_read_user_content (post comments) ride along, optional');
  assert.equal(start.origin + start.pathname, `${base}/m/dialog`);
  const pending = openPending(cb.cookies.get(PENDING_COOKIE)!.value)!;
  assert.deepEqual(pending.granted, ['facebook_ads', 'facebook', 'instagram_business']);

  const found = await listBundle(pending.slugs!, pending.granted!, pending.credentials);
  const by = Object.fromEntries(found.map((n) => [n.slug, n.options.map((o) => o.name)]));
  // direct assets first, then the Business Portfolio's owned and client assets, each listed once
  assert.deepEqual(by.facebook_ads, ['Acme Running Co', 'Olive Grove Taverna', 'Northwind Optics', 'Old test account', 'Kifisia Running Club', 'Seaside Hotel']);
  assert.deepEqual(by.facebook, ['Acme Running Co', 'Olive Grove Taverna', 'Northwind Optics', 'Kifisia Running Club', 'Seaside Hotel']);
  assert.deepEqual(by.instagram_business, ['@acmerunning', '@olivegrove.taverna', '@kifisiarunning'], 'Instagram linked to a business Page too');
  const ads = found.find((n) => n.slug === 'facebook_ads')!.options;
  assert.deepEqual(ads.map((o) => [o.detail, !!o.inactive]), [
    ['act_100200300400 · EUR', false],
    ['act_100200300401 · EUR', false],
    ['act_100200300402 · EUR', false],
    ['act_100200300499 · USD · disabled', true],
    ['act_100200300410 · EUR · via Ruler SMPC', false],
    ['act_100200300411 · EUR · via Ruler SMPC', false],
  ], 'a status only when the account cannot run; business assets say which portfolio');
  const pagesFound = found.find((n) => n.slug === 'facebook')!.options;
  assert.deepEqual(pagesFound.slice(3).map((o) => [o.detail, o.credentials?.accessToken ?? null, o.blocked ?? null]), [
    ['100000000000004 · via Ruler SMPC', 'mock-page-4', null],
    ['100000000000005 · via Ruler SMPC', null, 'no_page_access'],
  ], 'a business Page gets its own Page token; one without access is shown but blocked');
  assert.equal(found.find((n) => n.slug === 'facebook')!.options[0].detail, '100000000000001', 'Pages show their id, not an English category');
  assert.equal(found.find((n) => n.slug === 'instagram_business')!.options[0].detail, '17840000000000001 · via Page Acme Running Co');

  const r = await finalizeBundle(pending, [pickValue('facebook_ads', 'act_100200300400'), pickValue('facebook', '100000000000001'), pickValue('instagram_business', '17840000000000001'), pickValue('facebook', '100000000000005')]);
  assert.equal(r.created, 3, 'the blocked business Page is never connected, whatever the form posts');
  assert.deepEqual((await db.integration.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } })).map((x) => x.name), ['Acme Running Co – Meta Ads', 'Acme Running Co – Facebook Page', '@acmerunning – Instagram Business']);
  const ig = await db.integration.findFirstOrThrow({ where: { projectId: project.id, slug: 'instagram_business' } });
  assert.equal(decryptJson<any>(ig.credentials).accessToken, 'mock-page-1', 'Instagram keeps the Page token');
  assert.equal((ig.config as any).pageId, '100000000000001');

  const partial = await bundleConsent('meta', p, project.id, ['ads_read', 'pages_show_list', 'pages_read_engagement', 'read_insights']);
  const partialPending = openPending(partial.cb.cookies.get(PENDING_COOKIE)!.value)!;
  assert.deepEqual(partialPending.granted, ['facebook_ads', 'facebook'], 'declining business_management never blocks a network');
  const direct = await listBundle(partialPending.slugs!, partialPending.granted!, partialPending.credentials);
  assert.equal(direct.find((n) => n.slug === 'facebook_ads')!.options.length, 4, 'without business_management only directly assigned ad accounts are listed');
  assert.equal(direct.find((n) => n.slug === 'facebook_ads')!.error, undefined, 'and that is not an error');

  process.env.META_LOGIN_CONFIG_ID = 'cfg-123';
  try {
    const s = await startOAuth(get(`/api/oauth/meta/start?projectId=${project.id}&bundle=1`), p, 'meta');
    const u = location(s);
    assert.equal(u.searchParams.get('config_id'), 'cfg-123', 'Login for Business apps send their configuration');
    assert.equal(u.searchParams.get('scope'), null);
  } finally {
    delete process.env.META_LOGIN_CONFIG_ID;
  }
});

test('bundle start guards: read-only roles, foreign projects, unknown entry pages and missing setup', async () => {
  const { company, project } = await makeCompany();
  const viewer = await principalFor(company.id, 'viewer', null);
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&bundle=1`), viewer, 'google')).status, 403);
  const other = await makeCompany('Other');
  const admin = await principalFor(company.id, 'admin', null);
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${other.project.id}&bundle=1`), admin, 'google')).status, 403);
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&bundle=1&slug=facebook_ads`), admin, 'google')).status, 400, 'a Meta network cannot start a Google sign-in');
  delete process.env.META_APP_SECRET;
  try {
    const off = await startOAuth(get(`/api/oauth/meta/start?projectId=${project.id}&bundle=1`), admin, 'meta');
    assert.equal(location(off).pathname, `/projects/${project.id}/connect`);
    assert.match(location(off).searchParams.get('oauth_error')!, /not set up on this server yet/);
  } finally {
    setEnv();
  }
});
