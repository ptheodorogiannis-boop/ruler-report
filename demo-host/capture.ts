// Task 5: capture the real app for the Claude-hosted demo.
// Starts the v2 production build on port 3105 (scheduler off), signs in as two throw-away users (English and Greek),
// saves every agency screen's rendered HTML (scripts removed, assets made local), the stylesheet and fonts, and a PDF of
// every shared sample report in both layouts and languages. The throw-away users are removed at the end.
// Run from the repository root: TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx demo-host/capture.ts
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { INTEGRATIONS } from '@/lib/catalog/integrations';
import { unlockCookie } from '@/lib/share';
import { t } from '@/lib/i18n';
import { leftOutProjects } from './export-seed';
import { routeGroup, routeKey, type Manifest, type ManifestRoute } from './src/route-key';
import type { Seed } from './src/seed/types';

const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
const OUT = 'demo-host/capture-out';
const LANGS = ['en', 'el'] as const;
const USERS = { en: 'demo-en@demo.local', el: 'demo-el@demo.local' } as const;
const PROJECT_TABS = ['overview', 'integrations', 'reports', 'dashboards', 'automations', 'goals', 'timeline', 'settings'];
const SETTINGS_TABS = ['branding', 'team', 'api', 'webhooks', 'outbox', 'system'];
const LEFT_OUT_REPORTS = [7];
let LEFT_OUT_PROJECTS: number[] = [];
let LEFT_OUT_TOKENS: string[] = [];
/** The demo shows the user's own agency (review I6): the dev database calls it "Demo Agency". */
const AGENCY = { from: 'Demo Agency', to: 'Ruler Agency' };
/** The address the app would show when hosted (review M4); the demo routes it in place like the capture server's. */
const PUBLIC_BASE = 'https://reports.ruler.agency';

/** `--pdf-only`: keep the captured screens and fetch only the PDFs that are missing. */
const ONLY_PDF = process.argv.includes('--pdf-only');
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const db = new PrismaClient();
const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8')) as Seed;

function routes(): ManifestRoute[] {
  const list: { path: string; key?: string }[] = [{ path: '/overview' }, { path: '/projects' }];
  for (const p of seed.projects) {
    for (const tab of PROJECT_TABS) list.push({ path: `/projects/${p.id}?tab=${tab}` });
    list.push({ path: `/projects/${p.id}/connect` });
  }
  for (const i of INTEGRATIONS) list.push({ path: `/projects/1/connect/${i.slug}` });
  list.push({ path: '/reports' }, { path: '/dashboards' }, { path: '/templates' }, { path: '/templates/new' });
  for (const t of seed.templates) list.push({ path: `/templates/${t.id}` });
  for (const p of ['/automations', '/goals', '/integrations', '/notifications', '/metrics', '/custom-metrics', '/api-docs']) list.push({ path: p });
  for (const tab of SETTINGS_TABS) list.push({ path: `/settings?tab=${tab}` });
  list.push({ path: '/__demo_missing_page', key: 'not-found' });
  return list.map(({ path: p, key }) => {
    const k = key ?? routeKey(p);
    return { path: p, key: k, group: routeGroup(k) };
  });
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    env: { ...process.env, NEXT_DIST_DIR: '.next-v2', PORT: String(PORT), APP_URL: BASE, PDF_BASE_URL: `http://127.0.0.1:${PORT}`, ENABLE_SCHEDULER: '0', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => process.env.CAPTURE_VERBOSE && process.stdout.write(d));
  child.stderr?.on('data', (d) => process.stderr.write(`[next] ${d}`));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('the production server did not start on port 3105');
}

function stopServer(child: ChildProcess) {
  if (child.pid && process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function makeUsers() {
  const hash = await bcrypt.hash('capture-only-' + Math.random().toString(36).slice(2), 10);
  for (const lang of LANGS) {
    const email = USERS[lang];
    await db.user.upsert({ where: { email }, update: { passwordHash: hash, locale: lang, role: 'admin', companyId: 1 }, create: { email, name: 'Demo', passwordHash: hash, role: 'admin', companyId: 1, locale: lang } });
  }
  return hash;
}

async function signIn(page: Page, email: string) {
  // the throw-away users share one random password; set a known one for this run
  const pw = 'capture-' + createHash('sha1').update(email + Date.now()).digest('hex').slice(0, 12);
  await db.user.update({ where: { email }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await Promise.all([page.waitForURL(/\/overview/, { timeout: 60000 }), page.click('form button[type=submit], form button.btn-primary')]);
}

const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
const images = new Map<string, string>();

async function localImage(ctx: BrowserContext, src: string): Promise<string | null> {
  const abs = new URL(src, BASE).href;
  if (images.has(abs)) return images.get(abs)!;
  try {
    const r = await ctx.request.get(abs, { timeout: 30000 });
    if (!r.ok()) return null;
    const type = (r.headers()['content-type'] ?? '').split(';')[0];
    const file = `images/${sha(abs)}.${EXT[type] ?? 'bin'}`;
    writeFileSync(`${OUT}/${file}`, await r.body());
    images.set(abs, file);
    return file;
  } catch {
    return null;
  }
}

/** The screen's HTML as the demo shows it: the app frame (or the page body), scripts gone, left-out report and projects gone. */
async function extract(page: Page, opts: { headline?: string }): Promise<{ html: string; images: string[] }> {
  return page.evaluate(({ leftOut, tokens, projects, headline, agency }) => {
    const root = (document.querySelector('.frame') ?? document.querySelector('main') ?? document.body) as HTMLElement;
    // a left-out report's row: its own link, or (on a client's report list) only its client link (review M2)
    // (no named helper functions in here: tsx wraps them in __name, which the page does not have)
    const ROW = 'li, tr, [data-row], div.flex-wrap.px-4';
    for (const id of leftOut) root.querySelectorAll(`a[href="/reports/${id}"], a[href^="/reports/${id}?"]`).forEach((a) => (a.closest(ROW) ?? a).remove());
    for (const tok of tokens) root.querySelectorAll(`a[href*="/r/${tok}"], a[href*="/d/${tok}"]`).forEach((a) => (a.closest(ROW) ?? a).remove());
    const initial = root.querySelector('.rail-brand .leading-none');
    if (initial && initial.textContent?.trim() === agency.from[0]) initial.textContent = agency.to[0];
    for (const id of projects) {
      root.querySelectorAll(`a[href="/projects/${id}"], a[href^="/projects/${id}?"], a[href^="/projects/${id}/"]`).forEach((a) => (a.closest('li, tr, [data-row]') ?? a).remove());
      root.querySelectorAll(`option[value="${id}"]`).forEach((o) => /^test$/i.test((o.textContent ?? '').trim()) && o.remove());
    }
    if (headline) {
      const h1 = root.querySelector('h1');
      if (h1) h1.textContent = headline;
    }
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, noscript, link, template, next-route-announcer, nextjs-portal').forEach((n) => n.remove());
    clone.querySelectorAll('[srcset]').forEach((n) => n.removeAttribute('srcset'));
    clone.querySelectorAll('[sizes]').forEach((n) => n.removeAttribute('sizes'));
    const imgs = [...clone.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '').filter((s) => s && !s.startsWith('data:'));
    const styled = [...clone.querySelectorAll('[style*="url("]')].flatMap((n) => [...(n.getAttribute('style') ?? '').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1])).filter((s) => !s.startsWith('data:'));
    return { html: clone.outerHTML, images: [...new Set([...imgs, ...styled])] };
  }, { leftOut: LEFT_OUT_REPORTS, tokens: LEFT_OUT_TOKENS, projects: LEFT_OUT_PROJECTS, headline: opts.headline, agency: AGENCY });
}

async function captureStyles(ctx: BrowserContext, page: Page) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href));
  let css = '';
  for (const h of hrefs) css += (await (await ctx.request.get(h)).text()) + '\n';
  const urls = [...new Set([...css.matchAll(/url\((?:"|')?(\/_next\/static\/[^)"']+)(?:"|')?\)/g)].map((m) => m[1]))];
  for (const u of urls) {
    const file = path.basename(u.split('?')[0]);
    const dir = /\.(woff2?|ttf|otf)$/.test(file) ? 'fonts' : 'assets';
    mkdirSync(`${OUT}/${dir}`, { recursive: true });
    writeFileSync(`${OUT}/${dir}/${file}`, await (await ctx.request.get(new URL(u, BASE).href)).body());
    css = css.split(u).join(`${dir}/${file}`);
  }
  writeFileSync(`${OUT}/app.css`, css);
  log(`app.css ${(css.length / 1024).toFixed(0)} KB, ${urls.length} local files`);
}

async function captureViews(ctx: BrowserContext, lang: (typeof LANGS)[number], list: ManifestRoute[], problems: string[]) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await signIn(page, USERS[lang]);
  if (lang === 'en') await captureStyles(ctx, page);
  const groups: Record<string, Record<string, string>> = {};
  let n = 0;
  for (const r of list) {
    const res = await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle' }).catch((e) => (problems.push(`${lang} ${r.key}: ${(e as Error).message}`), null));
    if (res && res.status() >= 400 && r.key !== 'not-found') problems.push(`${lang} ${r.key}: HTTP ${res.status()}`);
    await page.waitForTimeout(200);
    // the overview headline counts the clients; without the left-out projects it is the app's own sentence for the sample clients
    const headline = r.key === 'overview' && LEFT_OUT_PROJECTS.length ? t(lang, seed.projects.length === 1 ? 'overview.clientLast' : 'overview.clientsLast', { count: seed.projects.length, days: 30 }) : undefined;
    const { html: raw, images: srcs } = await extract(page, { headline });
    // the account menu shows the throw-away capture address; the demo signs in as the demo admin
    let html = raw.split(USERS[lang]).join('admin@demo.local');
    html = html.split(AGENCY.from).join(AGENCY.to).split(BASE).join(PUBLIC_BASE).split(`http://127.0.0.1:${PORT}`).join(PUBLIC_BASE);
    for (const src of srcs) {
      const local = await localImage(ctx, src);
      if (local) html = html.split(`"${src}"`).join(`"${local}"`).split(`(${src})`).join(`(${local})`).split(`&quot;${src}&quot;`).join(`&quot;${local}&quot;`);
    }
    (groups[r.group] ??= {})[r.key] = html;
    if (++n % 25 === 0) log(`${lang}: ${n}/${list.length}`);
  }
  mkdirSync(`${OUT}/views/${lang}`, { recursive: true });
  for (const [g, views] of Object.entries(groups)) writeFileSync(`${OUT}/views/${lang}/${g}.json`, JSON.stringify(views));
  await page.close();
  log(`${lang}: ${list.length} screens in ${Object.keys(groups).length} files`);
}

async function capturePdfs(ctx: BrowserContext, problems: string[]) {
  mkdirSync(`${OUT}/pdf`, { recursive: true });
  // a password-protected link renders with its unlock cookie, as a client who typed the password would see it
  const jobs = seed.reports
    .filter((r) => r.shareEnabled)
    .flatMap((r) => ['flow', 'pages'].flatMap((layout) => LANGS.map((lang) => ({ token: r.shareToken as string, layout, lang, headers: (r.password ? { cookie: `rr_pw_${r.id}=${unlockCookie(r.id, r.password)}` } : {}) as Record<string, string> }))))
    .filter((j) => !ONLY_PDF || !existsSync(`${OUT}/pdf/${j.token}-${j.layout}-${j.lang}.pdf`));
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await ctx.request.get(`${BASE}/api/pdf/${j.token}?layout=${j.layout}&lang=${j.lang}`, { timeout: 180000, headers: j.headers }).catch(() => null);
        // an error page also renders to a (small) PDF: below 50 KB counts as a failed render and is retried
        const body = res?.ok() ? await res.body() : null;
        if (body && body.length >= 50_000) {
          writeFileSync(`${OUT}/pdf/${j.token}-${j.layout}-${j.lang}.pdf`, body);
          break;
        }
        if (attempt === 2) problems.push(`pdf ${j.token} ${j.layout} ${j.lang}: ${res ? res.status() : 'no answer'}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  log(`pdf: ${jobs.length} files`);
}

/** Embed every image the seed points at (logos, covers, timeline images) as a data URI: a Claude page blocks external images. */
async function embedSeedImages(ctx: BrowserContext, problems: string[]) {
  const file = `${OUT}/seed.json`;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const urls = new Set<string>();
  const IMAGE_KEY = /(logo|cover|image|src)$/i;
  const visit = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      if (IMAGE_KEY.test(key) && /^(https?:\/\/|\/api\/media\/)/.test(v)) urls.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(data);
  const map = new Map<string, string>();
  for (const u of urls) {
    const res = await ctx.request.get(new URL(u, BASE).href, { timeout: 30000 }).catch(() => null);
    const type = (res?.headers()['content-type'] ?? '').split(';')[0];
    const body = res?.ok() ? await res.body() : null;
    if (!body || !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(type) || body.length > 600_000) {
      problems.push(`seed image ${u}: ${res ? `${res.status()} ${type} ${body?.length ?? 0} bytes` : 'no answer'}`);
      continue;
    }
    map.set(u, `data:${type};base64,${body.toString('base64')}`);
  }
  const swap = (v: unknown): unknown => (typeof v === 'string' ? map.get(v) ?? v : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v);
  writeFileSync(file, JSON.stringify(swap(data)));
  log(`seed: ${map.size} of ${urls.size} images embedded`);
}

/** The seed as the demo shows it (review I6): the agency's name, and its white logo made dark for the white client header. */
function brandSeed() {
  const file = `${OUT}/seed.json`;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.company.name = AGENCY.to;
  const logo = String(data.company.logo ?? '');
  const m = logo.match(/^data:image\/svg\+xml;base64,(.+)$/);
  if (m) {
    const svg = Buffer.from(m[1], 'base64').toString('utf8').replace(/fill:\s*#fff(?:fff)?\b/gi, 'fill:#141821');
    data.company.logo = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  }
  writeFileSync(file, JSON.stringify(data));
  log(`seed: agency "${data.company.name}", logo ${m ? 'recoloured' : 'unchanged'}`);
}

async function main() {
  if (!ONLY_PDF) {
    rmSync(`${OUT}/views`, { recursive: true, force: true });
    rmSync(`${OUT}/pdf`, { recursive: true, force: true });
  }
  mkdirSync(`${OUT}/images`, { recursive: true });
  LEFT_OUT_PROJECTS = await leftOutProjects(db);
  LEFT_OUT_TOKENS = (await db.report.findMany({ where: { id: { in: LEFT_OUT_REPORTS } }, select: { shareToken: true } })).map((r) => r.shareToken).filter(Boolean) as string[];
  const list = routes();
  log(ONLY_PDF ? 'PDFs only' : `${list.length} screens per language`);
  const server = await startServer();
  log('production server up on', PORT);
  const browser = await chromium.launch();
  const problems: string[] = [];
  try {
    if (!ONLY_PDF) {
      await makeUsers();
      for (const lang of LANGS) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
        await captureViews(ctx, lang, list, problems);
        await ctx.close();
      }
    }
    const ctx = await browser.newContext();
    await capturePdfs(ctx, problems);
    await embedSeedImages(ctx, problems);
    brandSeed();
    await ctx.close();
    if (!ONLY_PDF) {
      const manifest: Manifest = { version: 1, capturedAt: new Date().toISOString(), langs: [...LANGS], chrome: 'overview', routes: list };
      writeFileSync(`${OUT}/views/manifest.json`, JSON.stringify(manifest, null, 1));
    }
  } finally {
    await browser.close();
    await db.user.deleteMany({ where: { email: { in: Object.values(USERS) } } }).catch((e) => problems.push(`users: ${(e as Error).message}`));
    await db.$disconnect();
    stopServer(server);
  }
  if (problems.length) {
    console.log(`PROBLEMS (${problems.length}):\n` + problems.slice(0, 40).join('\n'));
    process.exitCode = 1;
  } else log('capture complete, no problems');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
