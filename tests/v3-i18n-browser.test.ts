// Plan H browser checks against a running dev server: NAV_BASE=http://localhost:3104.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';

const base = process.env.NAV_BASE;
const DEMO_TOKEN = 'ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj';
const GREEK = /[Ͱ-Ͽ]/;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}


/** A throw-away Greek admin of the demo company, so the shared demo user is never flipped under concurrent tests. */
async function greekUser(email: string, locale: 'el' | null = 'el') {
  const { hashPassword } = await import('../src/lib/auth');
  const passwordHash = await hashPassword('greek1234');
  return db.user.upsert({ where: { email }, update: { locale, passwordHash, role: 'admin', companyId: 1 }, create: { companyId: 1, email, name: 'Ελένη', passwordHash, role: 'admin', locale } });
}
async function signInAs(page: any, email: string, password: string) {
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

/** Pairs of text-bearing elements whose boxes overlap although neither contains the other (closed <details> skipped). */
const OVERLAP_SCAN = `(() => {
  const els = [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('details:not([open])') && !e.matches('summary, summary *')) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return false;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  const rects = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
  const bad = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 4 && y > 4) bad.push((a.e.textContent || '').trim().slice(0, 30) + ' × ' + (b.e.textContent || '').trim().slice(0, 30));
    }
  return bad;
})()`;

test('Greek app: the account menu switches the workspace to EL, the nav and overview are Greek, and the switch back works', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const user = await greekUser('greek-switch@demo.local', null);
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signInAs(page, user.email, 'greek1234');
    await page.locator('details.umenu > summary').click();
    await Promise.all([page.waitForLoadState('networkidle'), page.locator('[data-locale-switch] button[value=el]').click()]);
    await page.goto(`${base}/overview`, { waitUntil: 'networkidle' });
    const nav = await page.locator('nav.topnav').innerText();
    assert.match(nav, /Επισκόπηση/, `Greek nav: ${nav.slice(0, 80)}`);
    assert.doesNotMatch(nav, /Overview|Projects|Reports/);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'el');
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).locale, 'el');
    await page.locator('details.umenu > summary').click();
    await Promise.all([page.waitForLoadState('networkidle'), page.locator('[data-locale-switch] button[value=en]').click()]);
    await page.goto(`${base}/overview`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('nav.topnav').innerText(), /Overview/);
  } finally {
    await browser.close();
    await db.user.delete({ where: { id: user.id } }).catch(() => null);
  }
});

test('Greek client link: ?lang=el translates the chrome and the labelled metrics, keeps the rest English, and nothing overlaps at 1440 and 390', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      page.setDefaultTimeout(60000);
      await page.goto(`${base}/r/${DEMO_TOKEN}?lang=el`, { waitUntil: 'networkidle' });
      const text = await page.locator('main').innerText();
      // with lang="el" on the root Chromium uppercases Greek without accents (ΠΗΓΕΣ), so match both spellings
      assert.match(text, /Πηγ[έε]ς/i, 'the sources heading is Greek');
      assert.match(text, /Δαπάνη/, 'a labelled metric (spend) is Greek');
      assert.match(text, /Σύνολο ακολούθων/, 'an Instagram metric is Greek');
      assert.match(text, /Κορυφαία \d+ από \d+/, 'the table count line is Greek');
      assert.match(text, /Καμπ[άα]νια/i, 'a table header is Greek');
      assert.match(text, /Οι αριθμοί προέρχονται/, 'the generic data note is Greek');
      assert.match(text, /Spring collection launch/, 'typed content (timeline) stays as typed');
      assert.doesNotMatch(text, /Sources|Timeline|Powered by Ruler Reports/i);
      assert.equal(await page.evaluate(() => document.querySelector('.report-root')?.getAttribute('lang')), 'el', 'the page root declares its language (review I8)');
      for (const english of ['Conversions use the ad account', 'Dates follow', 'Nothing to rank yet', 'by quarter']) assert.ok(!(await page.locator('body').innerText()).includes(english) && !(await page.content()).includes(english), `client residual: ${english}`);
      const overlaps = (await page.evaluate(OVERLAP_SCAN)) as string[];
      assert.deepEqual(overlaps, [], `overlapping text at ${width}px`);
      await page.close();
    }
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(`${base}/r/${DEMO_TOKEN}?lang=en`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('main').innerText(), /Sources/i);
  } finally {
    await browser.close();
  }
});

const ENGLISH_ON = {
  '/overview': ['clients, last 30 days', 'client, last 30 days'],
  '/reports': [' reports', 'New report', 'No reports found'],
  '/projects': [' integrations', 'reports & dashboards'],
  '/projects/1': ['active integrations', 'Which campaigns of', 'vs previous 30 days', ' views', 'Copy link', 'Print / PDF', 'Failing', 'Connected', 'checked ', 'Not checked yet', 'Ad spend', 'Tracked calls'],
  '/projects/1?tab=settings': ['Shown next to the client', 'Copy link'],
  '/templates': ['sections ·', 'widgets ·', 'used '],
  '/integrations': [' widgets', ' connected', 'columns auto-detected'],
  '/projects/1/connect': ['demo data', 'extra', 'Connect to '],
  '/projects/1/connect/facebook_ads': ['Sign in, grant read-only access', 'Display name', 'Use synthetic demo data', 'About this integration', 'metrics available', 'Test & connect'],
  '/settings?tab=branding': ['Client links (', 'Custom domain', 'Embed any dashboard', 'white-label support'],
  '/settings?tab=system': ['configured', 'not set', 'App URL', 'Scheduler', 'Email delivery'],
  '/reports/new': ['Previous period', 'Same period last year', 'No comparison', 'Performance analysis'],
};

test('Greek workspace: the agency pages, the editor drawer, the Look panel and the wizard carry none of the English the review found; the project language is settable', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { addIntegration } = await import('./helpers');
  const { createReport } = await import('../src/lib/services/reports');
  const user = await greekUser('greek-workspace@demo.local', 'el');
  const temp = await db.project.create({ data: { companyId: 1, name: 'Greek temp', timezone: 'Europe/Athens', currency: 'EUR', decimalSeparatorFormat: 'comma_dot' } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })).newPage();
    page.setDefaultTimeout(60000);
    await signInAs(page, user.email, 'greek1234');
    const found: string[] = [];
    for (const [path, words] of Object.entries(ENGLISH_ON)) {
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      const text = await page.locator('main').innerText();
      for (const w of words) if (text.includes(w)) found.push(`${path}: ${w}`);
    }
    // the editor: the add-metrics drawer's second tab and the Look panel
    const rep = await db.report.findFirstOrThrow({ where: { shareToken: DEMO_TOKEN } });
    await page.goto(`${base}/reports/${rep.id}`, { waitUntil: 'networkidle' });
    await page.locator('button:has-text("' + (await page.evaluate(() => (document.querySelector('[data-block-analyse]')?.parentElement?.querySelector('button.btn.py-1') as HTMLElement | null)?.innerText?.trim() ?? '')) + '")').first().click().catch(() => null);
    const editorText = await page.locator('main').innerText();
    for (const w of ['Predefined metrics', 'Customizable', 'Analysis card', 'Manual metric', 'Custom block', 'Highlight']) if (editorText.includes(w)) found.push(`editor: ${w}`);
    const lookButton = page.locator('button[aria-expanded]').filter({ has: page.locator('svg.lucide-palette') });
    if (await lookButton.count()) {
      await lookButton.first().click();
      const look = await page.locator('main').innerText();
      for (const w of ['Client colour first', 'Vivid', 'Calm', 'Monochrome', 'Banner above the title', 'Full-width header', 'No cover']) if (look.includes(w)) found.push(`look: ${w}`);
    } else found.push('look: button not found');
    assert.deepEqual(found, [], 'English left on Greek pages');
    // C2: the project language select saves (on a temporary project, so the demo project never changes under other tests)
    await page.goto(`${base}/projects/${temp.id}?tab=settings`, { waitUntil: 'networkidle' });
    await page.locator('[data-project-locale]').selectOption('el');
    await page.locator('[data-project-locale]').locator('xpath=ancestor::form').locator('button[type=submit], button.btn-primary').first().click();
    for (let i = 0; i < 40; i++) {
      if ((await db.project.findUniqueOrThrow({ where: { id: temp.id } })).locale === 'el') break;
      await page.waitForTimeout(250);
    }
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: temp.id } })).locale, 'el', 'Project.locale saved from the settings tab');
    // with the project in Greek, its client link is Greek without ?lang
    const meta = await addIntegration(1, temp.id, 'facebook_ads');
    const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
    const tempRep = await createReport({ companyId: 1, projectId: temp.id, kind: 'report', title: 'Greek temp report', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id] });
    const pub = await (await browser.newContext()).newPage();
    await pub.goto(`${base}/r/${tempRep.shareToken}`, { waitUntil: 'networkidle' });
    assert.match(await pub.locator('main').innerText(), /Πηγ[έε]ς/i, 'the client link follows the project language');
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { projectId: temp.id } }).catch(() => null);
    await db.integration.deleteMany({ where: { projectId: temp.id } }).catch(() => null);
    await db.project.delete({ where: { id: temp.id } }).catch(() => null);
    await db.user.delete({ where: { id: user.id } }).catch(() => null);
  }
});

test('C1 + I1: the login page follows Accept-Language, and ?lang=el survives the dashboard period picker', { skip: !base }, async () => {
  const res = await fetch(`${base}/login`, { headers: { 'accept-language': 'el-GR,el;q=0.9,en;q=0.5' } });
  const html = await res.text();
  assert.ok(html.includes('Σύνδεση'), 'the login form is Greek for a Greek browser');
  assert.ok(!/>\s*Sign in\s*</.test(html), 'no English heading');
  const en = await (await fetch(`${base}/login`, { headers: { 'accept-language': 'en-US,en;q=0.9' } })).text();
  assert.ok(/>\s*Sign in\s*</.test(en), 'and English for an English browser');
  const dash = await db.report.findFirst({ where: { kind: 'dashboard', shareEnabled: true, projectId: 1 }, orderBy: { id: 'asc' } });
  assert.ok(dash, 'a shared dashboard of the demo project');
  // the picker only shows with more than one client preset; give the dashboard three for the test and restore after
  await db.report.update({ where: { id: dash!.id }, data: { clientPresets: ['last_7d', 'last_30d', 'this_month'] } });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/d/${dash!.shareToken}?lang=el`, { waitUntil: 'networkidle' });
    const picker = page.locator('[data-period-picker]');
    assert.equal(await picker.count(), 1, 'the period picker is shown');
    await Promise.all([page.waitForURL(/lang=el/), picker.locator('button').click()]);
    await page.waitForLoadState('networkidle');
    assert.match(page.url(), /preset=.*lang=el|lang=el.*preset=/, 'the language rides along the applied period');
    assert.match(await page.locator('main').innerText(), /Πηγ[έε]ς|Περ[ίι]οδος/i, 'the dashboard stays Greek after applying a period');
  } finally {
    await browser.close();
    await db.report.update({ where: { id: dash!.id }, data: { clientPresets: dash!.clientPresets as any } }).catch(() => null);
  }
});
