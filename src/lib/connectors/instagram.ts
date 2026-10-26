// Instagram Business — Instagram Graph API (insights + media) through Facebook Login.
// Written against the public API docs and exercised against a local mock server only
// (tests/connectors-social.test.ts); not run against a live account (needs the Meta connect flow's Page token and an
// Instagram Business or Creator account linked to a Page).
//
// How the account metrics are fetched, and what they cost:
//   • reach, views, interactions, likes, comments, saves, shares and link taps are `total_value` metrics: the API has no
//     daily series for them, so each day is one call over a one-day window (batched six at a time). User metrics are kept
//     for about 90 days, so older days are skipped
//   • `views` replaced `impressions` (deprecated 2025-04-21): both primitives read it
//   • follower_count is the NET change per day and followers_count is only a snapshot → the follower series is rebuilt
//     backwards from the snapshot; `new_followers` therefore carries the net daily change and `unfollows` is unavailable
//   • audience breakdowns come from follower_demographics (lifetime, top 45 values, needs 100+ followers)
//   • profile_views is requested with the rest and dropped for the run if the API rejects it
import type { BreakdownRow, Connector, DailyData, DateRange } from '@/lib/engine/types';
import { addDays, eachDay, today } from '@/lib/util/dates';
import { HttpError } from './http';
import { graphGet, graphPaged, pool, unix } from './metagraph';
import { dayOfEnd } from './facebook';
import { countryName, rebuildSubscribers } from './youtube';

/** primitive → Instagram insights metric (total_value, period=day) */
export const IG_METRIC: Record<string, string> = {
  reach: 'reach',
  impressions: 'views',
  views: 'views',
  engagements: 'total_interactions',
  likes: 'likes',
  comments: 'comments',
  saves: 'saves',
  shares: 'shares',
  link_clicks: 'profile_links_taps',
  profile_views: 'profile_views',
};
/** metrics the API may reject on some accounts; they are dropped for the run instead of failing it */
const OPTIONAL = new Set(['profile_views']);
const RETENTION_DAYS = 90;
const GENDER: Record<string, string> = { F: 'Female', M: 'Male', U: 'Unknown' };
const CONTENT_TYPE: Record<string, string> = { REEL: 'Reel', POST: 'Image', CAROUSEL_CONTAINER: 'Carousel', STORY: 'Story', AD: 'Ad' };

const id = (ctx: any) => String(ctx.integration.sourceId);
/** the part of a range the API still holds */
function clamp(r: DateRange): DateRange | null {
  const floor = addDays(today('UTC'), -RETENTION_DAYS);
  const start = r.start < floor ? floor : r.start;
  return start > r.end ? null : { start, end: r.end };
}
const window = (r: DateRange) => ({ since: String(unix(r.start)), until: String(unix(addDays(r.end, 1))) });

/** metric name → value, from a total_value response */
function totalValues(j: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of j.data ?? []) out[m.name] = Number(m.total_value?.value ?? 0);
  return out;
}

async function dayMetrics(ctx: any, day: string, metrics: string[]): Promise<Record<string, number>> {
  return totalValues(await graphGet(ctx, `/${id(ctx)}/insights`, { metric: metrics.join(','), metric_type: 'total_value', period: 'day', ...window({ start: day, end: day }) }));
}

/** net follower change per day (follower_count, a time series), through `end` */
async function netFollowers(ctx: any, range: DateRange): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let start = range.start; start <= range.end; start = addDays(start, 30)) {
    const end = addDays(start, 29) < range.end ? addDays(start, 29) : range.end;
    try {
      const j = await graphGet<any>(ctx, `/${id(ctx)}/insights`, { metric: 'follower_count', period: 'day', ...window({ start, end }) });
      for (const v of j.data?.[0]?.values ?? []) out[dayOfEnd(v.end_time)] = Number(v.value ?? 0);
    } catch {
      /* follower history is optional (accounts under 100 followers have none) */
    }
  }
  return out;
}

interface Media {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}
const media = (ctx: any, range: DateRange) =>
  graphPaged<Media>(ctx, `/${id(ctx)}/media`, { fields: 'id,caption,media_type,media_product_type,timestamp,like_count,comments_count', limit: '50', ...window(range) }, 20);

export const instagramConnector: Connector = {
  id: 'instagram',
  unsupported: ['unfollows', 'video_views'],

  async daily(ctx, prims, range): Promise<DailyData> {
    const out: DailyData = {};
    const set = (d: string, p: string, v: number) => ((out[d] ??= {})[p] = v);

    const metrics = [...new Set(prims.filter((p) => IG_METRIC[p]).map((p) => IG_METRIC[p]))];
    const live = clamp(range);
    if (metrics.length && live) {
      let active = metrics;
      let firstError: unknown;
      let ok = 0;
      const days = eachDay(live);
      const results = await pool(days, 6, async (d) => {
        try {
          let r: Record<string, number>;
          try {
            r = await dayMetrics(ctx, d, active);
          } catch (e) {
            // one optional metric the API rejects must not take the others down with it
            const drop = active.filter((m) => !OPTIONAL.has(m));
            if (e instanceof HttpError && e.status === 400 && drop.length < active.length && drop.length) {
              active = drop;
              r = await dayMetrics(ctx, d, active);
            } else throw e;
          }
          ok++;
          return r;
        } catch (e) {
          firstError ??= e;
          return null;
        }
      });
      if (!ok) throw firstError;
      days.forEach((d, i) => {
        const r = results[i];
        if (!r) return;
        for (const p of prims) if (IG_METRIC[p] && r[IG_METRIC[p]] != null) set(d, p, r[IG_METRIC[p]]);
      });
    }

    if (prims.includes('posts')) {
      const ms = await media(ctx, range);
      const per: Record<string, number> = {};
      for (const m of ms) per[m.timestamp.slice(0, 10)] = (per[m.timestamp.slice(0, 10)] ?? 0) + 1;
      for (const d of eachDay(range)) set(d, 'posts', per[d] ?? 0);
    }

    if (prims.includes('followers') || prims.includes('new_followers')) {
      const t = today('UTC');
      const through = t > range.end ? t : range.end;
      const net = await netFollowers(ctx, { start: range.start, end: through });
      if (prims.includes('new_followers')) for (const d of eachDay(range)) if (net[d] != null) set(d, 'new_followers', net[d]);
      if (prims.includes('followers')) {
        const snap = (await graphGet<any>(ctx, `/${id(ctx)}`, { fields: 'followers_count' })).followers_count;
        if (snap != null && Object.keys(net).length) {
          const days = eachDay(range);
          const stock = rebuildSubscribers(Number(snap), net, days, through);
          for (const d of days) set(d, 'followers', stock[d]);
        }
      }
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const rowsFrom = (j: any) => (j.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) as { dimension_values: string[]; value: number }[];

    if (['age', 'gender', 'country', 'city'].includes(dimension)) {
      const base = { metric: 'follower_demographics', metric_type: 'total_value', period: 'lifetime', breakdown: dimension };
      let j: any;
      try {
        j = await graphGet(ctx, `/${id(ctx)}/insights`, base);
      } catch (e) {
        if (!(e instanceof HttpError && e.status === 400)) throw e;
        j = await graphGet(ctx, `/${id(ctx)}/insights`, { ...base, timeframe: 'this_month' });
      }
      return rowsFrom(j)
        .map((r) => {
          const key = String(r.dimension_values?.[0] ?? '');
          const label = dimension === 'gender' ? GENDER[key] ?? key : dimension === 'country' ? countryName(key) : dimension === 'city' ? key.split(',')[0].trim() : key;
          return { key, label, values: Object.fromEntries(prims.map((p) => [p, p === 'reach' ? Number(r.value) : 0])) };
        })
        .sort((a, b) => (b.values.reach ?? 0) - (a.values.reach ?? 0));
    }

    if (dimension === 'content_type') {
      const live = clamp(range);
      if (!live) return [];
      const j = await graphGet<any>(ctx, `/${id(ctx)}/insights`, { metric: 'total_interactions', metric_type: 'total_value', period: 'day', breakdown: 'media_product_type', ...window(live) });
      return rowsFrom(j).map((r) => {
        const key = String(r.dimension_values?.[0] ?? '');
        return { key, label: CONTENT_TYPE[key] ?? key, values: Object.fromEntries(prims.map((p) => [p, p === 'engagements' ? Number(r.value) : 0])) };
      });
    }

    if (dimension === 'post') {
      const ms = await media(ctx, range);
      const rows: BreakdownRow[] = ms.map((m) => {
        const likes = Number(m.like_count ?? 0);
        const comments = Number(m.comments_count ?? 0);
        return {
          key: m.id,
          label: (m.caption ?? `${m.media_product_type ?? m.media_type ?? 'Post'} · ${m.timestamp.slice(0, 10)}`).replace(/\s+/g, ' ').slice(0, 70),
          values: { likes, comments, engagements: likes + comments, shares: 0, saves: 0, reach: 0, impressions: 0 },
        };
      });
      rows.sort((a, b) => b.values.engagements - a.values.engagements);
      await pool(rows.slice(0, 15), 4, async (row) => {
        try {
          const j = await graphGet<any>(ctx, `/${row.key}/insights`, { metric: 'reach,views,saved,shares,total_interactions' });
          const v: Record<string, number> = {};
          for (const m of j.data ?? []) v[m.name] = Number(m.values?.[0]?.value ?? 0);
          row.values.reach = v.reach ?? 0;
          row.values.impressions = v.views ?? 0;
          row.values.saves = v.saved ?? 0;
          row.values.shares = v.shares ?? 0;
          if (v.total_interactions != null) row.values.engagements = v.total_interactions;
        } catch {
          /* stories and carousel children have no insights; the row keeps its public counts */
        }
      });
      const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : 'engagements';
      rows.sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
      return opts?.limit ? rows.slice(0, opts.limit) : rows;
    }
    return [];
  },

  /** reach is not additive across days: ask for one total over the whole period */
  async totals(ctx, prims, range) {
    const out: Record<string, number> = {};
    const live = clamp(range);
    if (!prims.includes('reach') || !live) return out;
    try {
      const r = totalValues(await graphGet(ctx, `/${id(ctx)}/insights`, { metric: 'reach', metric_type: 'total_value', period: 'day', ...window(live) }));
      if (r.reach != null) out.reach = r.reach;
    } catch {
      /* no period total available: leave the value empty instead of an overcounted sum */
    }
    return out;
  },

  async validate(ctx) {
    const j = await graphGet<any>(ctx, `/${id(ctx)}`, { fields: 'username,name,followers_count' });
    return { name: j.username ? `@${j.username}` : j.name };
  },
};
