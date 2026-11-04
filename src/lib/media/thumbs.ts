// Snapshots keep their own copy of row images (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1):
// Meta's creative and post links expire within days, so a frozen report stores each image once in the media store, under a
// reserved name the media library never lists. A download that fails keeps the placeholder; the report never fails for it.
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { RenderedBlock, ReportData, WidgetValue } from '@/lib/engine/types';
import { isMediaMime, mediaUrl, putMedia } from './store';

export const THUMB_PREFIX = 'creative-thumb:';
const MAX_BYTES = 300 * 1024;
const TIMEOUT_MS = 10_000;
const AT_ONCE = 6;

const remote = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);
/** One name per image: the signed query string of a CDN link changes, the path does not. */
const nameOf = (url: string) => THUMB_PREFIX + createHash('sha1').update(url.split('?')[0]).digest('hex');

function urlsOf(v: WidgetValue): (string | null | undefined)[] {
  if (v.type === 'container') return v.rows.map((r) => r.thumb);
  if (v.type === 'table') return v.thumbs ?? [];
  return [];
}
function withUrls(v: WidgetValue, to: (u: string | null | undefined) => string | null | undefined): WidgetValue {
  if (v.type === 'container') return { ...v, rows: v.rows.map((r) => (r.thumb === undefined ? r : { ...r, thumb: to(r.thumb) ?? null })) };
  if (v.type === 'table' && v.thumbs) return { ...v, thumbs: v.thumbs.map((u) => to(u) ?? null) };
  return v;
}

async function stored(url: string, companyId: number, fetchFn: typeof fetch): Promise<string | null> {
  const name = nameOf(url);
  const hit = await db.media.findFirst({ where: { companyId, name }, select: { id: true } });
  if (hit) return mediaUrl(hit.id);
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/') || !isMediaMime(mime)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    return (await putMedia({ companyId, name, mime, bytes })).url;
  } catch {
    return null;
  }
}

/** The report data with every remote row image replaced by its stored copy (or null when it could not be kept). */
export async function keepThumbnails(data: ReportData, companyId: number, fetchFn: typeof fetch = fetch): Promise<ReportData> {
  const blocks: RenderedBlock[] = [...data.sections.flatMap((s) => s.blocks), ...Object.values(data.widgets ?? {})];
  const byName = new Map<string, string>(); // one remote link per image name
  for (const b of blocks) for (const u of urlsOf(b.widget.value)) if (remote(u) && !byName.has(nameOf(u))) byName.set(nameOf(u), u);
  if (!byName.size) return data;
  const kept = new Map<string, string | null>();
  const names = [...byName.keys()];
  for (let i = 0; i < names.length; i += AT_ONCE) {
    await Promise.all(names.slice(i, i + AT_ONCE).map(async (n) => kept.set(n, await stored(byName.get(n)!, companyId, fetchFn))));
  }
  const to = (u: string | null | undefined) => (remote(u) ? kept.get(nameOf(u)) ?? null : u);
  const map = (b: RenderedBlock): RenderedBlock => ({ ...b, widget: { ...b.widget, value: withUrls(b.widget.value, to) } });
  return {
    ...data,
    sections: data.sections.map((s) => ({ ...s, blocks: s.blocks.map(map) })),
    ...(data.widgets ? { widgets: Object.fromEntries(Object.entries(data.widgets).map(([k, b]) => [k, map(b)])) } : {}),
  };
}
