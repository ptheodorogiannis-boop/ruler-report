// Meta Ads — Marketing API insights. Written against the public Graph API docs; not exercised against a
// live ad account in this repo's tests (needs a token).
import type { BreakdownRow, Campaign, Connector, DailyData, DailyFilter, DateRange } from '@/lib/engine/types';
import { fetchJson } from './http';

const V = process.env.META_API_VERSION || 'v21.0';

const ACTION: Record<string, string[]> = {
  video_views: ['video_view'],
  view_content: ['omni_view_content', 'offsite_conversion.fb_pixel_view_content'],
  add_to_cart: ['omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkout: ['omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  purchases: ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'],
  leads: ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped'],
  engagements: ['post_engagement'],
};
const DIM: Record<string, { level?: string; breakdowns?: string; field: string; idField?: string }> = {
  campaign: { level: 'campaign', field: 'campaign_name', idField: 'campaign_id' }, // rows keyed by id, labelled by name (spec v3 §2.1)
  adset: { level: 'adset', field: 'adset_name' },
  ad: { level: 'ad', field: 'ad_name' },
  age: { breakdowns: 'age', field: 'age' },
  gender: { breakdowns: 'gender', field: 'gender' },
  device: { breakdowns: 'impression_device', field: 'impression_device' },
  hour: { breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', field: 'hourly_stats_aggregated_by_advertiser_time_zone' },
  country: { breakdowns: 'country', field: 'country' },
  publisher_platform: { breakdowns: 'publisher_platform', field: 'publisher_platform' },
  placement: { breakdowns: 'publisher_platform,platform_position', field: 'platform_position' },
};

const act = (id: string) => (id.startsWith('act_') ? id : `act_${id}`);
const sumActions = (list: any[] | undefined, names: string[]) => {
  if (!list) return 0;
  // omni_* and pixel variants overlap; take the first present name to avoid double counting
  for (const n of names) {
    const hit = list.find((a) => a.action_type === n);
    if (hit) return Number(hit.value);
  }
  return 0;
};

function rowToPrims(r: any, prims: string[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const p of prims) {
    if (p === 'impressions') v[p] = Number(r.impressions ?? 0);
    else if (p === 'reach') v[p] = Number(r.reach ?? 0);
    else if (p === 'clicks') v[p] = Number(r.clicks ?? 0);
    else if (p === 'link_clicks') v[p] = Number(r.inline_link_clicks ?? 0);
    else if (p === 'spend') v[p] = Number(r.spend ?? 0);
    else if (p === 'conversions') v[p] = sumActions(r.actions, ACTION.purchases) + sumActions(r.actions, ACTION.leads);
    else if (p === 'conversion_value') v[p] = sumActions(r.action_values, ACTION.purchases);
    else if (ACTION[p]) v[p] = sumActions(r.actions, ACTION[p]);
    else v[p] = 0;
  }
  return v;
}

async function insights(ctx: any, params: Record<string, string>): Promise<any[]> {
  const token = ctx.integration.credentials?.accessToken;
  if (!token) throw new Error('invalid_token: no Meta access token stored');
  const qs = new URLSearchParams({
    fields: 'impressions,reach,clicks,inline_link_clicks,spend,actions,action_values,' + (params.extraFields ?? ''),
    limit: '500',
    access_token: token,
    ...params,
  });
  qs.delete('extraFields');
  let url: string | undefined = `https://graph.facebook.com/${V}/${act(ctx.integration.sourceId)}/insights?${qs}`;
  const rows: any[] = [];
  let pages = 0;
  while (url && pages++ < 40) {
    const j: any = await fetchJson(url);
    rows.push(...(j.data ?? []));
    url = j.paging?.next;
  }
  return rows;
}
const timeRange = (r: DateRange) => JSON.stringify({ since: r.start, until: r.end });

/** Insights params for a daily series; a campaign filter becomes Graph API `filtering` (campaign.id IN […]) at account level. */
/** `filtering` for a campaign scope (spec v3 §2.2): the same param on daily, totals and breakdown calls. */
const campaignFiltering = (ids: string[]) => JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]);
export function metaDailyParams(range: DateRange, filter?: DailyFilter, campaignIds?: string[]): Record<string, string> {
  const params: Record<string, string> = { time_increment: '1', time_range: timeRange(range), level: 'account' };
  if (filter?.dimension === 'publisher_platform') params.breakdowns = 'publisher_platform';
  const ids = campaignIds ?? (filter?.dimension === 'campaign' ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : undefined);
  if (ids) params.filtering = campaignFiltering(ids);
  return params;
}
export function metaTotalsParams(range: DateRange, campaignIds?: string[]): Record<string, string> {
  const params: Record<string, string> = { time_range: timeRange(range), level: 'account' };
  if (campaignIds) params.filtering = campaignFiltering(campaignIds);
  return params;
}
export function metaBreakdownParams(dimension: string, range: DateRange, campaignIds?: string[]): Record<string, string> | null {
  const dim = DIM[dimension];
  if (!dim) return null;
  const params: Record<string, string> = { time_range: timeRange(range), level: dim.level ?? 'account' };
  if (dim.breakdowns) params.breakdowns = dim.breakdowns;
  if (dim.level) params.extraFields = [dim.field, dim.idField].filter(Boolean).join(',');
  if (campaignIds) params.filtering = campaignFiltering(campaignIds);
  return params;
}

/** Group insight rows by a field (optionally keyed by an id field), summing the primitives. */
function groupMetaRows(rows: any[], field: string, idField: string | undefined, prims: string[]): BreakdownRow[] {
  const groups = new Map<string, { label: string; values: Record<string, number> }>();
  for (const r of rows) {
    const key = String(r[idField ?? field] ?? '(unknown)');
    const label = String(r[field] ?? key);
    const v = rowToPrims(r, prims);
    const g = groups.get(key) ?? { label, values: {} };
    for (const p of prims) g.values[p] = (g.values[p] ?? 0) + v[p];
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => ({ key, label: g.label, values: g.values }));
}

/** Campaign-level rows keyed by campaign id, labelled by name. */
export const metaCampaignRows = (rows: any[], prims: string[]): BreakdownRow[] => groupMetaRows(rows, 'campaign_name', 'campaign_id', prims);

export const metaCampaignStatus = (s: string | undefined): Campaign['status'] => (s === 'ACTIVE' ? 'active' : s === 'PAUSED' ? 'paused' : 'other');

export const metaConnector: Connector = {
  id: 'meta',

  async daily(ctx, prims, range, filter, campaignIds): Promise<DailyData> {
    const rows = await insights(ctx, metaDailyParams(range, filter, campaignIds));
    const out: DailyData = {};
    for (const r of rows) {
      if (filter?.dimension === 'publisher_platform' && r.publisher_platform !== filter.value) continue;
      const d = r.date_start as string;
      const v = rowToPrims(r, prims);
      const cur = (out[d] ??= {});
      for (const p of prims) cur[p] = (cur[p] ?? 0) + v[p];
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const dim = DIM[dimension];
    const params = metaBreakdownParams(dimension, range, opts?.campaignIds);
    if (!dim || !params) return [];
    const rows = await insights(ctx, params);
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    const out = groupMetaRows(rows, dim.field, dim.idField, prims).sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? out.slice(0, opts.limit) : out;
  },

  /** reach is not additive across days — ask the API for the period total */
  async totals(ctx, prims, range, campaignIds) {
    const rows = await insights(ctx, metaTotalsParams(range, campaignIds));
    const out: Record<string, number> = Object.fromEntries(prims.map((p) => [p, 0]));
    for (const r of rows) {
      const v = rowToPrims(r, prims);
      for (const p of prims) out[p] += v[p];
    }
    return out;
  },

  /** The account's campaigns for scopes and the wizard (spec v3 §2.1), paged. */
  async listCampaigns(ctx): Promise<Campaign[]> {
    const token = ctx.integration.credentials?.accessToken;
    if (!token) throw new Error('invalid_token: no Meta access token stored');
    let url: string | undefined = `https://graph.facebook.com/${V}/${act(ctx.integration.sourceId)}/campaigns?fields=id,name,status,objective&limit=200&access_token=${encodeURIComponent(token)}`;
    const out: Campaign[] = [];
    let pages = 0;
    while (url && pages++ < 20) {
      const j: any = await fetchJson(url);
      for (const c of j.data ?? []) out.push({ id: String(c.id), name: String(c.name ?? c.id), status: metaCampaignStatus(c.status), ...(c.objective ? { objective: String(c.objective) } : {}) });
      url = j.paging?.next;
    }
    return out;
  },

  async validate(ctx) {
    const token = ctx.integration.credentials?.accessToken;
    if (!token) throw new Error('Missing access token');
    const j = await fetchJson<any>(`https://graph.facebook.com/${V}/${act(ctx.integration.sourceId)}?fields=name,currency,account_status&access_token=${encodeURIComponent(token)}`);
    return { name: j.name, config: { currency: j.currency } };
  },
};
