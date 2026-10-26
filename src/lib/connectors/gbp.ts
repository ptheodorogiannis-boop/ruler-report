// Google Business Profile — Business Profile Performance API v1 (daily metrics, monthly search keywords) and the
// My Business v4 reviews endpoint. Written against the public API docs and exercised against a local mock server only
// (tests/connectors-social.test.ts); not run against a live location (the Business Profile APIs need Google's approval
// of the Cloud project first — see docs/CONNECTORS.md, "Going live").
//
// Notes that matter to the numbers:
//   • the source id is stored as `accounts/<a>/locations/<l>` (the picker); the Performance API wants `locations/<l>`
//     and the reviews endpoint wants the full path, so both are derived from it
//   • days with no activity are omitted by the API and come back as zero
//   • search keywords exist per month only; a keyword below Google's privacy threshold is reported as "less than N"
//   • `rating` is the current average on every day (the API gives no history), `new_reviews` counts reviews by creation date
//   • if the reviews endpoint is not available for the project, rating and new_reviews are left out rather than failing the report
import type { BreakdownRow, Connector, DailyData, DateRange } from '@/lib/engine/types';
import { endpoints } from '@/lib/oauth/endpoints';
import { eachDay } from '@/lib/util/dates';
import { fetchJson } from './http';
import { googleAccessToken } from './google';

/** Performance API daily metrics → primitive (a primitive is the sum of its metrics) */
export const GBP_METRICS: Record<string, string[]> = {
  views_search: ['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'],
  views_maps: ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS'],
  calls: ['CALL_CLICKS'],
  direction_requests: ['BUSINESS_DIRECTION_REQUESTS'],
  website_clicks: ['WEBSITE_CLICKS'],
  messages: ['MESSAGING_CLICKS'], // BUSINESS_CONVERSATIONS is deprecated on the DailyMetric enum
  bookings: ['BUSINESS_BOOKINGS'],
};
/** the four platform × device rows of the "Views by platform and device" chart (labels as in the archetype) */
export const GBP_DEVICE: Record<string, string> = {
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Google Maps (mobile)',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Google Search (mobile)',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Google Maps (desktop)',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Google Search (desktop)',
};
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** `accounts/1/locations/2` | `locations/2` | `2` → the pieces the two APIs want */
export function gbpPaths(sourceId: string): { location: string; account?: string } {
  const loc = /locations\/([^/\s]+)/.exec(sourceId)?.[1] ?? sourceId.trim();
  const acc = /accounts\/([^/\s]+)/.exec(sourceId)?.[1];
  return { location: `locations/${loc}`, account: acc ? `accounts/${acc}` : undefined };
}

const headers = async (ctx: any) => ({ authorization: `Bearer ${await googleAccessToken(ctx.integration.credentials)}` });
const ymd = (d: string) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
const dateKey = (d: { year: number; month: number; day: number }) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** metric → date → value, for the given Performance API metrics */
async function series(ctx: any, metrics: string[], range: DateRange): Promise<Record<string, Record<string, number>>> {
  const { location } = gbpPaths(String(ctx.integration.sourceId));
  const qs = new URLSearchParams();
  for (const m of metrics) qs.append('dailyMetrics', m);
  const s = ymd(range.start);
  const e = ymd(range.end);
  qs.append('dailyRange.start_date.year', String(s.year));
  qs.append('dailyRange.start_date.month', String(s.month));
  qs.append('dailyRange.start_date.day', String(s.day));
  qs.append('dailyRange.end_date.year', String(e.year));
  qs.append('dailyRange.end_date.month', String(e.month));
  qs.append('dailyRange.end_date.day', String(e.day));
  const j = await fetchJson<any>(`${endpoints.google.businessPerformance}/${location}:fetchMultiDailyMetricsTimeSeries?${qs}`, { headers: await headers(ctx) });
  const out: Record<string, Record<string, number>> = {};
  for (const multi of j.multiDailyMetricTimeSeries ?? [])
    for (const m of multi.dailyMetricTimeSeries ?? []) {
      const byDay = (out[m.dailyMetric] ??= {});
      for (const v of m.timeSeries?.datedValues ?? []) if (v.date) byDay[dateKey(v.date)] = Number(v.value ?? 0);
    }
  return out;
}

interface Review {
  createTime?: string;
  updateTime?: string;
  starRating?: string;
}
/** All reviews, newest first, stopping once they are older than `since` (the average comes from the first page). */
async function reviews(ctx: any, since: string): Promise<{ average: number | null; created: string[] }> {
  const { account, location } = gbpPaths(String(ctx.integration.sourceId));
  if (!account) throw new Error('reviews need the account in the source id (accounts/…/locations/…)');
  const created: string[] = [];
  let average: number | null = null;
  let pageToken: string | undefined;
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc', ...(pageToken ? { pageToken } : {}) });
    const j = await fetchJson<any>(`${endpoints.google.businessReviews}/${account}/${location}/reviews?${qs}`, { headers: await headers(ctx) });
    if (i === 0) average = j.averageRating != null ? Number(j.averageRating) : null;
    let stale = 0;
    for (const r of (j.reviews ?? []) as Review[]) {
      const d = r.createTime?.slice(0, 10);
      if (!d) continue;
      if (d >= since) created.push(d);
      // the list is ordered by update time, so a review is only "behind" the range when it was neither created nor edited since
      if ((r.updateTime ?? r.createTime ?? '').slice(0, 10) < since) stale++;
    }
    pageToken = j.nextPageToken;
    if (!pageToken || stale === (j.reviews ?? []).length) break;
  }
  return { average, created };
}

const monthsOf = (r: DateRange): { year: number; month: number }[] => {
  const out: { year: number; month: number }[] = [];
  for (const d of eachDay(r)) {
    const m = { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) };
    if (!out.some((x) => x.year === m.year && x.month === m.month)) out.push(m);
  }
  return out;
};

/** search term → impressions over the months the range touches */
async function keywords(ctx: any, range: DateRange): Promise<Record<string, number>> {
  const { location } = gbpPaths(String(ctx.integration.sourceId));
  const months = monthsOf(range);
  const first = months[0];
  const last = months[months.length - 1];
  const out: Record<string, number> = {};
  let pageToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({
      'monthlyRange.start_month.year': String(first.year),
      'monthlyRange.start_month.month': String(first.month),
      'monthlyRange.end_month.year': String(last.year),
      'monthlyRange.end_month.month': String(last.month),
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const j = await fetchJson<any>(`${endpoints.google.businessPerformance}/${location}/searchkeywords/impressions/monthly?${qs}`, { headers: await headers(ctx) });
    for (const k of j.searchKeywordsCounts ?? []) {
      const v = k.insightsValue ?? {};
      // below the privacy threshold Google reports "less than N" — use N as the closest honest number
      out[k.searchKeyword] = (out[k.searchKeyword] ?? 0) + Number(v.value ?? v.threshold ?? 0);
    }
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export const gbpConnector: Connector = {
  id: 'gbp',

  async daily(ctx, prims, range): Promise<DailyData> {
    const metricPrims = prims.filter((p) => GBP_METRICS[p]);
    const out: DailyData = {};
    if (metricPrims.length) {
      const metrics = [...new Set(metricPrims.flatMap((p) => GBP_METRICS[p]))];
      const data = await series(ctx, metrics, range);
      for (const d of eachDay(range)) {
        const o: Record<string, number> = {};
        for (const p of metricPrims) o[p] = GBP_METRICS[p].reduce((s, m) => s + (data[m]?.[d] ?? 0), 0);
        out[d] = o;
      }
    }
    if (prims.includes('rating') || prims.includes('new_reviews')) {
      try {
        const r = await reviews(ctx, range.start);
        const perDay: Record<string, number> = {};
        for (const d of r.created) perDay[d] = (perDay[d] ?? 0) + 1;
        for (const d of eachDay(range)) {
          const o = (out[d] ??= {});
          if (prims.includes('new_reviews')) o.new_reviews = perDay[d] ?? 0;
          if (prims.includes('rating') && r.average != null) o.rating = r.average;
        }
      } catch {
        /* reviews are optional: the endpoint needs its own approval, and views/actions must not fail with it */
      }
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    if (dimension === 'device') {
      const metrics = Object.keys(GBP_DEVICE);
      const data = await series(ctx, metrics, range);
      return metrics.map((m) => {
        const total = Object.values(data[m] ?? {}).reduce((s, v) => s + v, 0);
        const values: Record<string, number> = {};
        // a row is a surface (Maps or Search) on a device: its impressions are its "views"
        for (const p of prims) values[p] = p === 'views_search' || p === 'views_maps' ? total : 0;
        return { key: m, label: GBP_DEVICE[m], values };
      });
    }
    if (dimension === 'search_term') {
      const counts = await keywords(ctx, range);
      const rows = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([term, n]) => ({ key: term, label: term, values: Object.fromEntries(prims.map((p) => [p, p === 'searches' ? n : 0])) }));
      return opts?.limit ? rows.slice(0, opts.limit) : rows;
    }
    return [];
  },

  async validate(ctx) {
    const { location } = gbpPaths(String(ctx.integration.sourceId));
    const end = new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10);
    try {
      await series(ctx, ['CALL_CLICKS'], { start: end, end });
    } catch (e: any) {
      if (/403|PERMISSION|disabled|not been used|quota/i.test(String(e?.message)))
        throw new Error('Google denied access to the Business Profile Performance API — the Cloud project needs Business Profile API approval (see docs/CONNECTORS.md), and this account must manage the location.');
      throw e;
    }
    return { config: { location } };
  },
};
