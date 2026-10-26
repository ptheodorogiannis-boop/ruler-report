// Facebook Page, Instagram, YouTube and Google Business Profile connectors against local mock servers
// (every provider host is repointed through oauth/endpoints). End to end: connectIntegration → resolveWidget, so the
// archetype's own widgets (stock values, follower growth, ordered breakdowns, tables) are what is asserted.
// Nothing here talks to Meta or Google.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { findWidget } from '../src/lib/catalog/build';
import { toCtx } from '../src/lib/engine/report';
import { FetchSession, resolveWidget } from '../src/lib/engine/resolve';
import { connectIntegration } from '../src/lib/services/integrations';
import { endpoints } from '../src/lib/oauth/endpoints';
import { addDays, diffDays, eachDay, today } from '../src/lib/util/dates';
import { rebuildSubscribers, ageLabel } from '../src/lib/connectors/youtube';
import { gbpPaths } from '../src/lib/connectors/gbp';
import { dayOfEnd } from '../src/lib/connectors/facebook';
import { makeCompany } from './helpers';

// a week that ended 5 days ago: inside Instagram's 90-day window, and with days between its end and today
const end = addDays(today('UTC'), -5);
const range = { start: addDays(end, -6), end };
const days = eachDay(range);
const idx = (d: string) => diffDays('2026-01-01', d);
const dayOf = (unixSec: string | null) => new Date(Number(unixSec) * 1000).toISOString().slice(0, 10);

const seen: { path: string; q: URLSearchParams; auth?: string }[] = [];
const flags = { rejectProfileViews: false, reviewsDown: false };
let server: http.Server;
let base = '';

const reply = (res: http.ServerResponse, status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

// ───────────── mock values (also used for the expectations) ─────────────
const fbViews = (d: string) => 100 + (idx(d) % 5);
const fbFollowers = (d: string) => 1000 + idx(d);
const igViews = (d: string) => 120 + (idx(d) % 3);

function fbInsights(q: URLSearchParams) {
  const metric = q.get('metric')!;
  if (q.get('period') === 'total_over_range') return { data: [{ name: metric, period: 'total_over_range', values: [{ value: 321 }] }] };
  const from = dayOf(q.get('since'));
  const to = dayOf(q.get('until')); // exclusive
  const values: any[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const value =
      metric === 'page_media_view' ? fbViews(d) : metric === 'page_follows' ? fbFollowers(d) : metric === 'page_actions_post_reactions_total' ? { like: 5, love: 2 } : metric === 'page_daily_follows' ? 3 : metric === 'page_daily_unfollows_unique' ? 1 : metric === 'page_total_media_view_unique' ? 40 : metric === 'page_post_engagements' ? 10 : 7;
    values.push({ value, end_time: `${addDays(d, 1)}T07:00:00+0000` });
  }
  return { data: [{ name: metric, period: 'day', values }] };
}

function igTotals(q: URLSearchParams) {
  const metrics = q.get('metric')!.split(',');
  const from = dayOf(q.get('since'));
  const span = diffDays(from, dayOf(q.get('until')));
  const val = (m: string) =>
    m === 'reach' ? (span > 1 ? 77 : 50) : m === 'views' ? igViews(from) : m === 'total_interactions' ? 15 : m === 'likes' ? 10 : m === 'comments' ? 2 : m === 'saves' ? 1 : m === 'shares' ? 1 : m === 'profile_links_taps' ? 3 : 9;
  const breakdown = q.get('breakdown');
  if (breakdown === 'media_product_type')
    return { data: [{ name: 'total_interactions', total_value: { value: 60, breakdowns: [{ dimension_keys: ['media_product_type'], results: [{ dimension_values: ['REEL'], value: 40 }, { dimension_values: ['POST'], value: 20 }] }] } }] };
  if (q.get('metric') === 'follower_demographics') {
    const res: Record<string, [string, number][]> = {
      age: [['18-24', 30], ['25-34', 70]],
      gender: [['F', 60], ['M', 40]],
      country: [['GR', 80], ['CY', 20]],
      city: [['Athens, Attiki, Greece', 55], ['Limassol, Cyprus', 15]],
    };
    return { data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ dimension_keys: [breakdown], results: res[breakdown!].map(([k, v]) => ({ dimension_values: [k], value: v })) }] } }] };
  }
  return { data: metrics.map((m) => ({ name: m, period: 'day', total_value: { value: val(m) } })) };
}

before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const q = u.searchParams;
    seen.push({ path: u.pathname, q, auth: req.headers.authorization });
    const p = u.pathname;
    const bearer = req.headers.authorization;

    // ── Meta Graph (tokens: "tok" works, "bad" is expired)
    if (p.startsWith('/graph/')) {
      if (bearer === 'Bearer bad') return reply(res, 400, { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException' } });
      if (bearer !== 'Bearer tok') return reply(res, 401, { error: { message: 'no token' } });
      const [, , id, edge] = p.split('/');
      if (id === 'PAGE1' && edge === 'insights') {
        if (q.get('metric') === 'page_video_views') return reply(res, 400, { error: { message: '(#100) The value must be a valid insights metric' } });
        return reply(res, 200, fbInsights(q));
      }
      if (id === 'PAGE1' && edge === 'published_posts')
        return reply(res, 200, {
          data: [
            { id: 'p1', created_time: `${addDays(end, -1)}T10:00:00+0000`, message: 'Spring launch', reactions: { summary: { total_count: 20 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } },
            { id: 'p2', created_time: `${addDays(end, -3)}T10:00:00+0000`, message: 'Behind the scenes', reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } } },
          ],
        });
      if (id === 'PAGE1') return reply(res, 200, { name: 'Acme Page', followers_count: 1200 });
      if ((id === 'p1' || id === 'p2') && edge === 'insights')
        return reply(res, 200, { data: [{ name: 'post_total_media_view_unique', values: [{ value: id === 'p1' ? 80 : 30 }] }, { name: 'post_media_view', values: [{ value: id === 'p1' ? 200 : 60 }] }] });
      if (id === 'IG1' && edge === 'insights') {
        const metric = q.get('metric')!;
        if (metric === 'follower_count') {
          const from = dayOf(q.get('since'));
          const to = dayOf(q.get('until'));
          const values: any[] = [];
          for (let d = from; d < to; d = addDays(d, 1)) values.push({ value: 2, end_time: `${addDays(d, 1)}T07:00:00+0000` });
          return reply(res, 200, { data: [{ name: 'follower_count', period: 'day', values }] });
        }
        if (flags.rejectProfileViews && metric.includes('profile_views')) return reply(res, 400, { error: { message: 'metric[profile_views] is not supported' } });
        return reply(res, 200, igTotals(q));
      }
      if (id === 'IG1' && edge === 'media')
        return reply(res, 200, {
          data: [
            { id: 'm1', caption: 'Reel one', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: `${addDays(end, -2)}T12:00:00+0000`, like_count: 30, comments_count: 4 },
            { id: 'm2', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: `${addDays(end, -4)}T12:00:00+0000`, like_count: 8, comments_count: 1 },
          ],
        });
      if (id === 'IG1') return reply(res, 200, { username: 'acme', followers_count: 5000 });
      if ((id === 'm1' || id === 'm2') && edge === 'insights')
        return reply(res, 200, { data: ['reach', 'views', 'saved', 'shares', 'total_interactions'].map((n, i) => ({ name: n, values: [{ value: (id === 'm1' ? 10 : 1) * (i + 1) }] })) });
    }

    // ── Google (token "at")
    if (/^\/(yta|yt|gbp|gbpv4)\//.test(p)) {
      if (bearer !== 'Bearer at') return reply(res, 401, { error: { message: 'bad bearer' } });
      if (p === '/yt/channels') return reply(res, 200, q.get('part') === 'statistics' ? { items: [{ statistics: { subscriberCount: '1000' } }] } : { items: [{ id: 'UC1', snippet: { title: 'Acme TV' } }] });
      if (p === '/yt/videos') return reply(res, 200, { items: q.get('id')!.split(',').map((id) => ({ id, snippet: { title: `Title of ${id}` } })) });
      if (p === '/yta/reports') {
        if (q.get('ids') !== 'channel==UC1') return reply(res, 403, { error: { message: 'Forbidden' } });
        const metrics = q.get('metrics')!.split(',');
        const dim = q.get('dimensions');
        const val: Record<string, number> = { views: 100, estimatedMinutesWatched: 250, subscribersGained: 5, subscribersLost: 1, likes: 7, comments: 2, shares: 1, viewerPercentage: 0 };
        const headers = (dim ? [dim] : []).concat(metrics).map((name) => ({ name }));
        if (dim === 'day') {
          const rows: any[] = [];
          for (let d = q.get('startDate')!; d <= q.get('endDate')!; d = addDays(d, 1)) rows.push([d, ...metrics.map((m) => val[m])]);
          return reply(res, 200, { columnHeaders: headers, rows });
        }
        if (dim === 'ageGroup') return reply(res, 200, { columnHeaders: headers, rows: [['age18-24', 60], ['age65-', 40]] });
        if (dim === 'insightTrafficSourceType') {
          if (metrics.some((m) => !['views', 'estimatedMinutesWatched', 'engagedViews'].includes(m))) return reply(res, 400, { error: { message: 'The query is not supported' } });
          return reply(res, 200, { columnHeaders: headers, rows: [['YT_SEARCH', 400, 900], ['RELATED_VIDEO', 300, 700]].map((r) => r.slice(0, 1 + metrics.length)) });
        }
        if (dim === 'country') return reply(res, 200, { columnHeaders: headers, rows: [['GR', 500, 1000], ['CY', 200, 400]].map((r) => r.slice(0, 1 + metrics.length)) });
        if (dim === 'video') return reply(res, 200, { columnHeaders: headers, rows: [['v1', 400], ['v2', 300]].map((r) => [r[0], ...metrics.map(() => r[1])]) });
        return reply(res, 200, { columnHeaders: headers, rows: [metrics.map((m) => (m === 'views' ? 700 : val[m] * 7))] }); // channel totals
      }
      if (p === '/gbp/locations/123:fetchMultiDailyMetricsTimeSeries') {
        const g = (k: string) => q.get(k)!;
        const from = `${g('dailyRange.start_date.year')}-${g('dailyRange.start_date.month').padStart(2, '0')}-${g('dailyRange.start_date.day').padStart(2, '0')}`;
        const to = `${g('dailyRange.end_date.year')}-${g('dailyRange.end_date.month').padStart(2, '0')}-${g('dailyRange.end_date.day').padStart(2, '0')}`;
        const per: Record<string, number> = { BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 10, BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 20, BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 5, BUSINESS_IMPRESSIONS_MOBILE_MAPS: 15, CALL_CLICKS: 3, WEBSITE_CLICKS: 4, BUSINESS_DIRECTION_REQUESTS: 2, MESSAGING_CLICKS: 1, BUSINESS_BOOKINGS: 0 };
        const asked = q.getAll('dailyMetrics');
        if (asked.includes('BUSINESS_CONVERSATIONS')) return reply(res, 400, { error: { message: 'deprecated metric' } });
        return reply(res, 200, {
          multiDailyMetricTimeSeries: [
            {
              dailyMetricTimeSeries: asked.map((m) => {
                const datedValues: any[] = [];
                for (let d = from; d <= to; d = addDays(d, 1)) {
                  if (!per[m] || d === days[3]) continue; // zero days are omitted by the API; days[3] is a quiet day
                  datedValues.push({ date: { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) }, value: String(per[m]) });
                }
                return { dailyMetric: m, timeSeries: { datedValues } };
              }),
            },
          ],
        });
      }
      if (p === '/gbp/locations/123/searchkeywords/impressions/monthly')
        return reply(res, 200, { searchKeywordsCounts: [{ searchKeyword: 'dentist athens', insightsValue: { value: '120' } }, { searchKeyword: 'cheap dentist', insightsValue: { threshold: '15' } }] });
      if (p === '/gbpv4/accounts/9/locations/123/reviews') {
        if (flags.reviewsDown) return reply(res, 403, { error: { message: 'Business Profile API has not been approved' } });
        return reply(res, 200, {
          averageRating: 4.5,
          totalReviewCount: 3,
          reviews: [
            { starRating: 'FIVE', createTime: `${addDays(end, -1)}T09:00:00Z` },
            { starRating: 'FOUR', createTime: `${addDays(end, -2)}T09:00:00Z` },
            { starRating: 'FIVE', createTime: `${addDays(range.start, -60)}T09:00:00Z` },
          ],
        });
      }
    }
    reply(res, 404, { error: { message: `no mock for ${p}` } });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  endpoints.meta.graph = `${base}/graph`;
  endpoints.google.youtubeAnalytics = `${base}/yta`;
  endpoints.google.youtube = `${base}/yt`;
  endpoints.google.businessPerformance = `${base}/gbp`;
  endpoints.google.businessReviews = `${base}/gbpv4`;
});
after(() => server.close());

async function connect(slug: string, sourceId: string, accessToken: string) {
  const { company, project } = await makeCompany();
  const row = await connectIntegration({ companyId: company.id, projectId: project.id, slug, sourceId, credentials: { accessToken } });
  const get = async (key: string, r = range): Promise<any> => {
    const widget = findWidget(slug, key, row.config as any);
    assert.ok(widget, `no widget ${key} for ${slug}`);
    return resolveWidget({ integration: toCtx(row, project), widget, range: r, comparison: null, session: new FetchSession() });
  };
  return { row, get };
}

// ═════════════════════════ Facebook Page ═════════════════════════
test('Facebook Page: connect fills the name; insights, stock followers, reactions and posts come through the archetype widgets', async () => {
  const { row, get } = await connect('facebook', 'PAGE1', 'tok');
  assert.equal(row.name, 'Acme Page');

  assert.equal((await get('views')).value, days.reduce((s, d) => s + fbViews(d), 0));
  assert.equal((await get('impressions')).value, days.reduce((s, d) => s + fbViews(d), 0), 'impressions and views both read page_media_view');
  assert.equal((await get('likes')).value, 7 * 7, 'reactions object summed per day');
  assert.equal((await get('new_followers')).value, 3 * 7);
  assert.equal((await get('unfollows')).value, 1 * 7);

  // stock: the last day's value, and growth = last − first
  assert.equal((await get('followers')).value, fbFollowers(end));
  assert.equal((await get('follower_growth')).value, fbFollowers(end) - fbFollowers(range.start));
  const followers = await get('followers_by_date');
  assert.equal(followers.labels.length, 7);
  assert.deepEqual(followers.series[0], days.map(fbFollowers));

  // reach is a period total from the API, not the sum of days
  assert.equal((await get('reach')).value, 321);
  assert.ok(seen.some((s) => s.q.get('period') === 'total_over_range'));

  // posts list: comments, shares, count by creation day
  assert.equal((await get('comments')).value, 4);
  assert.equal((await get('shares')).value, 2);
  assert.equal((await get('posts')).value, 2);
});

test('Facebook Page: a metric Meta rejects only affects its own widget; removed features say so instead of failing', async () => {
  const { get } = await connect('facebook', 'PAGE1', 'tok');
  // page_video_views is rejected by the mock: that widget shows Meta's reason, the rest of the report is unaffected
  const video = await get('video_views');
  assert.equal(video.type, 'error');
  assert.match(video.message, /valid insights metric/);
  assert.equal((await get('views')).type, 'number');
  // link clicks are not provided for Pages at all
  assert.equal((await get('link_clicks')).code, 'invalid_metrics_combination');
  // saves are not provided either, but stay readable so the top-posts table keeps its column: empty, not an error
  const saves = await get('saves');
  assert.equal(saves.type, 'number');
  assert.ok(saves.value == null || saves.value === 0);
  // demographics were removed by Meta: an empty chart, not an error
  const age = await get('audience_age');
  assert.equal(age.type, 'chart');
  assert.equal(age.labels.length, 0);
});

test('Facebook Page: top posts table has counts from the list and reach/impressions from per-post insights', async () => {
  const { get } = await connect('facebook', 'PAGE1', 'tok');
  const t = await get('top_posts');
  assert.equal(t.type, 'table');
  assert.equal(t.rows[0][0], 'Spring launch', 'sorted by engagements');
  const col = (name: string) => t.columns.indexOf(name);
  assert.equal(t.rows[0][col('reach')], 80);
  assert.equal(t.rows[0][col('impressions')], 200);
  assert.equal(t.rows[0][col('likes')], 20);
  assert.equal(t.rows[0][col('engagements')], 25);
});

test('Facebook Page: an expired token surfaces as a reconnect error, and the token travels in the header', async () => {
  const { get } = await connect('facebook', 'PAGE1', 'tok');
  const { row } = await connect('facebook', 'PAGE1', 'tok');
  assert.ok(seen.every((s) => !s.q.has('access_token')), 'the token is never put in the URL');
  const bad = await (async () => {
    const { company, project } = await makeCompany();
    const r = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook', sourceId: 'PAGE1', credentials: { accessToken: 'tok' }, skipValidation: true });
    // swap in the expired token after connecting
    const { db } = await import('../src/lib/db');
    const { encryptJson } = await import('../src/lib/crypto');
    const upd = await db.integration.update({ where: { id: r.id }, data: { credentials: encryptJson({ accessToken: 'bad' }) } });
    return resolveWidget({ integration: toCtx(upd, project), widget: findWidget('facebook', 'views', {})!, range, comparison: null, session: new FetchSession() }) as any;
  })();
  assert.equal(bad.type, 'error');
  assert.equal(bad.code, 'expired_token');
  void get;
  void row;
});

// ═════════════════════════ Instagram ═════════════════════════
test('Instagram: daily total_value calls, views for impressions, followers rebuilt from the snapshot', async () => {
  const { row, get } = await connect('instagram_business', 'IG1', 'tok');
  assert.equal(row.name, '@acme');

  assert.equal((await get('views')).value, days.reduce((s, d) => s + igViews(d), 0));
  assert.equal((await get('impressions')).value, days.reduce((s, d) => s + igViews(d), 0));
  assert.equal((await get('engagements')).value, 15 * 7);
  assert.equal((await get('likes')).value, 10 * 7);
  assert.equal((await get('link_clicks')).value, 3 * 7);
  assert.equal((await get('profile_views')).value, 9 * 7);
  // one call per day, one-day windows
  const dayCalls = seen.filter((s) => s.path === '/graph/IG1/insights' && s.q.get('metric_type') === 'total_value' && s.q.get('metric')!.includes('views'));
  assert.ok(dayCalls.every((c) => diffDays(dayOf(c.q.get('since')), dayOf(c.q.get('until'))) === 1));

  // reach: one total over the period (77), not 7 × 50
  assert.equal((await get('reach')).value, 77);

  // followers: snapshot 5000 minus the net gains after the last day (2 a day, from end+1 through today)
  const after = diffDays(end, today('UTC'));
  assert.equal((await get('followers')).value, 5000 - 2 * after);
  assert.equal((await get('new_followers')).value, 2 * 7);
  assert.equal((await get('follower_growth')).value, 2 * 6, 'last − first over the week');

  assert.equal((await get('posts')).value, 2);
});

test('Instagram: a rejected optional metric (profile_views) is dropped for the run, the rest still load', async () => {
  flags.rejectProfileViews = true;
  try {
    const { get } = await connect('instagram_business', 'IG1', 'tok');
    assert.equal((await get('likes')).value, 10 * 7);
    assert.equal((await get('engagements')).value, 15 * 7);
  } finally {
    flags.rejectProfileViews = false;
  }
});

test('Instagram: audience breakdowns, content type and the top posts table', async () => {
  const { get } = await connect('instagram_business', 'IG1', 'tok');
  const age = await get('audience_age');
  assert.deepEqual(age.labels, ['25-34', '18-24'], 'largest first');
  const gender = await get('audience_gender');
  assert.deepEqual(gender.labels.sort(), ['Female', 'Male']);
  const country = await get('audience_country');
  assert.deepEqual(country.labels, ['Greece', 'Cyprus']);
  const city = await get('audience_city');
  assert.deepEqual(city.labels, ['Athens', 'Limassol']);
  const ct = await get('engagement_by_content_type');
  assert.deepEqual(ct.labels.sort(), ['Image', 'Reel']);

  const t = await get('top_posts');
  assert.equal(t.rows[0][0], 'Reel one');
  const col = (n: string) => t.columns.indexOf(n);
  assert.equal(t.rows[0][col('reach')], 10);
  assert.equal(t.rows[0][col('saves')], 30);

  // not available on Instagram
  assert.equal((await get('unfollows')).code, 'invalid_metrics_combination');
  assert.equal((await get('video_views')).code, 'invalid_metrics_combination');
});

// ═════════════════════════ YouTube ═════════════════════════
test('YouTube: totals, rebuilt subscriber series, and the metrics the API cannot give', async () => {
  const { row, get } = await connect('youtube', 'UC1', 'at');
  assert.equal(row.name, 'Acme TV');

  assert.equal((await get('views')).value, 700);
  assert.equal((await get('watch_time')).value, 250 * 7);
  assert.equal((await get('new_subs')).value, 35);
  assert.equal((await get('lost_subs')).value, 7);
  assert.equal((await get('likes')).value, 49);

  // 1000 subscribers today, net +4 a day: at the end of the range = 1000 − 4 × (days from end to today)
  const after = diffDays(end, today('UTC'));
  assert.equal((await get('subscribers')).value, 1000 - 4 * after);
  const subs = await get('subscribers_by_date');
  assert.equal(subs.labels.length, 7);
  assert.equal(subs.series[0][6] - subs.series[0][0], 4 * 6);

  // the Analytics API has no channel impressions: impressions and the click-through rate say so
  assert.equal((await get('impressions')).code, 'invalid_metrics_combination');
  assert.equal((await get('ctr')).code, 'invalid_metrics_combination');
});

test('YouTube: breakdowns map to the archetype labels; age and gender scale the views by their share', async () => {
  const { get } = await connect('youtube', 'UC1', 'at');
  const country = await get('views_by_country');
  assert.deepEqual(country.labels, ['Greece', 'Cyprus']);
  const traffic = await get('views_by_traffic_source');
  assert.deepEqual(traffic.labels, ['YouTube search', 'Suggested videos']);
  const age = await get('views_by_age');
  assert.deepEqual(age.labels, ['18-24', '65+']);
  assert.deepEqual(age.series[0], [420, 280], '700 views × 60% and 40%');

  const t = await get('top_videos');
  assert.equal(t.rows[0][0], 'Title of v1', 'titles come from the Data API');
  assert.equal(t.rows[0][t.columns.indexOf('views')], 400);

  // traffic sources only accept views and watch time: no other metric was requested
  const trafficCalls = seen.filter((s) => s.path === '/yta/reports' && s.q.get('dimensions') === 'insightTrafficSourceType');
  assert.ok(trafficCalls.length && trafficCalls.every((c) => c.q.get('metrics')!.split(',').every((m) => ['views', 'estimatedMinutesWatched'].includes(m))));
  assert.ok(seen.filter((s) => s.path === '/yta/reports').every((s) => s.q.get('ids') === 'channel==UC1'), 'queries name the channel instead of MINE');
});

test('YouTube helpers', () => {
  assert.equal(ageLabel('age18-24'), '18-24');
  assert.equal(ageLabel('age65-'), '65+');
  // 100 subscribers now; +2 on the 3rd, +3 on the 4th: end of the 2nd = 95, of the 3rd = 97, of the 4th = 100
  const stock = rebuildSubscribers(100, { '2026-01-03': 2, '2026-01-04': 3 }, ['2026-01-02', '2026-01-03', '2026-01-04'], '2026-01-04');
  assert.deepEqual(stock, { '2026-01-02': 95, '2026-01-03': 97, '2026-01-04': 100 });
});

// ═════════════════════════ Google Business Profile ═════════════════════════
test('Business Profile: daily metrics are zero-filled, deprecated metrics are not requested, device rows use the archetype labels', async () => {
  const { get } = await connect('google_my_business', 'accounts/9/locations/123', 'at');
  // days[3] is a quiet day (omitted by the API): 6 days × 30 searches
  assert.equal((await get('views_search')).value, 6 * 30);
  assert.equal((await get('views_maps')).value, 6 * 20);
  assert.equal((await get('calls')).value, 6 * 3);
  assert.equal((await get('website_clicks')).value, 6 * 4);
  assert.equal((await get('messages')).value, 6, 'MESSAGING_CLICKS');
  assert.equal((await get('bookings')).value, 0, 'an omitted metric is zero');
  const series = await get('views_by_date');
  assert.equal(series.labels.length, 7);
  assert.equal(series.series[0][3], 0, 'the quiet day is a zero, not a gap');

  const asked = seen.filter((s) => s.path.endsWith(':fetchMultiDailyMetricsTimeSeries')).flatMap((s) => s.q.getAll('dailyMetrics'));
  assert.ok(asked.includes('MESSAGING_CLICKS'));
  assert.ok(!asked.includes('BUSINESS_CONVERSATIONS'));

  const dev = await get('views_by_platform');
  assert.deepEqual(dev.labels.sort(), ['Google Maps (desktop)', 'Google Maps (mobile)', 'Google Search (desktop)', 'Google Search (mobile)']);
});

test('Business Profile: reviews feed rating and new reviews; search terms keep thresholds; a reviews outage does not break the rest', async () => {
  const { get } = await connect('google_my_business', 'accounts/9/locations/123', 'at');
  assert.equal((await get('new_reviews')).value, 2, 'the old review is outside the period');
  assert.equal((await get('rating')).value, 4.5);
  const terms = await get('search_terms');
  assert.equal(terms.rows[0][0], 'dentist athens');
  assert.equal(terms.rows[1][terms.columns.indexOf('searches')], 15, 'a threshold is shown as its limit');

  flags.reviewsDown = true;
  try {
    const { get: get2 } = await connect('google_my_business', 'accounts/9/locations/123', 'at');
    assert.equal((await get2('views_search')).value, 6 * 30);
    const r = await get2('rating');
    assert.ok(r.type === 'number' && r.value == null, 'rating is empty, not an error that hides views');
  } finally {
    flags.reviewsDown = false;
  }
});

test('Business Profile: a location without an account in its id still reads performance data', async () => {
  assert.deepEqual(gbpPaths('accounts/9/locations/123'), { location: 'locations/123', account: 'accounts/9' });
  assert.deepEqual(gbpPaths('locations/123'), { location: 'locations/123', account: undefined });
  assert.deepEqual(gbpPaths('123'), { location: 'locations/123', account: undefined });
  const { get } = await connect('google_my_business', 'locations/123', 'at');
  assert.equal((await get('calls')).value, 6 * 3);
});

test('end_time of an insights value names the day that ended', () => {
  assert.equal(dayOfEnd('2026-09-02T07:00:00+0000'), '2026-09-01');
});
