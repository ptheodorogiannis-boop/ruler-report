import type { NextRequest } from 'next/server';
import { canWrite, getPrincipal, tokenPrincipal } from '@/lib/auth';
import { listHandler, uploadHandler } from '@/lib/media/handlers';
import { mediaMaxBytes } from '@/lib/media/store';

export const dynamic = 'force-dynamic';

// An Authorization header means "API client": never fall back to a browser session if the token is wrong.
const principal = (req: NextRequest) => (req.headers.get('authorization') ? tokenPrincipal(req.headers.get('authorization')) : getPrincipal());

/** GET /api/media — the company's recent uploads (for the picker). */
export async function GET(req: NextRequest) {
  return listHandler(await principal(req));
}

const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** POST /api/media — multipart `file` (+ `projectId`, `width`, `height`). Who and how big are checked before the body is read. */
export async function POST(req: NextRequest) {
  const p = await principal(req);
  if (!p) return json({ message: 'Unauthenticated.' }, 401);
  if (!canWrite(p)) return json({ message: 'Forbidden.' }, 403);
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > mediaMaxBytes() + 64 * 1024) return json({ message: `Images must be ${mediaMaxBytes() / (1024 * 1024)} MB or smaller` }, 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ message: 'Expected a multipart form with a file.' }), { status: 422, headers: { 'content-type': 'application/json' } });
  }
  return uploadHandler(p, form);
}
