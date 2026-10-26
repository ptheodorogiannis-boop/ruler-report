// Small Graph API helpers shared by the Facebook Page and Instagram connectors. Every host goes through
// oauth/endpoints.ts so tests can point it at a local mock server.
import type { DateRange } from '@/lib/engine/types';
import { addDays, diffDays } from '@/lib/util/dates';
import { endpoints } from '@/lib/oauth/endpoints';
import { fetchJson } from './http';

export function graphToken(ctx: any): string {
  const t = ctx.integration.credentials?.accessToken;
  if (!t) throw new Error('invalid_token: no Meta access token stored');
  return t as string;
}

/** One Graph API GET (the token goes in the Authorization header, never in the URL). */
export function graphGet<T = any>(ctx: any, path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params);
  return fetchJson<T>(`${endpoints.meta.graph}${path}${qs.size ? `?${qs}` : ''}`, { headers: { authorization: `Bearer ${graphToken(ctx)}` } });
}

/** A list endpoint followed through `paging.next` (which carries the cursor), capped. */
export async function graphPaged<T = any>(ctx: any, path: string, params: Record<string, string>, maxPages = 30): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = `${endpoints.meta.graph}${path}?${new URLSearchParams(params)}`;
  const headers = { authorization: `Bearer ${graphToken(ctx)}` };
  for (let i = 0; i < maxPages && url; i++) {
    const j: any = await fetchJson(url, { headers });
    out.push(...(j.data ?? []));
    url = j.paging?.next;
  }
  return out;
}

/** Split a range into windows of at most `days` days (the insights endpoints cap the window). */
export function chunkRange(r: DateRange, days: number): DateRange[] {
  const out: DateRange[] = [];
  let start = r.start;
  while (start <= r.end) {
    const end = addDays(start, days - 1) < r.end ? addDays(start, days - 1) : r.end;
    out.push({ start, end });
    start = addDays(end, 1);
  }
  return out;
}

/** Unix seconds at 00:00 UTC of a YYYY-MM-DD date. */
export const unix = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);

/** Run `fn` over `items` with at most `n` in flight, keeping the order of the results. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export const daysIn = (r: DateRange) => diffDays(r.start, r.end) + 1;
