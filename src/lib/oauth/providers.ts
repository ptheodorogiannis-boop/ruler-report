// Per-provider OAuth mechanics: which integrations support one-click connect, the consent URL, the code
// exchange, and "which accounts can this user access" for each integration kind.
// Written against the public Google / Graph API docs and exercised against local mock servers only
// (tests/oauth.test.ts) — not verified with live Google or Meta accounts.
import { fetchJson } from '@/lib/connectors/http';
import { endpoints } from './endpoints';
import type { Provider } from './state';

export interface OAuthSlug {
  provider: Provider;
  /** scopes requested for this integration only (least privilege) */
  scopes: string[];
  /** what the picker calls the accounts */
  noun: string;
}

const G = 'https://www.googleapis.com/auth/';
export const OAUTH_SLUGS: Record<string, OAuthSlug> = {
  google_analytics_4: { provider: 'google', scopes: [`${G}analytics.readonly`], noun: 'GA4 properties' },
  search_console: { provider: 'google', scopes: [`${G}webmasters.readonly`], noun: 'Search Console sites' },
  google_my_business: { provider: 'google', scopes: [`${G}business.manage`], noun: 'Business Profile locations' },
  youtube: { provider: 'google', scopes: [`${G}youtube.readonly`, `${G}yt-analytics.readonly`], noun: 'YouTube channels' },
  facebook_ads: { provider: 'meta', scopes: ['ads_read'], noun: 'ad accounts' },
  facebook: { provider: 'meta', scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'], noun: 'Facebook Pages' },
  instagram_business: { provider: 'meta', scopes: ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'], noun: 'Instagram business accounts' },
};

export const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', meta: 'Meta' };

export function providerConfigured(p: Provider): boolean {
  return p === 'google' ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) : !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}
/** The one-click button is shown only when this returns a provider; the paste-token form is always available. */
export const oauthAvailable = (slug: string): Provider | null => {
  const d = OAUTH_SLUGS[slug];
  return d && providerConfigured(d.provider) ? d.provider : null;
};

export interface AccountOption {
  /** unique within the slug; what the picker form posts back */
  key: string;
  sourceId: string;
  name: string;
  detail?: string;
  /** merged over the base credentials (e.g. a Page access token) */
  credentials?: Record<string, any>;
  config?: Record<string, any>;
}
export interface Tokens {
  credentials: Record<string, any>;
  account?: string;
}

const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null) as [string, string][]);

export function authUrl(provider: Provider, slug: string, state: string, redirectUri: string): string {
  const def = OAUTH_SLUGS[slug];
  if (provider === 'google') {
    return `${endpoints.google.auth}?${qs({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ['openid', 'email', ...def.scopes].join(' '),
      access_type: 'offline', // we need a refresh token
      prompt: 'consent', // Google only returns the refresh token on a consent screen
      state,
    })}`;
  }
  return `${endpoints.meta.dialog}?${qs({ client_id: process.env.META_APP_ID, redirect_uri: redirectUri, response_type: 'code', scope: def.scopes.join(','), state })}`;
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

export async function exchangeCode(provider: Provider, slug: string, code: string, redirectUri: string): Promise<Tokens> {
  if (provider === 'google') {
    const j = await fetchJson<any>(
      endpoints.google.token,
      form({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    );
    if (!j.access_token) throw new Error('Google did not return an access token');
    // consent screens can be granular: the user may untick a permission
    const granted = String(j.scope ?? '').split(/\s+/);
    const missing = OAUTH_SLUGS[slug].scopes.filter((s) => !granted.includes(s));
    if (missing.length) throw new Error(`Permission not granted: ${missing.map((s) => s.split('/').pop()).join(', ')}. Tick every requested permission on the Google consent screen.`);
    if (!j.refresh_token) throw new Error('Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.');
    return { credentials: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 }, account: jwtEmail(j.id_token) };
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
  return { credentials: { accessToken: token, ...(expiresIn ? { expiresAt: Date.now() + expiresIn * 1000 } : {}) }, account };
}

// ───────────── account listing ─────────────
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
const MAX_PAGES = 20;

async function googleList(slug: string, token: string): Promise<AccountOption[]> {
  const g = endpoints.google;
  const out: AccountOption[] = [];
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

async function metaList(slug: string, token: string): Promise<AccountOption[]> {
  if (slug === 'facebook_ads') {
    const rows = await graphList('/me/adaccounts', { fields: 'account_id,name,currency,account_status' }, token);
    return rows.map((a) => {
      const id = String(a.id ?? `act_${a.account_id}`);
      return { key: id, sourceId: id, name: a.name || id, detail: `${id} · ${a.currency ?? '?'} · ${AD_STATUS[a.account_status] ?? 'status ' + a.account_status}`, config: a.currency ? { currency: a.currency } : undefined };
    });
  }
  const pages = await graphList('/me/accounts', { fields: 'id,name,category,access_token,instagram_business_account{id,username,name}' }, token);
  const out: AccountOption[] = [];
  for (const p of pages) {
    const cred = p.access_token ? { accessToken: p.access_token } : undefined; // Page token: does not expire when derived from a long-lived user token
    if (slug === 'facebook') out.push({ key: p.id, sourceId: p.id, name: p.name, detail: p.category, credentials: cred });
    else if (p.instagram_business_account) {
      const ig = p.instagram_business_account;
      out.push({ key: ig.id, sourceId: ig.id, name: ig.username ? `@${ig.username}` : ig.name || ig.id, detail: `via Page ${p.name}`, credentials: cred, config: { pageId: p.id } });
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

/** What gets stored on the integration (no short-lived Google access token — it is refreshed on use). */
export function storedCredentials(provider: Provider, tokens: Record<string, any>, account?: string): Record<string, any> {
  const base = provider === 'google' ? { refreshToken: tokens.refreshToken } : { accessToken: tokens.accessToken, ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}) };
  return { ...base, oauth: provider, ...(account ? { account } : {}) };
}
