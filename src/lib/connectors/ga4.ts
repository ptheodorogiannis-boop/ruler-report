// Google Analytics 4 — Data API v1beta (runReport). Written against the public API docs; not exercised
// against a live property in this repo's tests (needs OAuth credentials).
import type { BreakdownRow, Connector, DailyData } from '@/lib/engine/types';
import { fetchJson } from './http';
import { googleAccessToken } from './google';

const METRIC: Record<string, string> = {
  sessions: 'sessions',
  users: 'activeUsers',
  new_users: 'newUsers',
  pageviews: 'screenPageViews',
  engaged_sessions: 'engagedSessions',
  events: 'eventCount',
  session_duration: 'userEngagementDuration',
  view_item: 'itemViewEvents',
  add_to_cart: 'addToCarts',
  begin_checkout: 'checkouts',
  transactions: 'transactions',
  revenue: 'purchaseRevenue',
  conversions: 'keyEvents',
};
// item-scoped metrics are required when the dimension is itemName
const ITEM_METRIC: Record<string, string> = { view_item: 'itemsViewed', add_to_cart: 'itemsAddedToCart', transactions: 'itemsPurchased', revenue: 'itemRevenue' };
const DIM: Record<string, string> = {
  channel: 'sessionDefaultChannelGroup',
  device: 'deviceCategory',
  country: 'country',
  city: 'city',
  source_medium: 'sessionSourceMedium',
  event_name: 'eventName',
  page: 'pagePath',
  landing_page: 'landingPage',
  campaign: 'sessionCampaignName',
  product: 'itemName',
};

const property = (id: string) => `properties/${id.replace(/^properties\//, '')}`;

async function report(ctx: any, body: any) {
  const token = await googleAccessToken(ctx.integration.credentials);
  return fetchJson<any>(`https://analyticsdata.googleapis.com/v1beta/${property(ctx.integration.sourceId)}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const ga4Connector: Connector = {
  id: 'ga4',
  // abandoned_carts is derived (addToCarts - transactions) below
  async daily(ctx, prims, range) {
    const real = prims.filter((p) => p !== 'abandoned_carts');
    const need = new Set(real);
    if (prims.includes('abandoned_carts')) {
      need.add('add_to_cart');
      need.add('transactions');
    }
    const metrics = [...need].filter((p) => METRIC[p]).map((p) => ({ name: METRIC[p] }));
    const out: DailyData = {};
    const j = await report(ctx, { dateRanges: [{ startDate: range.start, endDate: range.end }], dimensions: [{ name: 'date' }], metrics, limit: 10000 });
    const names = (j.metricHeaders ?? []).map((h: any) => h.name as string);
    for (const row of j.rows ?? []) {
      const raw = row.dimensionValues[0].value as string; // YYYYMMDD
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const o: Record<string, number> = {};
      for (const p of need) {
        const idx = names.indexOf(METRIC[p]);
        if (idx >= 0) o[p] = Number(row.metricValues[idx].value);
      }
      if (prims.includes('abandoned_carts')) o.abandoned_carts = Math.max(0, (o.add_to_cart ?? 0) - (o.transactions ?? 0));
      out[date] = o;
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const dim = DIM[dimension];
    if (!dim) return [];
    const useItem = dimension === 'product';
    const map = (p: string) => (useItem ? ITEM_METRIC[p] ?? METRIC[p] : METRIC[p]);
    const metrics = prims.filter((p) => map(p)).map((p) => ({ name: map(p) }));
    const j = await report(ctx, {
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      dimensions: [{ name: dim }],
      metrics,
      orderBys: [{ metric: { metricName: metrics[0]?.name }, desc: true }],
      limit: opts?.limit ?? 100,
    });
    const names = (j.metricHeaders ?? []).map((h: any) => h.name as string);
    return (j.rows ?? []).map((row: any) => {
      const label = row.dimensionValues[0].value as string;
      const values: Record<string, number> = {};
      for (const p of prims) {
        const idx = names.indexOf(map(p));
        if (idx >= 0) values[p] = Number(row.metricValues[idx].value);
      }
      return { key: label, label, values };
    });
  },

  async totals(ctx, prims, range) {
    const metrics = prims.filter((p) => METRIC[p]).map((p) => ({ name: METRIC[p] }));
    const j = await report(ctx, { dateRanges: [{ startDate: range.start, endDate: range.end }], metrics });
    const names = (j.metricHeaders ?? []).map((h: any) => h.name as string);
    const row = j.rows?.[0];
    const out: Record<string, number> = {};
    for (const p of prims) {
      const idx = names.indexOf(METRIC[p]);
      if (idx >= 0 && row) out[p] = Number(row.metricValues[idx].value);
    }
    return out;
  },

  async validate(ctx) {
    const token = await googleAccessToken(ctx.integration.credentials);
    const j = await fetchJson<any>(`https://analyticsdata.googleapis.com/v1beta/${property(ctx.integration.sourceId)}/metadata`, { headers: { authorization: `Bearer ${token}` } });
    if (!j.metrics) throw new Error('Property not accessible');
    return {};
  },
};
