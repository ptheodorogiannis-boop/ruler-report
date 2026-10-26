// One-click OAuth connect flows against local mock Google / Meta servers (token + list endpoints).
// Nothing here talks to real Google or Meta.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { decryptJson } from '../src/lib/crypto';
import { googleAccessToken } from '../src/lib/connectors/google';
import { db } from '../src/lib/db';
import { endpoints } from '../src/lib/oauth/endpoints';
import { finalizeSelection, handleCallback, pendingMatches as matches, startOAuth } from '../src/lib/oauth/flow';
import { PENDING_COOKIE, openPending, sealPending } from '../src/lib/oauth/pending';
import { OAUTH_SLUGS, listAccounts, oauthAvailable } from '../src/lib/oauth/providers';
import { signState, verifyState } from '../src/lib/oauth/state';
import { makeCompany } from './helpers';
import { principalFor } from './principal';

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET'] as const;
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const setEnv = () => Object.assign(process.env, { GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret', META_APP_ID: 'm-app', META_APP_SECRET: 'm-secret' });
const clearEnv = () => ENV.forEach((k) => delete process.env[k]);

// ───────────── mock providers ─────────────
const seen: { method: string; path: string; auth?: string; body: Record<string, string> }[] = [];
let server: http.Server;
let base = '';
const idToken = 'x.' + Buffer.from(JSON.stringify({ email: 'jane@agency.test' })).toString('base64url') + '.y';
const ALL_GOOGLE_SCOPES = Object.values(OAUTH_SLUGS).filter((s) => s.provider === 'google').flatMap((s) => s.scopes).join(' ');

function reply(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, 'http://x');
    let raw = '';
    for await (const c of req) raw += c;
    const body = Object.fromEntries(new URLSearchParams(raw));
    seen.push({ method: req.method!, path: u.pathname, auth: req.headers.authorization, body });
    const q = u.searchParams;
    const authed = (t: string) => req.headers.authorization === `Bearer ${t}`;

    // ── Google
    if (u.pathname === '/g/token') {
      if (body.grant_type === 'refresh_token') return reply(res, 200, { access_token: 'ya29.fresh', expires_in: 3600 });
      if (body.client_id !== 'g-client' || body.client_secret !== 'g-secret') return reply(res, 401, { error: 'invalid_client' });
      if (body.code === 'bad') return reply(res, 400, { error: 'invalid_grant', error_description: 'Code was already redeemed' });
      const out: any = { access_token: 'at-google', refresh_token: 'rt-google', expires_in: 3600, scope: ALL_GOOGLE_SCOPES, id_token: idToken };
      if (body.code === 'norefresh') delete out.refresh_token;
      if (body.code === 'narrow') out.scope = 'openid email';
      return reply(res, 200, out);
    }
    if (u.pathname.startsWith('/g/')) {
      if (!authed('at-google')) return reply(res, 401, { error: { message: 'bad bearer' } });
      if (u.pathname === '/g/ga/accountSummaries') {
        if (!q.get('pageToken'))
          return reply(res, 200, { accountSummaries: [{ account: 'accounts/1', displayName: 'Acme', propertySummaries: [{ property: 'properties/111', displayName: 'Acme web' }] }], nextPageToken: 'p2' });
        return reply(res, 200, { accountSummaries: [{ account: 'accounts/2', displayName: 'Beta', propertySummaries: [{ property: 'properties/222', displayName: 'Beta app' }, { property: 'properties/333', displayName: 'Beta web' }] }] });
      }
      if (u.pathname === '/g/gsc/sites')
        return reply(res, 200, { siteEntry: [{ siteUrl: 'https://acme.test/', permissionLevel: 'siteOwner' }, { siteUrl: 'sc-domain:beta.test', permissionLevel: 'siteFullUser' }, { siteUrl: 'https://nope.test/', permissionLevel: 'siteUnverifiedUser' }] });
      if (u.pathname === '/g/gbp-acc/accounts') return reply(res, 200, { accounts: [{ name: 'accounts/55', accountName: 'Acme Group' }] });
      if (u.pathname === '/g/gbp-info/accounts/55/locations') {
        if (!q.get('pageToken')) return reply(res, 200, { locations: [{ name: 'locations/9', title: 'Acme Athens', storefrontAddress: { locality: 'Athens' } }], nextPageToken: 'l2' });
        return reply(res, 200, { locations: [{ name: 'locations/10', title: 'Acme Limassol', storefrontAddress: { locality: 'Limassol' } }] });
      }
      if (u.pathname === '/g/yt/channels') {
        assert.equal(q.get('mine'), 'true');
        return reply(res, 200, { items: [{ id: 'UC1', snippet: { title: 'Acme TV', customUrl: '@acmetv' } }] });
      }
    }

    // ── Meta
    if (u.pathname === '/m/oauth/access_token') {
      if (body.client_id !== 'm-app' || body.client_secret !== 'm-secret') return reply(res, 400, { error: { message: 'Invalid app secret' } });
      if (body.grant_type === 'fb_exchange_token') return reply(res, 200, { access_token: 'EAA-long', expires_in: 5184000 });
      if (body.code === 'bad') return reply(res, 400, { error: { message: 'This authorization code has been used' } });
      return reply(res, 200, { access_token: 'EAA-short', expires_in: 3600 });
    }
    if (u.pathname.startsWith('/m/')) {
      if (!authed('EAA-long')) return reply(res, 401, { error: { message: 'bad bearer' } });
      if (u.pathname === '/m/me') return reply(res, 200, { name: 'Jane Meta' });
      if (u.pathname === '/m/me/adaccounts') {
        if (!q.get('after'))
          return reply(res, 200, { data: [{ id: 'act_1', account_id: '1', name: 'Acme Ads', currency: 'EUR', account_status: 1 }], paging: { next: `${base}/m/me/adaccounts?after=c2&limit=100` } });
        return reply(res, 200, { data: [{ id: 'act_2', account_id: '2', name: 'Beta Ads', currency: 'USD', account_status: 2 }] });
      }
      if (u.pathname === '/m/me/accounts')
        return reply(res, 200, {
          data: [
            { id: 'p1', name: 'Acme Page', category: 'Shopping', access_token: 'PAGE-TOKEN-1', instagram_business_account: { id: 'ig1', username: 'acme' } },
            { id: 'p2', name: 'Beta Page', category: 'Software', access_token: 'PAGE-TOKEN-2' },
          ],
        });
    }
    reply(res, 404, { error: { message: `no mock for ${u.pathname}` } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(endpoints.google, { auth: `${base}/g/auth`, token: `${base}/g/token`, analyticsAdmin: `${base}/g/ga`, searchConsole: `${base}/g/gsc`, businessAccounts: `${base}/g/gbp-acc`, businessInfo: `${base}/g/gbp-info`, youtube: `${base}/g/yt` });
  Object.assign(endpoints.meta, { dialog: `${base}/m/dialog`, graph: `${base}/m` });
  setEnv();
});
after(() => {
  server.close();
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// the real one is a type predicate; widen it so negative assertions don't narrow `pending` to never
const pendingMatches = matches as (...a: Parameters<typeof matches>) => boolean;

const appUrl = (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');
const get = (path: string) => new NextRequest(`http://localhost:3100${path}`);
const location = (res: Response) => new URL(res.headers.get('location')!, 'http://localhost:3100');

/** Runs start → (provider consent, simulated) → callback and returns the callback response + pending tokens. */
async function consent(provider: 'google' | 'meta', slug: string, p: Awaited<ReturnType<typeof principalFor>>, projectId: number, code = 'good-code') {
  const start = await startOAuth(get(`/api/oauth/${provider}/start?projectId=${projectId}&slug=${slug}`), p, provider);
  assert.equal(start.status, 307);
  const to = location(start);
  const cb = await handleCallback(get(`/api/oauth/${provider}/callback?code=${code}&state=${encodeURIComponent(to.searchParams.get('state')!)}`), p, provider);
  return { start: to, cb };
}

// ───────────── gating & state ─────────────
test('one-click buttons are gated on the provider env vars', () => {
  clearEnv();
  assert.equal(oauthAvailable('google_analytics_4'), null);
  assert.equal(oauthAvailable('facebook_ads'), null);
  process.env.GOOGLE_CLIENT_ID = 'x';
  assert.equal(oauthAvailable('google_analytics_4'), null, 'secret still missing');
  process.env.GOOGLE_CLIENT_SECRET = 'y';
  assert.equal(oauthAvailable('google_analytics_4'), 'google');
  assert.equal(oauthAvailable('search_console'), 'google');
  assert.equal(oauthAvailable('facebook_ads'), null, 'Meta env still missing');
  process.env.META_APP_ID = 'a';
  process.env.META_APP_SECRET = 'b';
  assert.equal(oauthAvailable('facebook_ads'), 'meta');
  assert.equal(oauthAvailable('instagram_business'), 'meta');
  assert.equal(oauthAvailable('woo_commerce'), null, 'integrations without an OAuth flow never show the button');
  setEnv();
});

test('state is a signed JWT carrying company/project/slug and rejects tampering or other tokens', async () => {
  const s = await signState({ provider: 'google', companyId: 1, projectId: 2, slug: 'search_console', userId: 3 });
  assert.deepEqual(await verifyState(s), { provider: 'google', companyId: 1, projectId: 2, slug: 'search_console', userId: 3 });
  const [h, pl, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pl, 'base64url').toString()), projectId: 99 })).toString('base64url');
  await assert.rejects(verifyState(`${h}.${forged}.${sig}`), /expired or is invalid/);
  await assert.rejects(verifyState(undefined), /Missing/);
  // a session cookie JWT (same key, different audience) must not be accepted as state
  const key = new TextEncoder().encode(process.env.APP_SECRET);
  const session = await new SignJWT({ provider: 'google', companyId: 1, projectId: 2, slug: 'x' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
  await assert.rejects(verifyState(session), /expired or is invalid/);
  const old = await new SignJWT({ provider: 'google', companyId: 1, projectId: 2, slug: 'x', userId: 1 }).setProtectedHeader({ alg: 'HS256' }).setAudience('oauth-state').setExpirationTime(Math.floor(Date.now() / 1000) - 5).sign(key);
  await assert.rejects(verifyState(old), /expired or is invalid/);
});

// ───────────── Google ─────────────
test('Google flow: start → callback → picker list → one encrypted integration per selected GA4 property', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { start, cb } = await consent('google', 'google_analytics_4', p, project.id);

  assert.equal(start.origin + start.pathname, `${base}/g/auth`);
  assert.equal(start.searchParams.get('client_id'), 'g-client');
  assert.equal(start.searchParams.get('redirect_uri'), `${appUrl}/api/oauth/google/callback`);
  assert.equal(start.searchParams.get('access_type'), 'offline');
  assert.equal(start.searchParams.get('prompt'), 'consent');
  assert.equal(start.searchParams.get('response_type'), 'code');
  assert.ok(start.searchParams.get('scope')!.includes('analytics.readonly'));
  assert.ok(!start.searchParams.get('scope')!.includes('webmasters'), 'least privilege: only the scopes of the chosen integration');
  const st = await verifyState(start.searchParams.get('state'));
  assert.equal(st.companyId, company.id);
  assert.equal(st.projectId, project.id);
  assert.equal(st.slug, 'google_analytics_4');

  assert.equal(cb.status, 307);
  assert.equal(location(cb).pathname, `/projects/${project.id}/connect/google_analytics_4/pick`);
  const cookieValue = cb.cookies.get(PENDING_COOKIE)!.value;
  assert.ok(!cookieValue.includes('rt-google'), 'pending tokens are encrypted in the cookie');
  assert.equal(cb.cookies.get(PENDING_COOKIE)!.httpOnly, true);
  const exchange = seen.filter((r) => r.path === '/g/token').pop()!;
  assert.equal(exchange.body.grant_type, 'authorization_code');
  assert.equal(exchange.body.code, 'good-code');
  assert.equal(exchange.body.redirect_uri, `${appUrl}/api/oauth/google/callback`);

  const pending = openPending(cookieValue)!;
  assert.equal(pending.account, 'jane@agency.test');
  assert.ok(pendingMatches(pending, p, project.id, 'google_analytics_4'));
  assert.ok(!pendingMatches(pending, p, project.id, 'search_console'));
  assert.ok(!pendingMatches(pending, { ...p, userId: 2 }, project.id, 'google_analytics_4'));

  const options = await listAccounts('google_analytics_4', pending.credentials);
  assert.deepEqual(options.map((o) => [o.key, o.name]), [['111', 'Acme web'], ['222', 'Beta app'], ['333', 'Beta web']], 'follows nextPageToken');

  const r = await finalizeSelection(pending, ['111', '333']);
  assert.deepEqual(r, { created: 2, reconnected: 0 });
  const rows = await db.integration.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map((x) => [x.slug, x.sourceId, x.name, x.status]), [['google_analytics_4', '111', 'Acme web', 'active'], ['google_analytics_4', '333', 'Beta web', 'active']]);
  for (const row of rows) {
    assert.ok(!row.credentials!.includes('rt-google'));
    assert.deepEqual(decryptJson<any>(row.credentials), { refreshToken: 'rt-google', oauth: 'google', account: 'jane@agency.test' }, 'only the refresh token is persisted');
  }

  // connecting the same property again refreshes credentials instead of duplicating it
  const again = await finalizeSelection({ ...pending, credentials: { ...pending.credentials } }, ['111']);
  assert.deepEqual(again, { created: 0, reconnected: 1 });
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 2);

  // the posted selection is validated against the real account list, not trusted
  await assert.rejects(finalizeSelection(pending, ['999999']), /None of the selected accounts/);
  await assert.rejects(finalizeSelection(pending, []), /Select at least one/);
});

test('the stored OAuth credentials work with the Google token refresh (env client id/secret)', async () => {
  const t = await googleAccessToken({ refreshToken: 'rt-refresh-test', oauth: 'google' });
  assert.equal(t, 'ya29.fresh');
  const call = seen.filter((r) => r.path === '/g/token' && r.body.grant_type === 'refresh_token').pop()!;
  assert.equal(call.body.refresh_token, 'rt-refresh-test');
  assert.equal(call.body.client_id, 'g-client');
});

test('Search Console, Business Profile and YouTube pickers list what the login can access', async () => {
  const creds = { accessToken: 'at-google', refreshToken: 'rt' };
  const gsc = await listAccounts('search_console', creds);
  assert.deepEqual(gsc.map((o) => o.sourceId), ['https://acme.test/', 'sc-domain:beta.test'], 'unverified sites are not offered');
  const gbp = await listAccounts('google_my_business', creds);
  assert.deepEqual(gbp.map((o) => [o.sourceId, o.name, o.detail]), [
    ['accounts/55/locations/9', 'Acme Athens', 'Acme Group · Athens'],
    ['accounts/55/locations/10', 'Acme Limassol', 'Acme Group · Limassol'],
  ]);
  const yt = await listAccounts('youtube', creds);
  assert.deepEqual(yt.map((o) => [o.sourceId, o.name]), [['UC1', 'Acme TV']]);
  await assert.rejects(listAccounts('woo_commerce', creds), /not available/);
  await assert.rejects(listAccounts('youtube', { accessToken: 'wrong' }), /401/);

  // Search Console integrations get the site URL as sourceId (what gsc.ts expects)
  const { company, project } = await makeCompany();
  const pending = openPending(sealPending({ provider: 'google', companyId: company.id, projectId: project.id, slug: 'search_console', userId: 1, credentials: creds }))!;
  await finalizeSelection(pending, ['sc-domain:beta.test']);
  const row = await db.integration.findFirstOrThrow({ where: { projectId: project.id } });
  assert.equal(row.sourceId, 'sc-domain:beta.test');
  assert.equal(row.slug, 'search_console');
});

test('Google callback failure modes redirect back with a message and set no cookie', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const bad = await consent('google', 'google_analytics_4', p, project.id, 'bad');
  assert.equal(bad.cb.cookies.get(PENDING_COOKIE), undefined);
  assert.equal(location(bad.cb).pathname, `/projects/${project.id}/connect/google_analytics_4`);
  assert.match(location(bad.cb).searchParams.get('oauth_error')!, /Code was already redeemed/);

  const noRefresh = await consent('google', 'google_analytics_4', p, project.id, 'norefresh');
  assert.match(location(noRefresh.cb).searchParams.get('oauth_error')!, /refresh token/);
  const narrow = await consent('google', 'google_analytics_4', p, project.id, 'narrow');
  assert.match(location(narrow.cb).searchParams.get('oauth_error')!, /Permission not granted: analytics\.readonly/);

  const state = await signState({ provider: 'google', companyId: company.id, projectId: project.id, slug: 'google_analytics_4', userId: 1 });
  const denied = await handleCallback(get(`/api/oauth/google/callback?error=access_denied&state=${state}`), p, 'google');
  assert.match(location(denied).searchParams.get('oauth_error')!, /access_denied/);
  const noCode = await handleCallback(get(`/api/oauth/google/callback?state=${state}`), p, 'google');
  assert.match(location(noCode).searchParams.get('oauth_error')!, /No authorisation code/);
});

test('callback and start refuse other users, other companies, wrong provider, bad state, read-only roles and unconfigured servers', async () => {
  const { company, project } = await makeCompany();
  const other = await makeCompany('Other Co');
  const p = await principalFor(company.id, 'admin', null);
  const state = await signState({ provider: 'google', companyId: company.id, projectId: project.id, slug: 'search_console', userId: 1 });
  const cbUrl = `/api/oauth/google/callback?code=c&state=${state}`;

  assert.equal((await handleCallback(get(cbUrl), { ...p, userId: 2 }, 'google')).status, 403, 'a different user cannot finish someone else’s flow');
  assert.equal((await handleCallback(get(cbUrl), await principalFor(other.company.id, 'admin', null), 'google')).status, 403);
  assert.equal((await handleCallback(get(cbUrl), p, 'meta')).status, 400, 'google state on the meta callback');
  assert.equal((await handleCallback(get('/api/oauth/google/callback?code=c&state=garbage'), p, 'google')).status, 400);
  assert.equal((await handleCallback(get('/api/oauth/google/callback?code=c'), p, 'google')).status, 400);
  assert.equal(location(await handleCallback(get(cbUrl), null, 'google')).pathname, '/login');
  assert.equal((await handleCallback(get(cbUrl), await principalFor(company.id, 'viewer', null), 'google')).status, 403);
  assert.equal((await handleCallback(get(cbUrl), await principalFor(company.id, 'editor', [project.id + 1000]), 'google')).status, 403, 'project outside the user’s access');

  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&slug=search_console`), await principalFor(company.id, 'viewer', null), 'google')).status, 403);
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${other.project.id}&slug=search_console`), p, 'google')).status, 403, 'project of another company');
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&slug=facebook_ads`), p, 'google')).status, 400, 'slug belongs to Meta');
  assert.equal((await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&slug=woo_commerce`), p, 'google')).status, 400);
  assert.equal(location(await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&slug=search_console`), null, 'google')).pathname, '/login');

  clearEnv();
  const off = await startOAuth(get(`/api/oauth/google/start?projectId=${project.id}&slug=search_console`), p, 'google');
  assert.match(location(off).searchParams.get('oauth_error')!, /not configured/);
  setEnv();
});

test('pending tokens expire', async () => {
  const sealed = sealPending({ provider: 'google', companyId: 1, projectId: 1, slug: 'youtube', userId: 1, credentials: { accessToken: 'a' } });
  assert.ok(openPending(sealed));
  const realNow = Date.now;
  Date.now = () => realNow() + 16 * 60 * 1000;
  try {
    assert.equal(openPending(sealed), null);
  } finally {
    Date.now = realNow;
  }
  assert.equal(openPending('not-a-blob'), null);
  assert.equal(openPending(undefined), null);
});

// ───────────── Meta ─────────────
test('Meta flow: long-lived token, ad account picker with paging, one Meta Ads integration per account', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const { start, cb } = await consent('meta', 'facebook_ads', p, project.id);
  assert.equal(start.origin + start.pathname, `${base}/m/dialog`);
  assert.equal(start.searchParams.get('client_id'), 'm-app');
  assert.equal(start.searchParams.get('scope'), 'ads_read');
  assert.equal(start.searchParams.get('redirect_uri'), `${appUrl}/api/oauth/meta/callback`);
  assert.equal((await verifyState(start.searchParams.get('state'))).slug, 'facebook_ads');

  assert.equal(location(cb).pathname, `/projects/${project.id}/connect/facebook_ads/pick`);
  const tokenCalls = seen.filter((r) => r.path === '/m/oauth/access_token').slice(-2);
  assert.equal(tokenCalls[0].body.code, 'good-code');
  assert.equal(tokenCalls[1].body.grant_type, 'fb_exchange_token');
  assert.equal(tokenCalls[1].body.fb_exchange_token, 'EAA-short');

  const pending = openPending(cb.cookies.get(PENDING_COOKIE)!.value)!;
  assert.equal(pending.account, 'Jane Meta');
  assert.equal(pending.credentials.accessToken, 'EAA-long');
  assert.ok(pending.credentials.expiresAt > Date.now() + 59 * 86400_000, 'about 60 days');

  const options = await listAccounts('facebook_ads', pending.credentials);
  assert.deepEqual(options.map((o) => [o.key, o.name, o.config]), [['act_1', 'Acme Ads', { currency: 'EUR' }], ['act_2', 'Beta Ads', { currency: 'USD' }]]);
  assert.match(options[1].detail!, /disabled/);

  assert.deepEqual(await finalizeSelection(pending, ['act_1', 'act_2']), { created: 2, reconnected: 0 });
  const rows = await db.integration.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map((x) => [x.slug, x.sourceId, x.name, (x.config as any).currency]), [['facebook_ads', 'act_1', 'Acme Ads', 'EUR'], ['facebook_ads', 'act_2', 'Beta Ads', 'USD']]);
  const creds = decryptJson<any>(rows[0].credentials);
  assert.equal(creds.accessToken, 'EAA-long', 'the shape meta.ts reads');
  assert.equal(creds.oauth, 'meta');
  assert.ok(!rows[0].credentials!.includes('EAA-long'));
});

test('Meta Pages and Instagram accounts are listed from /me/accounts and keep their own Page token', async () => {
  const user = { accessToken: 'EAA-long' };
  const pages = await listAccounts('facebook', user);
  assert.deepEqual(pages.map((o) => [o.sourceId, o.name]), [['p1', 'Acme Page'], ['p2', 'Beta Page']]);
  const ig = await listAccounts('instagram_business', user);
  assert.deepEqual(ig.map((o) => [o.sourceId, o.name, o.config]), [['ig1', '@acme', { pageId: 'p1' }]], 'only Pages with a linked Instagram business account');

  const { company, project } = await makeCompany();
  const mk = (slug: string) => openPending(sealPending({ provider: 'meta', companyId: company.id, projectId: project.id, slug, userId: 1, credentials: user }))!;
  await finalizeSelection(mk('facebook'), ['p2']);
  await finalizeSelection(mk('instagram_business'), ['ig1']);
  const rows = await db.integration.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map((r) => [r.slug, r.sourceId, decryptJson<any>(r.credentials).accessToken]), [['facebook', 'p2', 'PAGE-TOKEN-2'], ['instagram_business', 'ig1', 'PAGE-TOKEN-1']]);
});

test('Meta callback surfaces token-endpoint errors', async () => {
  const { company, project } = await makeCompany();
  const p = await principalFor(company.id, 'admin', null);
  const bad = await consent('meta', 'facebook_ads', p, project.id, 'bad');
  assert.equal(bad.cb.cookies.get(PENDING_COOKIE), undefined);
  assert.match(location(bad.cb).searchParams.get('oauth_error')!, /authorization code has been used/);
});
