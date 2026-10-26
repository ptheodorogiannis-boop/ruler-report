// Route logic for /api/media, kept apart from the Next route files so it can be called with an explicit principal
// (tests, and any later server action). Responses are plain web Responses.
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { canAdmin, canWrite, type Principal } from '@/lib/auth';
import { MEDIA_MAX_BYTES, deleteMedia, isMediaMime, listMedia, putMedia, readMedia } from './store';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** The first bytes must match the declared type: a renamed SVG or script never gets stored as an image. */
export function sniffImage(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const int = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export async function uploadHandler(p: Principal | null, form: FormData): Promise<Response> {
  if (!p) return json({ message: 'Unauthenticated.' }, 401);
  if (!canWrite(p)) return json({ message: 'Forbidden.' }, 403);
  const file = form.get('file');
  if (!(file instanceof File)) return json({ message: 'Choose an image file.' }, 422);
  if (file.size > MEDIA_MAX_BYTES) return json({ message: 'Images must be 5 MB or smaller' }, 422);
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed || !isMediaMime(file.type) || sniffed !== file.type) return json({ message: 'Unsupported image type (PNG, JPEG, WebP or GIF only)' }, 422);
  const projectId = int(form.get('projectId'));
  if (projectId && p.projectIds && !p.projectIds.includes(projectId)) return json({ message: 'Forbidden.' }, 403);
  try {
    const m = await putMedia({ companyId: p.companyId, projectId, name: file.name, mime: sniffed, bytes, width: int(form.get('width')), height: int(form.get('height')) });
    return json(m, 201);
  } catch (e) {
    return json({ message: (e as Error).message }, 422);
  }
}

export async function listHandler(p: Principal | null): Promise<Response> {
  if (!p) return json({ message: 'Unauthenticated.' }, 401);
  if (!canWrite(p)) return json({ message: 'Forbidden.' }, 403);
  return json({ items: await listMedia(p.companyId) });
}

export async function getHandler(id: string): Promise<Response> {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return json({ message: 'Not found.' }, 404);
  const m = await readMedia(id);
  if (!m) return json({ message: 'Not found.' }, 404);
  const stream = Readable.toWeb(createReadStream(m.path)) as unknown as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': m.mime,
      'content-length': String(m.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'content-disposition': `inline; filename="${encodeURIComponent(m.name)}"`,
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function deleteHandler(p: Principal | null, id: string): Promise<Response> {
  if (!p) return json({ message: 'Unauthenticated.' }, 401);
  if (!canAdmin(p)) return json({ message: 'Forbidden.' }, 403);
  const ok = await deleteMedia(id, p.companyId);
  return ok ? new Response(null, { status: 204 }) : json({ message: 'Not found.' }, 404);
}
