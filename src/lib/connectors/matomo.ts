// Matomo — its HTTP Reporting API (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3). Every call is a
// POST to <address>/index.php with the token in the body (never in a URL); several reads go in one API.getBulkRequest.
// Written against Matomo's public API docs and a stand-in server; the user connects a real Matomo with their own token.
import type { BreakdownRow, Connector, ConnectorContext, DailyData, DateRange } from '@/lib/engine/types';
import { goalName, type MatomoGoal } from '@/lib/catalog/matomo-goals';
import { countryName } from '@/lib/geo/countries';
import { eachDay } from '@/lib/util/dates';

export interface MatomoCreds {
  baseUrl: string;
  tokenAuth: string;
}
type Call = { method: string; params: Record<string, string> };

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const TIMEOUT_MS = 30_000;

/** <address>/index.php; https only (a local test server may use http). */
function endpoint(baseUrl: string): string {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error('Matomo: the address is not a valid URL');
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL.test(u.hostname))) throw new Error('Matomo: use the https:// address of your Matomo');
  return `${u.origin}${u.pathname.replace(/\/index\.php$/, '').replace(/\/+$/, '')}/index.php`;
}

/** Matomo's numbers arrive as numbers, numeric strings, "3.2%" or "-". */
export function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const s = v.replace(/[%\s,]/g, '');
  const n = Number(s);
  return s && s !== '-' && Number.isFinite(n) ? n : 0;
}

/** A Matomo error answer becomes an Error with its message; a token problem asks for a reconnect. */
function check<T>(j: T): T {
  const e = j as { result?: string; message?: string } | null;
  if (e && typeof e === 'object' && !Array.isArray(e) && e.result === 'error') {
    const msg = String(e.message ?? 'unknown error');
    throw new Error(/token|authenticat|not logged in|login/i.test(msg) ? `invalid_token: Matomo: ${msg}` : `Matomo: ${msg}`);
  }
  return j;
}

async function post(creds: MatomoCreds, body: URLSearchParams, fetchFn: typeof fetch): Promise<unknown> {
  if (!creds?.baseUrl || !creds?.tokenAuth) throw new Error('invalid_token: no Matomo address or token stored');
  body.set('token_auth', creds.tokenAuth);
  const res = await fetchFn(endpoint(creds.baseUrl), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 401 || res.status === 403) throw new Error(`invalid_token: Matomo refused the token (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`Matomo: HTTP ${res.status}`);
  const text = await res.text();
  try {
    return check(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('Matomo: the answer was not JSON (is this the Matomo address?)');
    throw e;
  }
}

export async function matomoApi<T = any>(creds: MatomoCreds, method: string, params: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<T> {
  return (await post(creds, new URLSearchParams({ module: 'API', format: 'JSON', method, ...params }), fetchFn)) as T;
}

/** Several reads in one request; any part that failed throws like a single call would. */
export async function matomoBulk(creds: MatomoCreds, calls: Call[], fetchFn: typeof fetch = fetch): Promise<any[]> {
  if (!calls.length) return [];
  const body = new URLSearchParams({ module: 'API', format: 'JSON', method: 'API.getBulkRequest' });
  calls.forEach((c, i) => body.set(`urls[${i}]`, new URLSearchParams({ method: c.method, ...c.params }).toString()));
  const out = (await post(creds, body, fetchFn)) as unknown[];
  if (!Array.isArray(out)) throw new Error('Matomo: unexpected answer to a bulk request');
  return out.map(check);
}

export async function listMatomoSites(creds: MatomoCreds, fetchFn: typeof fetch = fetch): Promise<{ id: string; name: string; url: string; currency: string; timezone: string }[]> {
  const sites = await matomoApi<any[]>(creds, 'SitesManager.getSitesWithAtLeastViewAccess', {}, fetchFn);
  return (Array.isArray(sites) ? sites : []).map((s) => ({ id: String(s.idsite), name: String(s.name ?? `Site ${s.idsite}`), url: String(s.main_url ?? ''), currency: String(s.currency ?? ''), timezone: String(s.timezone ?? '') }));
}

const credsOf = (ctx: ConnectorContext) => ctx.integration.credentials as MatomoCreds;
const site = (ctx: ConnectorContext) => ({ idSite: String(ctx.integration.sourceId) });
const dates = (r: DateRange) => `${r.start},${r.end}`;
const GOAL = /^goal_(\d+)_(conversions|revenue)$/;

/** The day-by-day reads a set of primitives needs: which call answers it and which column. */
function dailyPlan(prims: string[]): { call: Call; cols: [prim: string, read: (row: any) => number][] }[] {
  const visits = prims.filter((p) => ['sessions', 'users', 'engaged_sessions', 'session_duration'].includes(p));
  const out: { call: Call; cols: [string, (row: any) => number][] }[] = [];
  const read: Record<string, (r: any) => number> = {
    sessions: (r) => num(r.nb_visits),
    users: (r) => num(r.nb_uniq_visitors),
    engaged_sessions: (r) => Math.max(0, num(r.nb_visits) - num(r.bounce_count)),
    session_duration: (r) => num(r.sum_visit_length),
  };
  if (visits.length) out.push({ call: { method: 'VisitsSummary.get', params: {} }, cols: visits.map((p) => [p, read[p]]) });
  if (prims.includes('pageviews')) out.push({ call: { method: 'Actions.get', params: {} }, cols: [['pageviews', (r) => num(r.nb_pageviews)]] });
  const goalsAll = prims.filter((p) => p === 'conversions' || p === 'revenue');
  if (goalsAll.length) out.push({ call: { method: 'Goals.get', params: {} }, cols: goalsAll.map((p) => [p, p === 'revenue' ? (r) => num(r.revenue) : (r) => num(r.nb_conversions)]) });
  if (prims.includes('transactions')) out.push({ call: { method: 'Goals.get', params: { idGoal: 'ecommerceOrder' } }, cols: [['transactions', (r) => num(r.nb_conversions)]] });
  if (prims.includes('abandoned_carts')) out.push({ call: { method: 'Goals.get', params: { idGoal: 'ecommerceAbandonedCart' } }, cols: [['abandoned_carts', (r) => num(r.nb_conversions)]] });
  const goals = new Map<string, [string, (r: any) => number][]>();
  for (const p of prims) {
    const m = GOAL.exec(p);
    if (m) goals.set(m[1], [...(goals.get(m[1]) ?? []), [p, m[2] === 'revenue' ? (r) => num(r.revenue) : (r) => num(r.nb_conversions)]]);
  }
  for (const [id, cols] of goals) out.push({ call: { method: 'Goals.get', params: { idGoal: id } }, cols });
  return out;
}

/** Breakdown reports by dimension (period=range). */
const REPORT: Record<string, Call> = {
  channel: { method: 'Referrers.getReferrerType', params: {} },
  device: { method: 'DevicesDetection.getType', params: {} },
  country: { method: 'UserCountry.getCountry', params: {} },
  city: { method: 'UserCountry.getCity', params: {} },
  page: { method: 'Actions.getPageUrls', params: { flat: '1' } },
  page_title: { method: 'Actions.getPageTitles', params: { flat: '1' } },
  landing_page: { method: 'Actions.getEntryPageUrls', params: { flat: '1' } },
  campaign: { method: 'Referrers.getCampaigns', params: {} },
  product: { method: 'Goals.getItemsName', params: {} },
};
/** A breakdown row's columns as the archetype's primitives. */
function rowValues(r: any, prims: string[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const p of prims) {
    if (p === 'sessions') v[p] = num(r.nb_visits);
    else if (p === 'users') v[p] = num(r.nb_uniq_visitors);
    else if (p === 'pageviews') v[p] = num(r.nb_hits ?? r.nb_pageviews);
    else if (p === 'engaged_sessions') v[p] = Math.max(0, num(r.nb_visits) - num(r.bounce_count));
    else if (p === 'conversions') v[p] = num(r.nb_conversions);
    else if (p === 'revenue') v[p] = num(r.revenue);
    else if (p === 'transactions') v[p] = num(r.orders ?? r.nb_conversions);
    else v[p] = 0;
  }
  return v;
}

export const matomoConnector: Connector = {
  id: 'matomo',
  unsupported: ['new_users', 'events', 'view_item', 'add_to_cart', 'begin_checkout'],

  async daily(ctx, prims, range): Promise<DailyData> {
    const plan = dailyPlan(prims);
    const answers = await matomoBulk(credsOf(ctx), plan.map((p) => ({ method: p.call.method, params: { ...p.call.params, ...site(ctx), period: 'day', date: dates(range) } })));
    const out: DailyData = {};
    // every day of the range, every primitive: a day Matomo answers with [] is a real zero
    for (const d of eachDay(range)) out[d] = Object.fromEntries(prims.map((p) => [p, 0]));
    plan.forEach((p, i) => {
      const byDay = (answers[i] ?? {}) as Record<string, any>;
      for (const d of eachDay(range)) {
        const row = byDay[d];
        if (!row || Array.isArray(row)) continue;
        for (const [prim, read] of p.cols) out[d][prim] = read(row);
      }
    });
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    let rows: BreakdownRow[];
    if (dimension === 'goal') {
      const goals: MatomoGoal[] = ctx.integration.config?.goals ?? [];
      const answers = await matomoBulk(credsOf(ctx), goals.map((g) => ({ method: 'Goals.get', params: { ...site(ctx), idGoal: g.id, period: 'range', date: dates(range) } })));
      rows = goals.map((g, i) => {
        const a = answers[i] ?? {};
        return { key: g.id, label: goalName(ctx.integration.config, g.id), values: Object.fromEntries(prims.map((p) => [p, p === 'revenue' ? num(a.revenue) : p === 'goal_conversion_rate' ? num(a.conversion_rate) : p === 'conversions' ? num(a.nb_conversions) : 0])) };
      });
    } else {
      const call = REPORT[dimension];
      if (!call) return [];
      const list = await matomoApi<any[]>(credsOf(ctx), call.method, { ...call.params, ...site(ctx), period: 'range', date: dates(range), filter_limit: '500' });
      rows = (Array.isArray(list) ? list : []).map((r) => {
        const label = String(r.label ?? '').trim();
        if (dimension === 'country' && r.code) {
          const code = String(r.code).toUpperCase();
          return { key: code, label: countryName(code, 'en') || label, values: rowValues(r, prims) };
        }
        return { key: label, label, values: rowValues(r, prims) };
      });
    }
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    rows.sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  },

  /** Unique visitors over the period: Matomo's range total, else the sum of the daily values (range processing off). */
  async totals(ctx, prims, range): Promise<Record<string, number>> {
    if (!prims.includes('users')) return {};
    const r = await matomoApi<any>(credsOf(ctx), 'VisitsSummary.get', { ...site(ctx), period: 'range', date: dates(range) });
    if (r && !Array.isArray(r) && r.nb_uniq_visitors != null && r.nb_uniq_visitors !== '') return { users: num(r.nb_uniq_visitors) };
    const d = await matomoConnector.daily(ctx, ['users'], range);
    return { users: Object.values(d).reduce((t, x) => t + (x.users ?? 0), 0) };
  },

  async validate(ctx) {
    const [s, goals] = await matomoBulk(credsOf(ctx), [
      { method: 'SitesManager.getSiteFromId', params: site(ctx) },
      { method: 'Goals.getGoals', params: site(ctx) },
    ]);
    const list = (Array.isArray(goals) ? goals : Object.values(goals ?? {})) as any[];
    return {
      name: String(s?.name ?? `Matomo site ${ctx.integration.sourceId}`),
      config: { currency: String(s?.currency ?? ''), timezone: String(s?.timezone ?? ''), goals: list.map((g) => ({ id: String(g.idgoal), name: String(g.name ?? `Goal ${g.idgoal}`) })) },
    };
  },
};
