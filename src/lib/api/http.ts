import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[]>) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found`);
export const forbidden = (m = 'Forbidden') => new ApiError(403, m);
export const invalid = (errors: Record<string, string[]>) => new ApiError(422, 'The given data was invalid.', errors);

// ───────────── rate limits (documented in docs/EVIDENCE.md §4) ─────────────
const windows = new Map<string, number[]>();
function hit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const arr = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    windows.set(key, arr);
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000)), remaining: 0 };
  }
  arr.push(now);
  windows.set(key, arr);
  return { ok: true as const, remaining: limit - arr.length };
}
export const RATE_LIMITS = { per_minute: 150, per_second: 15, actions: { 'POST /reports': { limit: 30, per_seconds: 86400, or: '2 per active project' }, 'POST /dashboards': { limit: 30, per_seconds: 86400, or: '2 per active project' }, 'POST /metrics/get-data': { limit: 100, per_seconds: 60 } } };

export function rateLimit(principalKey: string, route: string, method: string) {
  const sec = hit(`${principalKey}:s`, RATE_LIMITS.per_second, 1000);
  if (!sec.ok) return { ok: false as const, retryAfter: sec.retryAfter, limit: RATE_LIMITS.per_second, remaining: 0 };
  const min = hit(`${principalKey}:m`, RATE_LIMITS.per_minute, 60_000);
  if (!min.ok) return { ok: false as const, retryAfter: min.retryAfter, limit: RATE_LIMITS.per_minute, remaining: 0 };
  if (method === 'POST' && route === '/metrics/get-data') {
    const a = hit(`${principalKey}:metrics`, 100, 60_000);
    if (!a.ok) return { ok: false as const, retryAfter: a.retryAfter, limit: 100, remaining: 0 };
  }
  return { ok: true as const, limit: RATE_LIMITS.per_minute, remaining: min.remaining };
}
export const resetRateLimits = () => windows.clear();

// ───────────── pagination ─────────────
export interface PageParams {
  page: number;
  perPage: number;
  sortBy?: string;
  descending: boolean;
}
export function pageParams(q: URLSearchParams, allowed: string[], defaultSort = 'created_at'): PageParams {
  const page = Math.max(1, Number(q.get('page')) || 1);
  const perPage = Math.min(100, Math.max(1, Number(q.get('per_page') ?? q.get('perPage')) || 15));
  const sb = q.get('sortBy') ?? q.get('sort_by') ?? defaultSort;
  const desc = q.get('descending');
  return { page, perPage, sortBy: allowed.includes(sb) ? sb : defaultSort, descending: desc == null ? true : desc === 'true' || desc === '1' };
}
export function paginated<T>(items: T[], total: number, p: PageParams, path: string, query: URLSearchParams) {
  const last = Math.max(1, Math.ceil(total / p.perPage));
  const link = (n: number | null) => {
    if (n == null) return null;
    const qq = new URLSearchParams(query);
    qq.set('page', String(n));
    return `${process.env.APP_URL || 'http://localhost:3100'}/api/v2${path}?${qq}`;
  };
  return {
    data: items,
    links: { first: link(1), last: link(last), prev: p.page > 1 ? link(p.page - 1) : null, next: p.page < last ? link(p.page + 1) : null },
    meta: { current_page: p.page, from: total === 0 ? null : (p.page - 1) * p.perPage + 1, last_page: last, per_page: p.perPage, to: total === 0 ? null : Math.min(p.page * p.perPage, total), total },
  };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers });
}
export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return json({ message: e.message, ...(e.errors ? { errors: e.errors } : {}) }, e.status);
  console.error('[api]', e);
  return json({ message: e instanceof Error ? e.message : 'Server error' }, 500);
}
