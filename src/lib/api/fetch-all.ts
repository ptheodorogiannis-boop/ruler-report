/**
 * Every page of a /api/v2 list as one array (client side). `path` is relative with its query, without `page`; the pages
 * are asked by number up to `meta.last_page` (the response's links carry APP_URL, which a tunnel or preview may not be).
 */
export async function fetchAllPages<T>(path: string, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetchFn(`${path}${path.includes('?') ? '&' : '?'}page=${page}`, signal ? { signal } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { data?: T[]; meta?: { last_page?: number } };
    out.push(...(j.data ?? []));
    if (page >= (j.meta?.last_page ?? 1)) break;
  }
  return out;
}
