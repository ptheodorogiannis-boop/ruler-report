// Uploaded media (docs/superpowers/specs/2026-10-21-v2-features-design.md §2): one row per file, the bytes on disk under
// data/uploads/<companyId>/<id>.<ext>. Ids are cuids and the extension comes from the mime whitelist, so no path is ever
// built from user input. Served by /api/media/[id].
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';

export const MEDIA_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as const;
export type MediaMime = keyof typeof MEDIA_MIME;
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const isMediaMime = (m: string): m is MediaMime => Object.prototype.hasOwnProperty.call(MEDIA_MIME, m);
export const mediaUrl = (id: string) => `/api/media/${id}`;

/** Absolute folder of a company's files: MEDIA_DIR (tests) or <cwd>/data/uploads. */
export function mediaDir(companyId: number): string {
  const root = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : path.join(process.cwd(), 'data', 'uploads');
  return path.join(root, String(companyId));
}
const fileOf = (companyId: number, id: string, mime: MediaMime) => path.join(mediaDir(companyId), `${id}.${MEDIA_MIME[mime]}`);

export interface PutMediaInput {
  companyId: number;
  projectId?: number | null;
  name: string;
  mime: string;
  bytes: Buffer;
  width?: number | null;
  height?: number | null;
}

/** Validates, stores the row, writes the file; a failed write removes the row again so nothing partial stays. */
export async function putMedia(input: PutMediaInput): Promise<{ id: string; url: string; width: number | null; height: number | null }> {
  const { companyId, mime, bytes } = input;
  if (!isMediaMime(mime)) throw new Error('Unsupported image type (PNG, JPEG, WebP or GIF only)');
  if (!bytes.length) throw new Error('The file is empty');
  if (bytes.length > MEDIA_MAX_BYTES) throw new Error('Images must be 5 MB or smaller');
  const dim = (n: number | null | undefined) => (Number.isFinite(n) && (n as number) > 0 ? Math.round(n as number) : null);
  const row = await db.media.create({ data: { companyId, projectId: input.projectId ?? null, name: input.name.slice(0, 200) || 'image', mime, size: bytes.length, width: dim(input.width), height: dim(input.height) } });
  try {
    await mkdir(mediaDir(companyId), { recursive: true });
    await writeFile(fileOf(companyId, row.id, mime), bytes);
  } catch (e) {
    await db.media.delete({ where: { id: row.id } }).catch(() => {});
    throw e;
  }
  return { id: row.id, url: mediaUrl(row.id), width: row.width, height: row.height };
}

export async function readMedia(id: string): Promise<{ mime: string; path: string; size: number; name: string } | null> {
  const row = await db.media.findUnique({ where: { id } });
  if (!row || !isMediaMime(row.mime)) return null;
  const p = fileOf(row.companyId, row.id, row.mime);
  try {
    const s = await stat(p);
    return { mime: row.mime, path: p, size: s.size, name: row.name };
  } catch {
    return null;
  }
}

/** Removes row and file; false when the id does not belong to the company. */
export async function deleteMedia(id: string, companyId: number): Promise<boolean> {
  const row = await db.media.findFirst({ where: { id, companyId } });
  if (!row) return false;
  await db.media.delete({ where: { id: row.id } });
  if (isMediaMime(row.mime)) await unlink(fileOf(row.companyId, row.id, row.mime)).catch(() => {});
  return true;
}

export async function listMedia(companyId: number, take = 24) {
  const rows = await db.media.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });
  return rows.map((r) => ({ id: r.id, url: mediaUrl(r.id), name: r.name, width: r.width, height: r.height, createdAt: r.createdAt.toISOString() }));
}
