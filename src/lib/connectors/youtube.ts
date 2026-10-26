// YouTube — YouTube Analytics API v2 (reports) + Data API v3 (channel statistics, video titles).
// Written against the public API docs and exercised against a local mock server only (tests/connectors-social.test.ts);
// not run against a live channel in this repo's tests (needs OAuth credentials with youtube.readonly + yt-analytics.readonly).
//
// Things the API cannot give, said once here and in the data note for the slug:
//   • channel impressions / impressions click-through rate are not exposed by the Analytics API → `unsupported`
//   • age and gender come only as the share of views per group (viewerPercentage) → views are scaled by that share
//   • the subscriber count is a current snapshot → the daily series is rebuilt backwards from it using daily gains and losses
import type { BreakdownRow, Connector, DailyData } from '@/lib/engine/types';
import { endpoints } from '@/lib/oauth/endpoints';
import { addDays, eachDay, today } from '@/lib/util/dates';
import { fetchJson } from './http';
import { googleAccessToken } from './google';

/** primitive → Analytics API metric (all additive over days) */
export const YT_METRIC: Record<string, string> = {
  views: 'views',
  watch_time: 'estimatedMinutesWatched',
  new_subs: 'subscribersGained',
  lost_subs: 'subscribersLost',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
};
const ADDITIVE = Object.keys(YT_METRIC);

/** dimension → Analytics API dimension (age and gender go through viewerPercentage, see below) */
const DIM: Record<string, string> = {
  country: 'country',
  traffic_source: 'insightTrafficSourceType',
  device: 'deviceType',
  video: 'video',
  age: 'ageGroup',
  gender: 'gender',
};

const TRAFFIC: Record<string, string> = {
  YT_SEARCH: 'YouTube search',
  RELATED_VIDEO: 'Suggested videos',
  SUBSCRIBER: 'Subscriptions feed',
  YT_CHANNEL: 'Channel pages',
  YT_OTHER_PAGE: 'Other YouTube features',
  EXT_URL: 'External',
  NO_LINK_OTHER: 'Direct or unknown',
  NO_LINK_EMBEDDED: 'Embedded players',
  PLAYLIST: 'Playlists',
  NOTIFICATION: 'Notifications',
  SHORTS: 'Shorts feed',
  ADVERTISING: 'Advertising',
  END_SCREEN: 'End screens',
  HASHTAGS: 'Hashtag pages',
  CAMPAIGN_CARD: 'Cards',
  ANNOTATION: 'Annotations',
  PROMOTED: 'Promoted',
  VIDEO_REMIXES: 'Remixes',
  SOUND_PAGE: 'Sound pages',
  LIVE_REDIRECT: 'Live redirects',
};
const DEVICE: Record<string, string> = { MOBILE: 'Mobile', DESKTOP: 'Desktop', TABLET: 'Tablet', TV: 'TV', GAME_CONSOLE: 'Game console', UNKNOWN_PLATFORM: 'Other' };
const GENDER: Record<string, string> = { female: 'Female', male: 'Male', user_specified: 'Unknown' };
/** `age18-24` → `18-24`, `age65-` → `65+` (the API's ageGroup values) */
export const ageLabel = (key: string) => key.replace(/^age/, '').replace(/-$/, '+').replace(/_/g, '-');

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const headers = async (ctx: any) => ({ authorization: `Bearer ${await googleAccessToken(ctx.integration.credentials)}` });
const channelId = (ctx: any) => String(ctx.integration.sourceId);

interface Report {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}
async function report(ctx: any, params: Record<string, string>): Promise<{ names: string[]; rows: (string | number)[][] }> {
  const qs = new URLSearchParams({ ids: `channel==${channelId(ctx)}`, ...params });
  const j = await fetchJson<Report>(`${endpoints.google.youtubeAnalytics}/reports?${qs}`, { headers: await headers(ctx) });
  return { names: (j.columnHeaders ?? []).map((h) => h.name), rows: j.rows ?? [] };
}

/** Current subscriber count from the Data API, or null when the channel hides it. */
async function subscriberCount(ctx: any): Promise<number | null> {
  const j = await fetchJson<any>(`${endpoints.google.youtube}/channels?${new URLSearchParams({ part: 'statistics', id: channelId(ctx) })}`, { headers: await headers(ctx) });
  const s = j.items?.[0]?.statistics;
  if (!s || s.hiddenSubscriberCount) return null;
  return Number(s.subscriberCount ?? 0);
}

/** Video titles for a list of ids (the Data API takes 50 at a time). */
async function videoTitles(ctx: any, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const j = await fetchJson<any>(`${endpoints.google.youtube}/videos?${new URLSearchParams({ part: 'snippet', id: ids.slice(i, i + 50).join(','), maxResults: '50' })}`, { headers: await headers(ctx) });
    for (const v of j.items ?? []) out[v.id] = v.snippet?.title ?? v.id;
  }
  return out;
}

/** Walk the subscriber count back from today's snapshot using each day's net gain (gained − lost). */
export function rebuildSubscribers(current: number, net: Record<string, number>, days: string[], through: string): Record<string, number> {
  const out: Record<string, number> = {};
  // subs at the end of day d = current − Σ net(x) for every x after d up to `through`
  const all = Object.keys(net).filter((d) => d > days[0]).sort();
  let after = 0;
  let i = all.length - 1;
  for (let k = days.length - 1; k >= 0; k--) {
    const d = days[k];
    while (i >= 0 && all[i] > d) {
      if (all[i] <= through) after += net[all[i]];
      i--;
    }
    out[d] = Math.max(0, current - after);
  }
  return out;
}

export const youtubeConnector: Connector = {
  id: 'youtube',
  // not exposed by the Analytics API; widgets that need them (impressions, impressions click-through rate) say so
  unsupported: ['impressions'],

  async daily(ctx, prims, range): Promise<DailyData> {
    const wantSubs = prims.includes('subscribers');
    const need = new Set(prims.filter((p) => YT_METRIC[p]));
    if (wantSubs) {
      need.add('new_subs');
      need.add('lost_subs');
    }
    const out: DailyData = {};
    if (need.size) {
      const t = today('UTC');
      // the net gains between the end of the range and today are needed to rebuild the snapshot backwards
      const end = wantSubs && t > range.end ? t : range.end;
      const metrics = [...need].map((p) => YT_METRIC[p]);
      const { names, rows } = await report(ctx, { startDate: range.start, endDate: end, dimensions: 'day', metrics: metrics.join(','), sort: 'day' });
      const net: Record<string, number> = {};
      for (const row of rows) {
        const date = String(row[0]);
        const o: Record<string, number> = {};
        for (const p of need) {
          const idx = names.indexOf(YT_METRIC[p]);
          if (idx >= 0) o[p] = Number(row[idx]);
        }
        net[date] = (o.new_subs ?? 0) - (o.lost_subs ?? 0);
        if (date <= range.end) out[date] = o;
      }
      if (wantSubs) {
        const current = await subscriberCount(ctx);
        if (current != null) {
          const days = eachDay(range);
          const subs = rebuildSubscribers(current, net, days, end);
          for (const d of days) (out[d] ??= {}).subscribers = subs[d];
        }
      }
      // the helper columns were fetched only to rebuild subscribers; drop what was not asked for
      for (const d of Object.keys(out)) for (const p of ['new_subs', 'lost_subs']) if (!prims.includes(p)) delete out[d][p];
    } else if (wantSubs) {
      return {};
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const dim = DIM[dimension];
    if (!dim) return [];
    const real = prims.filter((p) => YT_METRIC[p]);
    const limit = Math.min(opts?.limit ?? 50, 200);
    const base = { startDate: range.start, endDate: range.end };

    // age and gender: the API only reports each group's share of views, so scale the channel totals by that share
    if (dimension === 'age' || dimension === 'gender') {
      const metrics = real.length ? real.map((p) => YT_METRIC[p]) : ['views'];
      const [{ names: tn, rows: trows }, share] = await Promise.all([
        report(ctx, { ...base, metrics: metrics.join(',') }),
        report(ctx, { ...base, dimensions: dim, metrics: 'viewerPercentage' }),
      ]);
      const total = trows[0] ?? [];
            return share.rows.map((r) => {
        const key = String(r[0]);
        const pct = Number(r[1]) / 100;
        const values: Record<string, number> = {};
        for (const p of real) values[p] = Math.round(Number(total[tn.indexOf(YT_METRIC[p])] ?? 0) * pct);
        return { key, label: dimension === 'age' ? ageLabel(key) : GENDER[key] ?? key, values };
      });
    }

    // traffic sources and devices only accept views and watch time (any other metric is a 400)
    const narrow = dimension === 'traffic_source' || dimension === 'device';
    const usable = narrow ? real.filter((p) => p === 'views' || p === 'watch_time') : real;
    const metrics = usable.length ? usable : ['views'];
    const sortBy = opts?.sortBy && metrics.includes(opts.sortBy) ? opts.sortBy : metrics[0];
    const { names, rows } = await report(ctx, {
      ...base,
      dimensions: dim,
      metrics: metrics.map((p) => YT_METRIC[p] ?? p).join(','),
      sort: `-${YT_METRIC[sortBy]}`,
      maxResults: String(limit),
    });
    const out: BreakdownRow[] = rows.map((r) => {
      const key = String(r[0]);
      const values: Record<string, number> = {};
      for (const p of real) {
        const idx = names.indexOf(YT_METRIC[p]);
        if (idx >= 0) values[p] = Number(r[idx]);
      }
      const label = dimension === 'country' ? countryName(key) : dimension === 'traffic_source' ? TRAFFIC[key] ?? titleCase(key) : dimension === 'device' ? DEVICE[key] ?? titleCase(key) : key;
      return { key, label, values };
    });
    if (dimension === 'video' && out.length) {
      const titles = await videoTitles(ctx, out.map((r) => r.key));
      for (const r of out) r.label = titles[r.key] ?? r.key;
    }
    return out;
  },

  async validate(ctx) {
    const h = await headers(ctx);
    const j = await fetchJson<any>(`${endpoints.google.youtube}/channels?${new URLSearchParams({ part: 'snippet', id: channelId(ctx) })}`, { headers: h });
    const ch = j.items?.[0];
    if (!ch) throw new Error('Channel not found for this Google account');
    try {
      const y = addDays(today('UTC'), -3);
      await report(ctx, { startDate: addDays(y, -1), endDate: y, metrics: 'views' });
    } catch (e: any) {
      if (/403|forbidden|insufficient/i.test(String(e?.message))) throw new Error("This Google account can't read the channel's analytics — connect with the channel owner or a manager.");
      throw e;
    }
    return { name: ch.snippet?.title };
  },
};

