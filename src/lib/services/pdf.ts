// Server-side PDF (spec v3 §4.1): one lazily launched Chromium shared by the process, at most two renders at a time
// (the rest wait), closed after five idle minutes. The public page renders itself through its own URL with the unlock
// cookie forwarded, so the PDF is exactly what the client link shows. `PDF_ENABLED=off` turns the feature off.
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { pdfAllowed } from '@/lib/platform';

export interface RenderOpts {
  url: string;
  cookies?: { name: string; value: string }[];
  timeoutMs?: number;
}
export type PdfRenderer = (opts: RenderOpts) => Promise<Buffer>;

const MAX_ACTIVE = 2;
const MAX_WAITING = 10; // beyond this the caller is told to retry (429) instead of holding a request open
const IDLE_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export class PdfTimeoutError extends Error {
  constructor(ms: number) {
    super(`PDF render timed out after ${Math.round(ms / 1000)} s`);
    this.name = 'PdfTimeoutError';
  }
}
export class PdfBusyError extends Error {
  constructor() {
    super('PDF service busy, try again in a few seconds');
    this.name = 'PdfBusyError';
  }
}

/** Where the renderer opens the public page: `PDF_BASE_URL` (an address reachable from inside the container) else `APP_URL`. */
export function pdfBaseUrl(): string {
  return (process.env.PDF_BASE_URL || process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');
}

/** The print URL of a public page: `?print=1&layout=…` plus any extra parameters that have a value. */
export function pdfPageUrl(kind: 'report' | 'dashboard', token: string, params: { layout: 'flow' | 'pages' } & Record<string, string | undefined>): string {
  const q = new URLSearchParams({ print: '1', layout: params.layout });
  for (const [k, v] of Object.entries(params)) if (k !== 'layout' && v) q.set(k, v);
  return `${pdfBaseUrl()}/${kind === 'report' ? 'r' : 'd'}/${token}?${q}`;
}

// ───────────── availability ─────────────
let cached: boolean | null = null;
let override: PdfRenderer | null = null;

/** The Chromium Playwright would launch (playwright is a serverExternalPackage, so this is a plain runtime require). */
function chromiumPath(): string | null {
  try {
    return chromium.executablePath();
  } catch {
    return null;
  }
}

/** False when `PDF_ENABLED=off` (the default on Vercel) or no Chromium executable can be found; the lookup is cached for the process. */
export function pdfAvailable(): boolean {
  if (!pdfAllowed()) return false;
  if (override) return true;
  if (cached == null) {
    const p = chromiumPath();
    cached = !!p && existsSync(p);
  }
  return cached;
}

/** Test hook: a renderer used instead of Chromium (null restores Chromium). */
export function setPdfRenderer(fn: PdfRenderer | null) {
  override = fn;
}

// ───────────── queue ─────────────
let active = 0;
const waiting: (() => void)[] = [];
export const pdfQueueStats = () => ({ active, waiting: waiting.length });

async function acquire() {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_WAITING) throw new PdfBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
}
function release() {
  active = Math.max(0, active - 1);
  waiting.shift()?.();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PdfTimeoutError(ms)), ms);
    (t as { unref?: () => void }).unref?.();
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

// ───────────── browser ─────────────
let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (!launching) {
    launching = (async () => {
      const b = await chromium.launch({ headless: true });
      b.on('disconnected', () => {
        if (browser === b) browser = null;
      });
      browser = b;
      return b;
    })().finally(() => {
      launching = null;
    });
  }
  return launching;
}

/** Close the browser after five idle minutes so a quiet server does not keep Chromium around. */
function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(closeBrowserIfIdle, IDLE_MS);
  (idleTimer as { unref?: () => void }).unref?.();
}

/** The idle timer's work: close the shared browser unless a render is in flight (then wait another idle period). Returns whether it closed. */
export function closeBrowserIfIdle(): boolean {
  if (active > 0) {
    touchIdle();
    return false;
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const b = browser;
  browser = null;
  b?.close().catch(() => null);
  return true;
}

const chromiumRender: PdfRenderer = async (o) => {
  const timeout = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  try {
    if (o.cookies?.length) await ctx.addCookies(o.cookies.map((c) => ({ name: c.name, value: c.value, url: o.url })));
    const page = await ctx.newPage();
    await page.goto(o.url, { waitUntil: 'networkidle', timeout });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' }, preferCSSPageSize: false });
    return Buffer.from(pdf);
  } finally {
    await ctx.close().catch(() => null);
    touchIdle();
  }
};

/** Render a page to PDF through the queue. `deps.render` (tests) or the `setPdfRenderer` hook replace Chromium. */
export async function renderPdf(opts: RenderOpts, deps: { render?: PdfRenderer } = {}): Promise<Buffer> {
  const render = deps.render ?? override ?? chromiumRender;
  await acquire();
  try {
    return await withTimeout(render(opts), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } finally {
    release();
  }
}

/**
 * An attachment name: `|`, `:`, `/`, `\\` become `-`, `"` and control characters are dropped, whitespace collapsed, at most 80
 * characters, `.pdf`. ASCII by default (the `filename=` fallback of a download); `{ ascii: false }` keeps the title's own letters
 * (mail attachments, the `filename*` of a download).
 */
export function pdfFilename(title: string, opts: { ascii?: boolean } = {}): string {
  const base = title
    .replace(/[|:/\\]/g, '-')
    .replace(opts.ascii === false ? /["\x00-\x1f\x7f]/g : /[^\x20-\x7e]|"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return `${base || 'report'}.pdf`;
}

/** `Content-Disposition` for a download: the ASCII name as `filename=`, the real title as RFC 5987 `filename*`. */
export function pdfContentDisposition(title: string): string {
  const utf8 = encodeURIComponent(pdfFilename(title, { ascii: false })).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${pdfFilename(title)}"; filename*=UTF-8''${utf8}`;
}
