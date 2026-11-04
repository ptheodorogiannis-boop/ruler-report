// Per-provider OAuth mechanics: which integrations support one-click connect, the consent URL, the code
// exchange, and "which accounts can this user access" for each integration kind.
// Written against the public Google / Graph API docs and exercised against local mock servers only
// (tests/oauth.test.ts) — not verified with live Google or Meta accounts.
import { adsSearch, developerToken, formatCustomerId, listAccessibleCustomers, pick } from '@/lib/connectors/gads';
import { fetchJson } from '@/lib/connectors/http';
import { endpoints } from './endpoints';
import type { Provider } from './state';

export interface OAuthSlug {
  provider: Provider;
  /** scopes requested for this integration only (least privilege) */
  scopes: string[];
  /** asked for alongside, never required: a declined one does not drop the network */
  optional?: string[];
  /** what the picker calls the accounts */
  noun: string;
}

const G = 'https://www.googleapis.com/auth/';
export const OAUTH_SLUGS: Record<string, OAuthSlug> = {
  google_adwords: { provider: 'google', scopes: [`${G}adwords`], noun: 'Google Ads accounts' },
  google_analytics_4: { provider: 'google', scopes: [`${G}analytics.readonly`], noun: 'GA4 properties' },
  search_console: { provider: 'google', scopes: [`${G}webmasters.readonly`], noun: 'Search Console sites' },
  google_my_business: { provider: 'google', scopes: [`${G}business.manage`], noun: 'Business Profile locations' },
  youtube: { provider: 'google', scopes: [`${G}youtube.readonly`, `${G}yt-analytics.readonly`], noun: 'YouTube channels' },
  facebook_ads: { provider: 'meta', scopes: ['ads_read'], noun: 'ad accounts' },
  // pages_read_user_content (post comments) is asked for, never required: without it the Page connector reads posts
  // without comment counts (src/lib/connectors/facebook.ts), so a decline must not drop the Page
  facebook: { provider: 'meta', scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'], optional: ['pages_read_user_content'], noun: 'Facebook Pages' },
  instagram_business: { provider: 'meta', scopes: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'], noun: 'Instagram business accounts' },
};

export const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', meta: 'Meta' };

export function providerConfigured(p: Provider): boolean {
  return p === 'google' ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) : !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}
/** Google Ads also needs the agency's developer token before any account can be listed or read. */
export const adsTokenConfigured = () => !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const slugReady = (slug: string): boolean => {
  const d = OAUTH_SLUGS[slug];
  return !!d && providerConfigured(d.provider) && (slug !== 'google_adwords' || adsTokenConfigured());
};
/** The one-click button is shown only when this returns a provider; the paste-token form is always available. */
export const oauthAvailable = (slug: string): Provider | null => (slugReady(slug) ? OAUTH_SLUGS[slug].provider : null);

/** Every network one sign-in covers, in the order the "accounts found" picker shows them. */
export const PROVIDER_SLUGS: Record<Provider, string[]> = {
  google: ['google_adwords', 'google_analytics_4', 'search_console', 'youtube', 'google_my_business'],
  meta: ['facebook_ads', 'facebook', 'instagram_business'],
};
/** The networks one consent asks for right now (Google Ads drops out until a developer token is set). */
export const bundleSlugs = (p: Provider): string[] => PROVIDER_SLUGS[p].filter(slugReady);

export interface AccountOption {
  /** unique within the slug; what the picker form posts back */
  key: string;
  sourceId: string;
  name: string;
  detail?: string;
  /** an account that exists but cannot run (a disabled or closed ad account): listed last and muted */
  inactive?: boolean;
  /** visible but not connectable, with the reason (a business Page the person has no Page access to): shown, not selectable */
  blocked?: string;
  /** merged over the base credentials (e.g. a Page access token) */
  credentials?: Record<string, any>;
  config?: Record<string, any>;
}
export interface Tokens {
  credentials: Record<string, any>;
  account?: string;
  /** one-consent flow: the networks whose permissions were all granted */
  granted?: string[];
}

const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null) as [string, string][]);

export const scopesFor = (slugs: string[]): string[] => [...new Set(slugs.flatMap((s) => OAUTH_SLUGS[s]?.scopes ?? []))];
/** The provider's optional permissions plus those of the networks asked for (each asked once). */
const optionalFor = (provider: Provider, slugs: string[]): string[] => [...new Set([...OPTIONAL_SCOPES[provider], ...slugs.flatMap((s) => OAUTH_SLUGS[s]?.optional ?? [])])];
/** Asked for, never required: without business_management Meta lists only the Pages and ad accounts assigned to the
 *  person directly, not the ones they reach through a Business Portfolio (owned or client assets). */
export const OPTIONAL_SCOPES: Record<Provider, string[]> = { google: [], meta: ['business_management'] };

export function authUrl(provider: Provider, slug: string | string[], state: string, redirectUri: string): string {
  const slugs = Array.isArray(slug) ? slug : [slug];
  const scopes = scopesFor(slugs);
  if (provider === 'google') {
    return `${endpoints.google.auth}?${qs({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ['openid', 'email', ...scopes].join(' '),
      access_type: 'offline', // we need a refresh token
      prompt: 'consent', // Google only returns the refresh token on a consent screen
      include_granted_scopes: 'true', // keep what this user granted before, so a second network adds to the first
      state,
    })}`;
  }
  // Facebook Login for Business apps define their permissions in a configuration instead of `scope`
  const config = process.env.META_LOGIN_CONFIG_ID;
  return `${endpoints.meta.dialog}?${qs({ client_id: process.env.META_APP_ID, redirect_uri: redirectUri, response_type: 'code', ...(config ? { config_id: config } : { scope: [...scopes, ...optionalFor('meta', slugs)].join(',') }), state })}`;
}

const form = (o: Record<string, string | undefined>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: qs(o) });

function jwtEmail(idToken?: string): string | undefined {
  try {
    // received straight from Google's token endpoint over TLS and only used as a display label
    return JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8')).email;
  } catch {
    return undefined;
  }
}

/** `slugs` = the one-consent flow: an unticked permission drops that network instead of failing the whole sign-in. */
export async function exchangeCode(provider: Provider, slug: string, code: string, redirectUri: string, slugs?: string[]): Promise<Tokens> {
  if (provider === 'google') {
    const j = await fetchJson<any>(
      endpoints.google.token,
      form({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    );
    if (!j.access_token) throw new Error('Google did not return an access token');
    // consent screens can be granular: the user may untick a permission
    const granted = String(j.scope ?? '').split(/\s+/);
    let grantedSlugs: string[] | undefined;
    if (slugs) {
      grantedSlugs = slugs.filter((s) => OAUTH_SLUGS[s].scopes.every((sc) => granted.includes(sc)));
      if (!grantedSlugs.length) throw new Error('No permission was granted. Sign in again and tick the networks you want to connect on the Google consent screen.');
    }
    const missing = slugs ? [] : OAUTH_SLUGS[slug].scopes.filter((s) => !granted.includes(s));
    if (missing.length) throw new Error(`Permission not granted: ${missing.map((s) => s.split('/').pop()).join(', ')}. Tick every requested permission on the Google consent screen.`);
    if (!j.refresh_token) throw new Error('Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.');
    return { credentials: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 }, account: jwtEmail(j.id_token), ...(grantedSlugs ? { granted: grantedSlugs } : {}) };
  }
  const short = await fetchJson<any>(`${endpoints.meta.graph}/oauth/access_token`, form({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri, code }));
  if (!short.access_token) throw new Error('Meta did not return an access token');
  // swap the ~1h token for a ~60 day one
  const long = await fetchJson<any>(`${endpoints.meta.graph}/oauth/access_token`, form({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token }));
  const token = long.access_token ?? short.access_token;
  const expiresIn = Number(long.expires_in ?? short.expires_in ?? 0);
  let account: string | undefined;
  try {
    account = (await fetchJson<any>(`${endpoints.meta.graph}/me?fields=name`, bearer(token))).name;
  } catch {
    /* label only */
  }
  let grantedSlugs: string[] | undefined;
  if (slugs) {
    grantedSlugs = slugs;
    try {
      // the Login dialog lets people decline single permissions; /me/permissions says which survived
      const perms = await fetchJson<any>(`${endpoints.meta.graph}/me/permissions`, bearer(token));
      const ok = new Set((perms.data ?? []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission));
      if (ok.size) grantedSlugs = slugs.filter((s) => OAUTH_SLUGS[s].scopes.every((sc) => ok.has(sc)));
    } catch {
      /* unknown: list everything and let each network report its own error */
    }
    if (!grantedSlugs.length) throw new Error('No permission was granted. Sign in again and keep the permissions Meta asks for.');
  }
  return { credentials: { accessToken: token, ...(expiresIn ? { expiresAt: Date.now() + expiresIn * 1000 } : {}) }, account, ...(grantedSlugs ? { granted: grantedSlugs } : {}) };
}

// ───────────── account listing ─────────────
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const MAX_PAGES = 20;

async function googleList(slug: string, token: string): Promise<AccountOption[]> {
  const g = endpoints.google;
  const out: AccountOption[] = [];
  if (slug === 'google_adwords') return adsAccounts(token);
  if (slug === 'google_analytics_4') {
    let pageToken: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const j = await fetchJson<any>(`${g.analyticsAdmin}/accountSummaries?${qs({ pageSize: '200', pageToken })}`, bearer(token));
      for (const a of j.accountSummaries ?? [])
        for (const p of a.propertySummaries ?? []) {
          const id = String(p.property).replace(/^properties\//, '');
          out.push({ key: id, sourceId: id, name: p.displayName || id, detail: `${a.displayName ?? a.account} · property ${id}`, config: { propertyId: id } });
        }
      if (!(pageToken = j.nextPageToken)) break;
    }
  } else if (slug === 'search_console') {
    const j = await fetchJson<any>(`${g.searchConsole}/sites`, bearer(token));
    for (const s of j.siteEntry ?? []) {
      if (s.permissionLevel === 'siteUnverifiedUser') continue;
      out.push({ key: s.siteUrl, sourceId: s.siteUrl, name: s.siteUrl, detail: s.permissionLevel });
    }
  } else if (slug === 'google_my_business') {
    const accounts = await fetchJson<any>(`${g.businessAccounts}/accounts?pageSize=20`, bearer(token));
    for (const a of accounts.accounts ?? []) {
      let pageToken: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const j = await fetchJson<any>(`${g.businessInfo}/${a.name}/locations?${qs({ readMask: 'name,title,storefrontAddress', pageSize: '100', pageToken })}`, bearer(token));
        for (const l of j.locations ?? []) {
          const id = `${a.name}/${l.name}`;
          out.push({ key: id, sourceId: id, name: l.title || l.name, detail: [a.accountName, l.storefrontAddress?.locality].filter(Boolean).join(' · ') });
        }
        if (!(pageToken = j.nextPageToken)) break;
      }
    }
  } else if (slug === 'youtube') {
    let pageToken: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const j = await fetchJson<any>(`${g.youtube}/channels?${qs({ part: 'snippet', mine: 'true', maxResults: '50', pageToken })}`, bearer(token));
      for (const c of j.items ?? []) out.push({ key: c.id, sourceId: c.id, name: c.snippet?.title || c.id, detail: c.snippet?.customUrl ?? c.id });
      if (!(pageToken = j.nextPageToken)) break;
    }
  }
  return out;
}

/**
 * Google Ads accounts the signed-in user can reach: the ones they have direct access to, plus every client
 * account under a manager (MCC) they can access. Client accounts found through a manager carry its id as
 * `loginCustomerId`, which every later call sends in the login-customer-id header.
 */
const MAX_CUSTOMERS = 40;
async function adsAccounts(token: string): Promise<AccountOption[]> {
  const dev = developerToken();
  const ids = (await listAccessibleCustomers(token, dev)).slice(0, MAX_CUSTOMERS);
  const direct = new Map<string, AccountOption>();
  const viaManager = new Map<string, AccountOption>();
  let firstError: Error | undefined;
  for (const id of ids) {
    let row: any;
    try {
      [row] = await adsSearch(token, dev, id, 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.status FROM customer LIMIT 1');
    } catch (e) {
      firstError ??= e as Error; // a cancelled or suspended account refuses queries; skip it
      continue;
    }
    if (!row) continue;
    const name = pick(row, 'customer.descriptive_name') || formatCustomerId(id);
    if (pick(row, 'customer.manager')) {
      let clients: any[] = [];
      try {
        clients = await adsSearch(token, dev, id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'", id);
      } catch (e) {
        firstError ??= e as Error;
      }
      for (const c of clients) {
        const cid = String(pick(c, 'customer_client.id'));
        const currency = pick(c, 'customer_client.currency_code');
        if (!viaManager.has(cid))
          viaManager.set(cid, { key: cid, sourceId: cid, name: pick(c, 'customer_client.descriptive_name') || formatCustomerId(cid), detail: `${formatCustomerId(cid)} · ${currency ?? '?'} · via ${name}`, config: { loginCustomerId: id, ...(currency ? { currency } : {}) } });
      }
      continue;
    }
    const status = pick(row, 'customer.status');
    if (status && status !== 'ENABLED') continue;
    const currency = pick(row, 'customer.currency_code');
    direct.set(id, { key: id, sourceId: id, name, detail: `${formatCustomerId(id)} · ${currency ?? '?'}`, config: currency ? { currency } : undefined });
  }
  // direct access needs no manager header, so it wins when an account is reachable both ways
  const out = [...direct.values(), ...[...viaManager.values()].filter((o) => !direct.has(o.key))];
  if (!out.length && firstError) throw firstError;
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Graph API list endpoint with cursor paging; `paging.next` already carries the cursor. */
async function graphList(path: string, params: Record<string, string>, token: string): Promise<any[]> {
  let url: string | undefined = `${endpoints.meta.graph}${path}?${qs({ ...params, limit: '100' })}`;
  const rows: any[] = [];
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const j: any = await fetchJson(url, bearer(token));
    rows.push(...(j.data ?? []));
    url = j.paging?.next;
  }
  return rows;
}
const AD_STATUS: Record<number, string> = { 1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'pending review', 9: 'grace period', 101: 'closed' };

// ── Meta: assets assigned to the person directly, plus everything their Business Portfolios own or manage for clients
const MAX_BUSINESSES = 25;
const AD_FIELDS = 'account_id,name,currency,account_status';
const PAGE_FIELDS = 'id,name,category,access_token,instagram_business_account{id,username,name}';

/** Business Portfolios the person belongs to. Needs business_management; without it (declined, or an older consent)
 *  the list is empty and only directly assigned assets are offered. */
async function metaBusinesses(token: string): Promise<{ id: string; name: string }[]> {
  try {
    return (await graphList('/me/businesses', { fields: 'id,name' }, token)).slice(0, MAX_BUSINESSES).map((b) => ({ id: String(b.id), name: String(b.name ?? b.id) }));
  } catch {
    return [];
  }
}
/** One business edge (owned_pages, client_ad_accounts…); an edge the person may not read is skipped, not fatal. */
async function businessEdge(path: string, fields: string, token: string): Promise<any[]> {
  try {
    return await graphList(path, { fields }, token);
  } catch {
    return [];
  }
}

function adOption(a: any, via?: string): AccountOption {
  const id = String(a.id ?? `act_${a.account_id}`);
  const active = Number(a.account_status) === 1;
  const status = active ? '' : ` · ${AD_STATUS[a.account_status] ?? 'status ' + a.account_status}`;
  return { key: id, sourceId: id, name: a.name || id, detail: `${id} · ${a.currency ?? '?'}${status}${via ? ` · via ${via}` : ''}`, ...(active ? {} : { inactive: true }), config: a.currency ? { currency: a.currency } : undefined };
}

async function metaAdAccounts(token: string): Promise<AccountOption[]> {
  const out = new Map<string, AccountOption>();
  for (const a of await graphList('/me/adaccounts', { fields: AD_FIELDS }, token)) {
    const o = adOption(a);
    out.set(o.key, o);
  }
  const perBusiness = await Promise.all(
    (await metaBusinesses(token)).map(async (b) => ({ b, rows: [...(await businessEdge(`/${b.id}/owned_ad_accounts`, AD_FIELDS, token)), ...(await businessEdge(`/${b.id}/client_ad_accounts`, AD_FIELDS, token))] }))
  );
  for (const { b, rows } of perBusiness)
    for (const a of rows) {
      const o = adOption(a, b.name);
      if (!out.has(o.key)) out.set(o.key, o); // directly assigned wins: same account, no "via"
    }
  return [...out.values()];
}

interface PageEntry {
  page: any;
  via?: string;
}
/** Pages with their Page access tokens: from /me/accounts, then each business's owned and client Pages. A business
 *  Page's token is asked for with the person's token; Meta returns one only when the person has a task on that Page. */
async function metaPages(token: string): Promise<PageEntry[]> {
  const out = new Map<string, PageEntry>();
  for (const p of await graphList('/me/accounts', { fields: PAGE_FIELDS }, token)) out.set(String(p.id), { page: p });
  const perBusiness = await Promise.all(
    (await metaBusinesses(token)).map(async (b) => ({ b, rows: [...(await businessEdge(`/${b.id}/owned_pages`, 'id,name', token)), ...(await businessEdge(`/${b.id}/client_pages`, 'id,name', token))] }))
  );
  for (const { b, rows } of perBusiness)
    for (const p of rows) {
      const id = String(p.id);
      if (out.has(id)) continue;
      let full: any = null;
      try {
        full = await fetchJson(`${endpoints.meta.graph}/${id}?${qs({ fields: PAGE_FIELDS })}`, bearer(token));
      } catch {
        full = null;
      }
      out.set(id, { page: full ? { ...p, ...full } : p, via: b.name });
    }
  return [...out.values()];
}
/** reason code, translated by the pickers (connect.blocked_no_page_access) */
const NO_PAGE_ACCESS = 'no_page_access';

async function metaList(slug: string, token: string): Promise<AccountOption[]> {
  if (slug === 'facebook_ads') return metaAdAccounts(token);
  const out: AccountOption[] = [];
  for (const { page: p, via } of await metaPages(token)) {
    const cred = p.access_token ? { accessToken: p.access_token } : undefined; // Page token: does not expire when derived from a long-lived user token
    if (slug === 'facebook')
      out.push({ key: String(p.id), sourceId: String(p.id), name: p.name, detail: `${p.id}${via ? ` · via ${via}` : ''}`, credentials: cred, ...(cred ? {} : { blocked: NO_PAGE_ACCESS }) });
    else if (p.instagram_business_account && cred) {
      const ig = p.instagram_business_account;
      out.push({ key: ig.id, sourceId: ig.id, name: ig.username ? `@${ig.username}` : ig.name || ig.id, detail: `${ig.id} · via Page ${p.name}`, credentials: cred, config: { pageId: p.id } });
    }
  }
  return out;
}

/** `credentials` are the freshly exchanged tokens (pending cookie). Re-listing on submit is how the server
 *  validates the posted selection instead of trusting form values. */
export async function listAccounts(slug: string, credentials: Record<string, any>): Promise<AccountOption[]> {
  const def = OAUTH_SLUGS[slug];
  if (!def) throw new Error(`One-click connect is not available for "${slug}"`);
  const token = credentials.accessToken as string | undefined;
  if (!token) throw new Error('No access token');
  return def.provider === 'google' ? googleList(slug, token) : metaList(slug, token);
}

export interface NetworkAccounts {
  slug: string;
  options: AccountOption[];
  /** listing failed for this network only (quota, missing approval, no developer token…) */
  error?: string;
  /** the user declined this network's permissions on the consent screen */
  notGranted?: boolean;
}
/** The "accounts found" picker: every network of one consent, listed side by side. One network failing (Business
 *  Profile before Google approves API access, say) never blanks the others. */
export async function listBundle(slugs: string[], granted: string[], credentials: Record<string, any>, deps: { listAccounts?: typeof listAccounts } = {}): Promise<NetworkAccounts[]> {
  const list = deps.listAccounts ?? listAccounts;
  const settled = await Promise.allSettled(slugs.map((s) => (granted.includes(s) ? list(s, credentials) : Promise.resolve([] as AccountOption[]))));
  return slugs.map((slug, i) => {
    if (!granted.includes(slug)) return { slug, options: [], notGranted: true };
    const r = settled[i];
    return r.status === 'fulfilled' ? { slug, options: r.value } : { slug, options: [], error: (r.reason as Error)?.message ?? String(r.reason) };
  });
}

/** What gets stored on the integration (no short-lived Google access token — it is refreshed on use). */
export function storedCredentials(provider: Provider, tokens: Record<string, any>, account?: string): Record<string, any> {
  const base = provider === 'google' ? { refreshToken: tokens.refreshToken } : { accessToken: tokens.accessToken, ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}) };
  return { ...base, oauth: provider, ...(account ? { account } : {}) };
}
