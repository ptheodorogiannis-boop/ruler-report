// Fake Google and Meta for clicking through "Connect with Google / Meta" without real accounts, and for the tests.
// Nothing here talks to Google or Meta. Every account, id and number below is invented.
//
//   node scripts/mock-providers.mjs [port]          (default 3198)
//   OAUTH_MOCK_BASE=http://localhost:3198 GOOGLE_CLIENT_ID=mock GOOGLE_CLIENT_SECRET=mock \
//   GOOGLE_ADS_DEVELOPER_TOKEN=mock META_APP_ID=mock META_APP_SECRET=mock npm run dev
//
// The consent pages list the requested permissions with checkboxes, so declining one network can be tried too.
// The authorisation code carries the ticked scopes; the access token carries them on, so /me/permissions and
// the token response tell the app exactly what was granted.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};
/** What a test passes as `code` to simulate a consent that granted `scopes`. */
export const mockCode = (scopes) => `mock.${b64({ scopes })}`;
const ID_TOKEN = 'x.' + Buffer.from(JSON.stringify({ email: 'jane@agency.test' })).toString('base64url') + '.y';

// ───────────── fixtures ─────────────
export const FIXTURES = {
  ga4: [
    { account: 'accounts/9001', displayName: 'Acme Running Co', propertySummaries: [{ property: 'properties/312456789', displayName: 'acmerunning.gr' }, { property: 'properties/312456790', displayName: 'Acme Running app' }] },
    { account: 'accounts/9002', displayName: 'Olive Grove Taverna', propertySummaries: [{ property: 'properties/298765432', displayName: 'olivegrove.gr' }] },
  ],
  gsc: [
    { siteUrl: 'https://acmerunning.gr/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:olivegrove.gr', permissionLevel: 'siteFullUser' },
    { siteUrl: 'https://old-site.example/', permissionLevel: 'siteUnverifiedUser' },
  ],
  youtube: [{ id: 'UCmockAcme000000000000001', snippet: { title: 'Acme Running Co', customUrl: '@acmerunning' } }],
  gbp: { accounts: [{ name: 'accounts/7001', accountName: 'Acme Running Co' }], locations: [{ name: 'locations/11', title: 'Acme Running, Kifisia', storefrontAddress: { locality: 'Kifisia' } }, { name: 'locations/12', title: 'Acme Running, Glyfada', storefrontAddress: { locality: 'Glyfada' } }] },
  ads: {
    accessible: ['5550001111', '5550002222', '5550009999'],
    customers: {
      '5550001111': { id: '5550001111', descriptiveName: 'Acme Running Co', currencyCode: 'EUR', manager: false, status: 'ENABLED' },
      '5550002222': { id: '5550002222', descriptiveName: 'Ruler Agency MCC', currencyCode: 'EUR', manager: true, status: 'ENABLED' },
    },
    /** client accounts under the manager 5550002222 (one of them is also directly accessible) */
    clients: [
      { id: '5550003333', descriptiveName: 'Olive Grove Taverna', currencyCode: 'EUR', manager: false, status: 'ENABLED' },
      { id: '5550004444', descriptiveName: 'Northwind Optics', currencyCode: 'EUR', manager: false, status: 'ENABLED' },
      { id: '5550001111', descriptiveName: 'Acme Running Co', currencyCode: 'EUR', manager: false, status: 'ENABLED' },
    ],
    campaigns: [
      { id: '20001', name: 'Search | Brand', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
      { id: '20002', name: 'PMax | Shoes', status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX' },
      { id: '20003', name: 'Display | Remarketing', status: 'PAUSED', advertisingChannelType: 'DISPLAY' },
    ],
  },
  meta: {
    me: { name: 'Jane Meta' },
    adaccounts: [
      { id: 'act_100200300400', account_id: '100200300400', name: 'Acme Running Co', currency: 'EUR', account_status: 1 },
      { id: 'act_100200300401', account_id: '100200300401', name: 'Olive Grove Taverna', currency: 'EUR', account_status: 1 },
      { id: 'act_100200300402', account_id: '100200300402', name: 'Northwind Optics', currency: 'EUR', account_status: 1 },
      { id: 'act_100200300499', account_id: '100200300499', name: 'Old test account', currency: 'USD', account_status: 2 },
    ],
    pages: [
      { id: '100000000000001', name: 'Acme Running Co', category: 'Sporting goods store', access_token: 'mock-page-1', instagram_business_account: { id: '17840000000000001', username: 'acmerunning' } },
      { id: '100000000000002', name: 'Olive Grove Taverna', category: 'Greek restaurant', access_token: 'mock-page-2', instagram_business_account: { id: '17840000000000002', username: 'olivegrove.taverna' } },
      { id: '100000000000003', name: 'Northwind Optics', category: 'Eyewear store', access_token: 'mock-page-3' },
    ],
    /** a Business Portfolio the person belongs to (needs business_management to be listed) */
    businesses: [{ id: '900100', name: 'Ruler SMPC' }],
    businessAssets: {
      '900100': {
        owned_pages: [{ id: '100000000000004', name: 'Kifisia Running Club' }],
        // the second one is also assigned directly: listed once
        client_pages: [{ id: '100000000000005', name: 'Seaside Hotel' }, { id: '100000000000001', name: 'Acme Running Co' }],
        owned_ad_accounts: [{ id: 'act_100200300410', account_id: '100200300410', name: 'Kifisia Running Club', currency: 'EUR', account_status: 1 }],
        client_ad_accounts: [
          { id: 'act_100200300400', account_id: '100200300400', name: 'Acme Running Co', currency: 'EUR', account_status: 1 },
          { id: 'act_100200300411', account_id: '100200300411', name: 'Seaside Hotel', currency: 'EUR', account_status: 1 },
        ],
      },
    },
    /** what GET /{page-id}?fields=access_token,... returns for business Pages: a token only where the person has access */
    pageLookup: {
      '100000000000004': { id: '100000000000004', name: 'Kifisia Running Club', category: 'Sports club', access_token: 'mock-page-4', instagram_business_account: { id: '17840000000000004', username: 'kifisiarunning' } },
      '100000000000005': { id: '100000000000005', name: 'Seaside Hotel', category: 'Hotel' },
    },
  },
};

const GOOGLE_SCOPE_LABEL = {
  'https://www.googleapis.com/auth/adwords': 'See and manage your Google Ads accounts',
  'https://www.googleapis.com/auth/analytics.readonly': 'See your Google Analytics data',
  'https://www.googleapis.com/auth/webmasters.readonly': 'See Search Console data for your sites',
  'https://www.googleapis.com/auth/youtube.readonly': 'See your YouTube account',
  'https://www.googleapis.com/auth/yt-analytics.readonly': 'See YouTube Analytics reports',
  'https://www.googleapis.com/auth/business.manage': 'See your Business Profile listings',
};

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function consentPage(title, who, scopes, labels, action, hidden) {
  const rows = scopes
    .map((s) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #e3e6e1"><input type="checkbox" name="scope" value="${esc(s)}" checked style="margin-top:3px"><span><span style="display:block;font-weight:500">${esc(labels[s] ?? s)}</span><span style="display:block;font-size:12px;color:#636d7c">${esc(s)}</span></span></label>`)
    .join('');
  const hid = Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f5f2;font:14px/1.45 system-ui,sans-serif;color:#101418">
<main style="max-width:460px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e3e6e1;border-radius:12px">
<p style="margin:0 0 4px;color:#636d7c">Local mock, no real account</p>
<h1 style="margin:0 0 6px;font-size:20px">${esc(title)}</h1>
<p style="margin:0 0 16px;color:#525b66">Ruler Reports wants to access ${esc(who)}. Untick anything you want to refuse.</p>
<form method="get" action="${esc(action)}">${hid}${rows}
<div style="display:flex;gap:8px;margin-top:18px"><button name="decision" value="allow" style="padding:8px 14px;border-radius:8px;border:0;background:#1a36e6;color:#fff;font-weight:600">Allow</button>
<button name="decision" value="deny" style="padding:8px 14px;border-radius:8px;border:1px solid #cfd4ce;background:#fff">Cancel</button></div></form></main></body></html>`;
}

/** Rows for Google Ads data queries: one per day (and per campaign at campaign level), deterministic. */
function adsDataRows(query) {
  const m = /segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/.exec(query);
  const from = (/FROM (\w+)/.exec(query) ?? [])[1];
  const days = [];
  if (m) for (let d = new Date(m[1] + 'T00:00:00Z'); d <= new Date(m[2] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const camps = from === 'campaign' || from === 'ad_group' ? FIXTURES.ads.campaigns : [null];
  const rows = [];
  days.forEach((date, i) =>
    camps.forEach((c, j) => {
      const k = 1 + ((i * 7 + j * 3) % 5) / 10;
      const row = { segments: { date }, metrics: { impressions: String(Math.round(1800 * k)), clicks: String(Math.round(64 * k)), costMicros: String(Math.round(41.5 * k * 1e6)), conversions: 3 * k, conversionsValue: 180 * k, engagements: '0' } };
      if (c) row.campaign = { id: c.id, name: c.name, status: c.status };
      rows.push(row);
    })
  );
  return rows;
}

export function createMockProviders(opts = {}) {
  const state = { seen: [], gbpQuota: !!opts.gbpQuota };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let raw = '';
    for await (const c of req) raw += c;
    const isJson = String(req.headers['content-type'] ?? '').includes('json');
    const body = isJson ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
    state.seen.push({ method: req.method, path: u.pathname, headers: req.headers, body, query: Object.fromEntries(u.searchParams) });
    const q = u.searchParams;
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    const tokenScopes = bearer.startsWith('mock-at.') ? (unb64(bearer.slice(8))?.scopes ?? []) : null;
    const has = (s) => Array.isArray(tokenScopes) && tokenScopes.includes(s);

    // ── Google consent + token
    if (u.pathname === '/g/auth') {
      if (q.get('decision')) {
        const back = new URL(q.get('redirect_uri'));
        back.searchParams.set('state', q.get('state') ?? '');
        if (q.get('decision') === 'deny') back.searchParams.set('error', 'access_denied');
        else back.searchParams.set('code', mockCode(['openid', 'email', ...q.getAll('scope')]));
        res.writeHead(302, { location: back.toString() }).end();
        return;
      }
      const scopes = String(q.get('scope') ?? '').split(' ').filter((s) => s.startsWith('https://'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(consentPage('Sign in with Google', 'your Google account jane@agency.test', scopes, GOOGLE_SCOPE_LABEL, '/g/auth', { redirect_uri: q.get('redirect_uri') ?? '', state: q.get('state') ?? '' }));
      return;
    }
    if (u.pathname === '/g/token') {
      if (body.grant_type === 'refresh_token') return reply(res, 200, { access_token: `mock-at.${b64({ scopes: Object.keys(GOOGLE_SCOPE_LABEL) })}`, expires_in: 3600 });
      const granted = String(body.code ?? '').startsWith('mock.') ? unb64(String(body.code).slice(5))?.scopes : null;
      if (!granted) return reply(res, 400, { error: 'invalid_grant', error_description: 'Unknown code' });
      return reply(res, 200, { access_token: `mock-at.${b64({ scopes: granted })}`, refresh_token: 'mock-rt-google', expires_in: 3600, scope: granted.join(' '), id_token: ID_TOKEN });
    }
    if (u.pathname.startsWith('/g/')) {
      if (!tokenScopes) return reply(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
      if (u.pathname === '/g/ga/accountSummaries') return has('https://www.googleapis.com/auth/analytics.readonly') ? reply(res, 200, { accountSummaries: FIXTURES.ga4 }) : reply(res, 403, { error: { message: 'Insufficient scopes' } });
      if (u.pathname === '/g/gsc/sites') return reply(res, 200, { siteEntry: FIXTURES.gsc });
      if (u.pathname === '/g/yt/channels') return reply(res, 200, { items: FIXTURES.youtube });
      if (u.pathname === '/g/gbp-acc/accounts') {
        if (state.gbpQuota) return reply(res, 429, { error: { code: 429, message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'. The limit is 0 until Google approves Business Profile API access.", status: 'RESOURCE_EXHAUSTED' } });
        return reply(res, 200, { accounts: FIXTURES.gbp.accounts });
      }
      if (u.pathname === '/g/gbp-info/accounts/7001/locations') return reply(res, 200, { locations: FIXTURES.gbp.locations });
      if (u.pathname.startsWith('/g/ads/')) {
        if (!req.headers['developer-token']) return reply(res, 401, { error: { code: 401, message: 'The caller does not have permission', details: [{ errors: [{ errorCode: { authenticationError: 'DEVELOPER_TOKEN_PARAMETER_MISSING' }, message: 'The developer token is not on the request.' }] }] } });
        if (u.pathname === '/g/ads/customers:listAccessibleCustomers') return reply(res, 200, { resourceNames: FIXTURES.ads.accessible.map((id) => `customers/${id}`) });
        const m = /^\/g\/ads\/customers\/(\d+)\/googleAds:search$/.exec(u.pathname);
        if (m) {
          const id = m[1];
          const query = String(body.query ?? '');
          const login = req.headers['login-customer-id'];
          if (id === '5550009999') return reply(res, 403, { error: { code: 403, message: 'The caller does not have permission', details: [{ errors: [{ errorCode: { authorizationError: 'CUSTOMER_NOT_ENABLED' }, message: "The customer account can't be accessed because it is not yet enabled or has been deactivated." }] }] } });
          if (/FROM customer_client/.test(query)) {
            if (id !== '5550002222' || login !== '5550002222') return reply(res, 403, { error: { code: 403, message: 'denied', details: [{ errors: [{ errorCode: { authorizationError: 'USER_PERMISSION_DENIED' }, message: "User doesn't have permission to access customer. Note: If you're accessing a client customer, the manager's customer id must be set in the 'login-customer-id' header." }] }] } });
            return reply(res, 200, { results: FIXTURES.ads.clients.map((c) => ({ customerClient: c })) });
          }
          if (/FROM customer LIMIT 1/.test(query) && /descriptive_name/.test(query)) {
            const direct = FIXTURES.ads.customers[id];
            const viaManager = login === '5550002222' ? FIXTURES.ads.clients.find((c) => c.id === id) : null;
            const c = direct ?? viaManager;
            if (!c) return reply(res, 403, { error: { code: 403, message: 'denied', details: [{ errors: [{ errorCode: { authorizationError: 'USER_PERMISSION_DENIED' }, message: "User doesn't have permission to access customer." }] }] } });
            return reply(res, 200, { results: [{ customer: c }] });
          }
          if (/FROM campaign WHERE campaign.status != 'REMOVED'/.test(query)) return reply(res, 200, { results: FIXTURES.ads.campaigns.map((c) => ({ campaign: c })) });
          return reply(res, 200, { results: adsDataRows(query) });
        }
      }
    }

    // ── Meta login dialog + token
    if (u.pathname === '/m/dialog') {
      if (q.get('decision')) {
        const back = new URL(q.get('redirect_uri'));
        back.searchParams.set('state', q.get('state') ?? '');
        if (q.get('decision') === 'deny') back.searchParams.set('error', 'access_denied');
        else back.searchParams.set('code', mockCode(q.getAll('scope')));
        res.writeHead(302, { location: back.toString() }).end();
        return;
      }
      const scopes = String(q.get('scope') ?? 'ads_read,pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights,business_management').split(',').filter(Boolean);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(consentPage('Continue as Jane Meta', 'your Facebook Pages, Instagram accounts and ad accounts', scopes, {}, '/m/dialog', { redirect_uri: q.get('redirect_uri') ?? '', state: q.get('state') ?? '' }));
      return;
    }
    if (u.pathname === '/m/oauth/access_token') {
      if (body.grant_type === 'fb_exchange_token') {
        const inner = String(body.fb_exchange_token ?? '').replace(/^mock-short\./, '');
        return reply(res, 200, { access_token: `mock-at.${inner}`, expires_in: 5184000 });
      }
      const granted = String(body.code ?? '').startsWith('mock.') ? unb64(String(body.code).slice(5))?.scopes : null;
      if (!granted) return reply(res, 400, { error: { message: 'This authorization code has been used.' } });
      return reply(res, 200, { access_token: `mock-short.${b64({ scopes: granted })}`, expires_in: 3600 });
    }
    if (u.pathname.startsWith('/m/')) {
      if (!tokenScopes && !bearer.startsWith('mock-page-')) return reply(res, 401, { error: { message: 'Invalid OAuth access token.' } });
      if (u.pathname === '/m/me') return reply(res, 200, FIXTURES.meta.me);
      if (u.pathname === '/m/me/permissions') {
        const all = ['ads_read', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_manage_insights', 'business_management'];
        return reply(res, 200, { data: all.map((p) => ({ permission: p, status: tokenScopes.includes(p) ? 'granted' : 'declined' })) });
      }
      if (u.pathname === '/m/me/adaccounts') return reply(res, 200, { data: FIXTURES.meta.adaccounts });
      if (u.pathname === '/m/me/accounts') return reply(res, 200, { data: FIXTURES.meta.pages });
      if (u.pathname === '/m/me/businesses') return has('business_management') ? reply(res, 200, { data: FIXTURES.meta.businesses }) : reply(res, 403, { error: { message: '(#100) Missing Permission', code: 100 } });
      const biz = /^\/m\/(\d+)\/(owned_pages|client_pages|owned_ad_accounts|client_ad_accounts)$/.exec(u.pathname);
      if (biz) return has('business_management') ? reply(res, 200, { data: FIXTURES.meta.businessAssets[biz[1]]?.[biz[2]] ?? [] }) : reply(res, 403, { error: { message: '(#100) Missing Permission', code: 100 } });
      const page = /^\/m\/(\d{15})$/.exec(u.pathname);
      if (page && FIXTURES.meta.pageLookup[page[1]]) return reply(res, 200, FIXTURES.meta.pageLookup[page[1]]);
    }
    reply(res, 404, { error: { message: `no mock for ${req.method} ${u.pathname}` } });
  });
  return { server, state };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 3198);
  const { server } = createMockProviders({ gbpQuota: process.env.MOCK_GBP_QUOTA === '1' });
  server.listen(port, '127.0.0.1', () => console.log(`mock Google + Meta on http://localhost:${port}`));
}
