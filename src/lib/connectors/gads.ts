// Google Ads — Google Ads API (REST, GAQL through googleAds:search). Written against the public API docs
// (v26, checked 2026-11-02) and exercised against a local mock server only (tests/connectors-gads.test.ts);
// never run against a live account from this repo.
//
// Every call needs three things: an OAuth access token for a Google user with access to the account (the
// stored refresh token, see ./google.ts), the agency's developer token (GOOGLE_ADS_DEVELOPER_TOKEN, one per
// manager account, from the Google Ads API Center) and, when the account is reached through a manager (MCC),
// that manager's id in the `login-customer-id` header. The one-click picker stores the manager id in
// `config.loginCustomerId` for accounts it found under a manager.
import type { BreakdownRow, Campaign, Connector, DailyData, DailyFilter, DateRange } from '@/lib/engine/types';
import { endpoints } from '@/lib/oauth/endpoints';
import { HttpError, fetchJson } from './http';
import { googleAccessToken } from './google';

const MAX_PAGES = 20;
export const cleanCustomerId = (id: string) => String(id ?? '').replace(/[^\d]/g, '');
export const formatCustomerId = (id: string) => {
  const d = cleanCustomerId(id);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
};

export function developerToken(creds?: Record<string, any> | null): string {
  const t = (creds?.developerToken as string) || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!t) throw new Error('Google Ads needs a developer token: set GOOGLE_ADS_DEVELOPER_TOKEN on the server (Settings → System shows how).');
  return t;
}

/** Google Ads errors carry the useful text in details[].errors[].message; the top-level message is generic. */
function adsError(e: unknown): Error {
  if (e instanceof HttpError && e.body) {
    try {
      const j = JSON.parse(e.body);
      const first = j?.error?.details?.flatMap((d: any) => d?.errors ?? [])?.[0];
      if (first?.message) {
        const code = first.errorCode ? Object.values(first.errorCode)[0] : undefined;
        return new HttpError(e.status, `HTTP ${e.status}: ${first.message}${code ? ` (${code})` : ''}`, e.body);
      }
    } catch {
      /* keep the original */
    }
  }
  return e as Error;
}

const headers = (token: string, devToken: string, loginCustomerId?: string) => ({
  authorization: `Bearer ${token}`,
  'developer-token': devToken,
  'content-type': 'application/json',
  ...(loginCustomerId ? { 'login-customer-id': cleanCustomerId(loginCustomerId) } : {}),
});

/** googleAds:search with paging (pages hold up to 10,000 rows). */
export async function adsSearch(token: string, devToken: string, customerId: string, query: string, loginCustomerId?: string): Promise<any[]> {
  const rows: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    let j: any;
    try {
      j = await fetchJson(`${endpoints.google.ads}/customers/${cleanCustomerId(customerId)}/googleAds:search`, {
        method: 'POST',
        headers: headers(token, devToken, loginCustomerId),
        body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      });
    } catch (e) {
      throw adsError(e);
    }
    rows.push(...(j.results ?? []));
    if (!(pageToken = j.nextPageToken)) break;
  }
  return rows;
}

export async function listAccessibleCustomers(token: string, devToken: string): Promise<string[]> {
  try {
    const j = await fetchJson<any>(`${endpoints.google.ads}/customers:listAccessibleCustomers`, { headers: headers(token, devToken) });
    return (j.resourceNames ?? []).map((r: string) => cleanCustomerId(r.replace(/^customers\//, ''))).filter(Boolean);
  } catch (e) {
    throw adsError(e);
  }
}

// ───────────── query building ─────────────
const FIELD: Record<string, string> = {
  impressions: 'metrics.impressions',
  clicks: 'metrics.clicks',
  spend: 'metrics.cost_micros',
  conversions: 'metrics.conversions',
  conversion_value: 'metrics.conversions_value',
  engagements: 'metrics.engagements',
};
/** Meta-shaped primitives Google Ads has no honest equivalent for: their widgets show "not available". */
export const GADS_UNSUPPORTED = ['reach', 'link_clicks', 'video_views', 'view_content', 'add_to_cart', 'checkout', 'purchases', 'leads'];

const DIM: Record<string, { from: string; key: string; label?: string; fmt?: (v: any) => string }> = {
  campaign: { from: 'campaign', key: 'campaign.id', label: 'campaign.name' },
  adset: { from: 'ad_group', key: 'ad_group.id', label: 'ad_group.name' },
  ad: { from: 'ad_group_ad', key: 'ad_group_ad.ad.id', label: 'ad_group_ad.ad.name' },
  device: { from: 'campaign', key: 'segments.device', fmt: (v) => ({ MOBILE: 'Mobile', DESKTOP: 'Desktop', TABLET: 'Tablet', CONNECTED_TV: 'Connected TV', OTHER: 'Other' })[String(v)] ?? String(v) },
  hour: { from: 'campaign', key: 'segments.hour', fmt: (v) => `${String(v).padStart(2, '0')}:00` },
  age: { from: 'age_range_view', key: 'ad_group_criterion.age_range.type', fmt: (v) => String(v).replace(/^AGE_RANGE_/, '').replace('_UP', '+').replace('_', '-').replace('UNDETERMINED', 'Unknown') },
  gender: { from: 'gender_view', key: 'ad_group_criterion.gender.type', fmt: (v) => ({ MALE: 'Male', FEMALE: 'Female', UNDETERMINED: 'Unknown' })[String(v)] ?? String(v) },
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const during = (r: DateRange) => {
  if (!isDate(r.start) || !isDate(r.end)) throw new Error(`Bad date range ${r.start}..${r.end}`);
  return `segments.date BETWEEN '${r.start}' AND '${r.end}'`;
};
/** Campaign ids go into GAQL verbatim, so only digits are allowed through. */
const idList = (ids: string[]) => ids.map(cleanCustomerId).filter(Boolean);
const metricFields = (prims: string[]) => [...new Set(prims.map((p) => FIELD[p]).filter(Boolean))];

/** GAQL for a daily series: account level, or campaign level when a campaign scope applies. */
export function gadsDailyQuery(prims: string[], range: DateRange, campaignIds?: string[]): string {
  const ids = campaignIds ? idList(campaignIds) : undefined;
  const fields = ['segments.date', ...metricFields(prims)];
  const where = [during(range), ...(ids ? [`campaign.id IN (${ids.length ? ids.join(',') : '0'})`] : [])];
  return `SELECT ${fields.join(', ')} FROM ${ids ? 'campaign' : 'customer'} WHERE ${where.join(' AND ')}`;
}

export function gadsBreakdownQuery(dimension: string, prims: string[], range: DateRange, campaignIds?: string[]): string | null {
  const d = DIM[dimension];
  if (!d) return null;
  const ids = campaignIds ? idList(campaignIds) : undefined;
  const fields = [d.key, ...(d.label ? [d.label] : []), ...metricFields(prims)];
  const where = [during(range), ...(ids ? [`campaign.id IN (${ids.length ? ids.join(',') : '0'})`] : [])];
  return `SELECT ${fields.join(', ')} FROM ${d.from} WHERE ${where.join(' AND ')}`;
}

/** REST JSON is camelCase: `metrics.cost_micros` arrives as `metrics.costMicros`. */
const camel = (s: string) => s.replace(/_(\w)/g, (_, c) => c.toUpperCase());
export function pick(row: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : (o[camel(k)] ?? o[k])), row);
}
export function gadsRowToPrims(row: any, prims: string[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const p of prims) {
    const f = FIELD[p];
    if (!f) v[p] = 0;
    else if (p === 'spend') v[p] = Number(pick(row, f) ?? 0) / 1_000_000;
    else v[p] = Number(pick(row, f) ?? 0);
  }
  return v;
}

export const gadsCampaignStatus = (s: string | undefined): Campaign['status'] => (s === 'ENABLED' ? 'active' : s === 'PAUSED' ? 'paused' : 'other');

async function search(ctx: any, query: string): Promise<any[]> {
  const creds = ctx.integration.credentials;
  const token = await googleAccessToken(creds);
  const login = ctx.integration.config?.loginCustomerId || creds?.loginCustomerId;
  return adsSearch(token, developerToken(creds), ctx.integration.sourceId, query, login || undefined);
}

export const gadsConnector: Connector = {
  id: 'gads',
  unsupported: GADS_UNSUPPORTED,

  async daily(ctx, prims, range, filter?: DailyFilter, campaignIds?: string[]): Promise<DailyData> {
    // a widget sliced by a Meta-only dimension (publisher_platform variants) has no Google Ads data
    if (filter && filter.dimension !== 'campaign') return {};
    const ids = campaignIds ?? (filter ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : undefined);
    const rows = await search(ctx, gadsDailyQuery(prims, range, ids));
    const out: DailyData = {};
    for (const r of rows) {
      const d = pick(r, 'segments.date') as string;
      if (!d) continue;
      const v = gadsRowToPrims(r, prims);
      const cur = (out[d] ??= {});
      for (const p of prims) cur[p] = (cur[p] ?? 0) + v[p];
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const q = gadsBreakdownQuery(dimension, prims, range, opts?.campaignIds);
    if (!q) return [];
    const d = DIM[dimension];
    const groups = new Map<string, { label: string; values: Record<string, number> }>();
    for (const r of await search(ctx, q)) {
      const raw = pick(r, d.key);
      const key = String(raw ?? '(unknown)');
      const label = d.label ? String(pick(r, d.label) || (dimension === 'ad' ? `Ad ${key}` : key)) : d.fmt ? d.fmt(raw) : key;
      const g = groups.get(key) ?? { label, values: {} };
      const v = gadsRowToPrims(r, prims);
      for (const p of prims) g.values[p] = (g.values[p] ?? 0) + v[p];
      groups.set(key, g);
    }
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    const out = [...groups].map(([key, g]) => ({ key, label: g.label, values: g.values })).sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? out.slice(0, opts.limit) : out;
  },

  async listCampaigns(ctx): Promise<Campaign[]> {
    const rows = await search(ctx, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name");
    return rows.map((r) => {
      const type = pick(r, 'campaign.advertising_channel_type');
      return { id: String(pick(r, 'campaign.id')), name: String(pick(r, 'campaign.name') ?? pick(r, 'campaign.id')), status: gadsCampaignStatus(pick(r, 'campaign.status')), ...(type ? { objective: String(type) } : {}) };
    });
  },

  async validate(ctx) {
    const rows = await search(ctx, 'SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1');
    const r = rows[0];
    if (!r) throw new Error('Google Ads returned no account for this customer ID');
    const currency = pick(r, 'customer.currency_code');
    return { name: pick(r, 'customer.descriptive_name') || undefined, config: { ...(ctx.integration.config ?? {}), ...(currency ? { currency } : {}) } };
  },
};
