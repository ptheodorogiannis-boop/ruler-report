// Facebook Page — Graph API Page Insights (page_media_view era) + the Page's published posts.
// Written against the public Graph API docs and exercised against a local mock server only
// (tests/connectors-social.test.ts); not run against a live Page (needs a Page access token from the Meta connect flow).
//
// What Meta still provides (checked against the docs in Oct 2026) and what it does not:
//   • page_impressions*, page_fans*, page_fan_adds/removes were removed on 2025-11-15 and *_unique impressions on 2025-06-15:
//     views and impressions both come from page_media_view, reach from page_total_media_view_unique
//   • audience demographics (age, gender, country, city, online-by-hour) were removed in 2024: those breakdowns return nothing
//   • link clicks are not available for Pages → `unsupported`; saves are not either, but the top-posts table has a saves column,
//     so saves stay out of `unsupported` (which would block the whole table) and read as empty / 0 (said in the data note)
//   • one invalid metric fails a whole insights request, so every metric is requested on its own and a failing one is skipped
//     (when every requested metric fails — expired token, missing permission — the error is raised so the report says why)
//   • comments, shares and the post count come from the posts list and are dated by the post's creation day
import type { BreakdownRow, Connector, DailyData, DateRange } from '@/lib/engine/types';
import { addDays, eachDay } from '@/lib/util/dates';
import { chunkRange, graphGet, graphPaged, pool, unix } from './metagraph';

/** primitive → Page Insights metric (period=day) */
export const FB_METRIC: Record<string, string> = {
  followers: 'page_follows', // a stock: the value is the follower count at the end of that day
  new_followers: 'page_daily_follows',
  unfollows: 'page_daily_unfollows_unique',
  reach: 'page_total_media_view_unique',
  impressions: 'page_media_view',
  views: 'page_media_view',
  engagements: 'page_post_engagements',
  likes: 'page_actions_post_reactions_total', // all reactions, an object per reaction type
  profile_views: 'page_views_total',
  video_views: 'page_video_views',
};
const POST_PRIMS = ['posts', 'comments', 'shares'];
const WINDOW = 89; // the API allows 90 days per request

const num = (v: any): number => (v && typeof v === 'object' ? Object.values(v).reduce<number>((s, x) => s + num(x), 0) : Number(v ?? 0) || 0);
/** Insights values are stamped with the END of the day they cover: 2026-09-02T07:00:00+0000 is the day of 2026-09-01. */
export const dayOfEnd = (endTime: string): string => new Date(Date.parse(endTime) - 86400_000).toISOString().slice(0, 10);

async function metricSeries(ctx: any, metric: string, range: DateRange): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const w of chunkRange(range, WINDOW)) {
    const j = await graphGet<any>(ctx, `/${ctx.integration.sourceId}/insights`, { metric, period: 'day', since: String(unix(w.start)), until: String(unix(addDays(w.end, 1))) });
    for (const v of j.data?.[0]?.values ?? []) out[dayOfEnd(v.end_time)] = num(v.value);
  }
  return out;
}

interface Post {
  id: string;
  created_time: string;
  message?: string;
  story?: string;
  reactions?: number;
  comments: number;
  shares: number;
}
async function posts(ctx: any, range: DateRange): Promise<Post[]> {
  const rows = await graphPaged<any>(ctx, `/${ctx.integration.sourceId}/published_posts`, {
    fields: 'id,created_time,message,story,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)',
    since: String(unix(range.start)),
    until: String(unix(addDays(range.end, 1))),
    limit: '100',
  });
  return rows.map((r) => ({
    id: String(r.id),
    created_time: String(r.created_time),
    message: r.message ?? r.story,
    reactions: Number(r.reactions?.summary?.total_count ?? 0),
    comments: Number(r.comments?.summary?.total_count ?? 0),
    shares: Number(r.shares?.count ?? 0),
  }));
}

export const facebookConnector: Connector = {
  id: 'facebook',
  unsupported: ['link_clicks'],

  async daily(ctx, prims, range): Promise<DailyData> {
    const out: DailyData = {};
    const set = (d: string, p: string, v: number) => ((out[d] ??= {})[p] = v);
    const metrics = [...new Set(prims.filter((p) => FB_METRIC[p]).map((p) => FB_METRIC[p]))];
    let firstError: unknown;
    let ok = 0;
    const series = await pool(metrics, 4, async (m) => {
      try {
        const s = await metricSeries(ctx, m, range);
        ok++;
        return s;
      } catch (e) {
        firstError ??= e;
        return null;
      }
    });
    if (metrics.length && !ok) throw firstError; // nothing came back: surface why (expired token, permissions…)
    const byMetric = new Map(metrics.map((m, i) => [m, series[i]]));
    for (const p of prims) {
      const s = FB_METRIC[p] ? byMetric.get(FB_METRIC[p]) : null;
      if (s) for (const d of eachDay(range)) if (s[d] != null) set(d, p, s[d]);
    }
    if (prims.some((p) => POST_PRIMS.includes(p))) {
      for (const post of await posts(ctx, range)) {
        const d = post.created_time.slice(0, 10);
        if (prims.includes('posts')) set(d, 'posts', (out[d]?.posts ?? 0) + 1);
        if (prims.includes('comments')) set(d, 'comments', (out[d]?.comments ?? 0) + post.comments);
        if (prims.includes('shares')) set(d, 'shares', (out[d]?.shares ?? 0) + post.shares);
      }
      // a day with no post is a real zero, not a missing value
      for (const d of eachDay(range)) for (const p of prims.filter((x) => POST_PRIMS.includes(x))) if (out[d]?.[p] == null) set(d, p, 0);
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    // demographic breakdowns no longer exist for Pages; only the post table is available
    if (dimension !== 'post') return [];
    const list = await posts(ctx, range);
    const rows: BreakdownRow[] = list.map((p) => {
      const likes = p.reactions ?? 0;
      return {
        key: p.id,
        label: (p.message ?? p.id).replace(/\s+/g, ' ').slice(0, 70),
        values: { likes, comments: p.comments, shares: p.shares, engagements: likes + p.comments + p.shares, saves: 0, reach: 0, impressions: 0 },
      };
    });
    rows.sort((a, b) => b.values.engagements - a.values.engagements);
    const top = rows.slice(0, 15);
    // reach and impressions are per-post insights: one call each for the posts that will actually be shown
    await pool(top, 4, async (row) => {
      try {
        const j = await graphGet<any>(ctx, `/${row.key}/insights`, { metric: 'post_total_media_view_unique,post_media_view' });
        for (const m of j.data ?? []) {
          if (m.name === 'post_total_media_view_unique') row.values.reach = num(m.values?.[0]?.value);
          if (m.name === 'post_media_view') row.values.impressions = num(m.values?.[0]?.value);
        }
      } catch {
        /* a post without insights keeps its zeros */
      }
    });
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : 'engagements';
    rows.sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  },

  /** reach is not additive across days: ask Meta for the period total */
  async totals(ctx, prims, range) {
    const out: Record<string, number> = {};
    if (!prims.includes('reach')) return out;
    try {
      const j = await graphGet<any>(ctx, `/${ctx.integration.sourceId}/insights`, { metric: FB_METRIC.reach, period: 'total_over_range', since: String(unix(range.start)), until: String(unix(addDays(range.end, 1))) });
      const v = j.data?.[0]?.values?.[0]?.value;
      if (v != null) out.reach = num(v);
    } catch {
      /* no period total available: the report shows an empty value rather than an overcounted sum */
    }
    return out;
  },

  async validate(ctx) {
    const j = await graphGet<any>(ctx, `/${ctx.integration.sourceId}`, { fields: 'name,followers_count,fan_count' });
    return { name: j.name };
  },
};
