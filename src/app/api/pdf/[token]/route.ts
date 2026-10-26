// GET /api/pdf/<shareToken>?layout=flow|pages (spec v3 §4.1): the client link as a PDF. Token-gated like /r and /d,
// the same unlock cookie protects a password report, and the service answers 503 when Chromium is not available.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlockCookie } from '@/lib/share';
import { PdfBusyError, PdfTimeoutError, pdfAvailable, pdfContentDisposition, pdfPageUrl, renderPdf } from '@/lib/services/pdf';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const layout = req.nextUrl.searchParams.get('layout') === 'pages' ? 'pages' : 'flow';
  const r = await db.report.findFirst({ where: { shareToken: token, shareEnabled: true }, select: { id: true, kind: true, title: true, password: true } });
  if (!r) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const cookieName = `rr_pw_${r.id}`;
  const cookie = req.cookies.get(cookieName)?.value;
  if (r.password && cookie !== unlockCookie(r.id, r.password)) return NextResponse.json({ message: 'Unlock the report first' }, { status: 401 });
  if (!pdfAvailable()) return NextResponse.json({ message: 'PDF service unavailable' }, { status: 503 });
  // the client's period, comparison and language travel into the render; anything else is dropped (review I4)
  const extra: Record<string, string | undefined> = {};
  for (const k of ['preset', 'compare', 'lang'] as const) {
    const v = req.nextUrl.searchParams.get(k);
    if (v && /^[\w-]{1,32}$/.test(v)) extra[k] = v;
  }
  const url = pdfPageUrl(r.kind === 'report' ? 'report' : 'dashboard', token, { layout, ...extra });
  try {
    const pdf = await renderPdf({ url, cookies: cookie ? [{ name: cookieName, value: cookie }] : [] });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': pdfContentDisposition(r.title), 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof PdfTimeoutError) return NextResponse.json({ message: e.message }, { status: 504 });
    if (e instanceof PdfBusyError) return NextResponse.json({ message: e.message }, { status: 429, headers: { 'retry-after': '10' } });
    return NextResponse.json({ message: e instanceof Error ? e.message : 'PDF render failed' }, { status: 500 });
  }
}
