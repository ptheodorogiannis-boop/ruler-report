import { NextRequest, NextResponse } from 'next/server';
import { getPrincipal, tokenPrincipal } from '@/lib/auth';
import { errorResponse, json, rateLimit } from '@/lib/api/http';
import { match } from '@/lib/api/routes';

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const route = '/' + path.join('/');
    const method = req.method.toUpperCase();

    // An Authorization header means "API client": never fall back to a browser session if the token is wrong.
    const hasAuth = !!req.headers.get('authorization');
    const p = hasAuth ? await tokenPrincipal(req.headers.get('authorization')) : await getPrincipal();
    if (!p) return json({ message: 'Unauthenticated.' }, 401);

    const rl = rateLimit(`${p.companyId}:${p.userId ?? 't'}`, route, method);
    const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) };
    if (!rl.ok) return json({ message: 'Too Many Attempts.' }, 429, { ...rlHeaders, 'Retry-After': String(rl.retryAfter) });

    const m = match(method, route);
    if (!m) return json({ message: `Route ${method} /api/v2${route} not found.` }, 404, rlHeaders);

    let body: unknown = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return json({ message: 'Body must be valid JSON.' }, 400, rlHeaders);
        }
      }
    }
    const out: any = await m.route.fn({ p, query: req.nextUrl.searchParams, params: m.params, body });
    if (out && typeof out === 'object' && '__csv' in out) {
      return new NextResponse(out.__csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${out.filename}"`, ...rlHeaders } });
    }
    if (out && typeof out === 'object' && '__status' in out) return json(out.body, out.__status, rlHeaders);
    return json(out, 200, rlHeaders);
  } catch (e) {
    return errorResponse(e);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
