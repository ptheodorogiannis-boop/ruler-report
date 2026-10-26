// Google Search Console — searchAnalytics.query. Not exercised against a live property in this repo's tests.
import type { BreakdownRow, Connector, DailyData } from '@/lib/engine/types';
import { fetchJson } from './http';
import { googleAccessToken } from './google';

const DIM: Record<string, string> = { query: 'query', page: 'page', country: 'country', device: 'device' };

async function query(ctx: any, body: any) {
  const token = await googleAccessToken(ctx.integration.credentials);
  const site = encodeURIComponent(ctx.integration.sourceId);
  return fetchJson<any>(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const COUNTRY: Record<string, string> = { grc: 'Greece', cyp: 'Cyprus', deu: 'Germany', gbr: 'United Kingdom', usa: 'United States', ita: 'Italy', fra: 'France' };

export const gscConnector: Connector = {
  id: 'gsc',
  async daily(ctx, prims, range): Promise<DailyData> {
    const j = await query(ctx, { startDate: range.start, endDate: range.end, dimensions: ['date'], rowLimit: 25000 });
    const out: DailyData = {};
    for (const r of j.rows ?? []) {
      out[r.keys[0]] = { clicks: r.clicks, impressions: r.impressions, position_x_impr: r.position * r.impressions };
    }
    return out;
  },
  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const dim = DIM[dimension];
    if (!dim) return [];
    const j = await query(ctx, { startDate: range.start, endDate: range.end, dimensions: [dim], rowLimit: Math.min(opts?.limit ?? 100, 25000) });
    return (j.rows ?? []).map((r: any) => {
      const raw = r.keys[0] as string;
      const label = dim === 'country' ? COUNTRY[raw] ?? raw.toUpperCase() : raw;
      return { key: raw, label, values: { clicks: r.clicks, impressions: r.impressions, position_x_impr: r.position * r.impressions } };
    });
  },
  async validate(ctx) {
    const token = await googleAccessToken(ctx.integration.credentials);
    await fetchJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(ctx.integration.sourceId)}`, { headers: { authorization: `Bearer ${token}` } });
    return {};
  },
};
