// Plan G browser checks against a running dev server: NAV_BASE=http://localhost:3104 (Chromium installed for the PDF).
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';

const base = process.env.NAV_BASE;
const DEMO_TOKEN = 'ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj';

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

test('client link: the PDF menu is offered when the service is up, and the download is a real PDF', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/r/${DEMO_TOKEN}`, { waitUntil: 'networkidle' });
    const menu = page.locator('details.pdf-menu');
    assert.equal(await menu.count(), 1, 'the PDF menu replaces the print button');
    await menu.locator('summary').click();
    assert.equal(await menu.locator('a[href$="layout=flow"]').count(), 1);
    assert.equal(await menu.locator('a[href$="layout=pages"]').count(), 1);
    const res = await ctx.request.get(`${base}/api/pdf/${DEMO_TOKEN}?layout=flow`);
    assert.equal(res.status(), 200, await res.text().catch(() => ''));
    assert.match(res.headers()['content-type'] ?? '', /application\/pdf/);
    assert.match(res.headers()['content-disposition'] ?? '', /attachment; filename=".+\.pdf"/);
    const body = await res.body();
    assert.equal(body.subarray(0, 4).toString(), '%PDF');
    assert.ok(body.length > 10_000, `a real PDF (${body.length} bytes)`);
    // a print render is not a client view (review I2)
    const before = (await db.report.findFirstOrThrow({ where: { shareToken: DEMO_TOKEN } })).views;
    assert.equal((await ctx.request.get(`${base}/r/${DEMO_TOKEN}?print=1&layout=flow`)).status(), 200);
    assert.equal((await db.report.findFirstOrThrow({ where: { shareToken: DEMO_TOKEN } })).views, before, 'views do not move on ?print=1');
  } finally {
    await browser.close();
  }
});

test('editor: hiding a block header through the block options removes its title from the client link; a cover layout change shows on the client link', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { createReport } = await import('../src/lib/services/reports');
  const project = await db.project.findUniqueOrThrow({ where: { id: 1 } });
  const integration = await db.integration.findFirstOrThrow({ where: { projectId: 1, slug: 'facebook_ads' } });
  const ga4 = await db.integration.findFirstOrThrow({ where: { projectId: 1, slug: 'google_analytics_4' } });
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const rep = await createReport({ companyId: project.companyId, projectId: project.id, kind: 'report', title: 'Browser block options', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [integration.id, ga4.id] });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${rep.id}`, { waitUntil: 'networkidle' });
    const firstTitle = await page.locator('input[aria-label="Block title"]').first().inputValue();
    await page.locator('[data-block-options-toggle]').first().click();
    const panel = page.locator('[data-block-options]').first();
    await panel.waitFor();
    await panel.locator('input[name=showHeader]').uncheck();
    await panel.locator('[data-icon-grid] button[title="target"]').click();
    // the layout autosaves; wait for the stored layout to carry the change
    for (let i = 0; i < 40; i++) {
      const r = await db.report.findUniqueOrThrow({ where: { id: rep.id } });
      const b = (r.layout as any)?.blocks?.[0];
      if (b?.hideHeader === true && b?.icon === 'target') break;
      await page.waitForTimeout(250);
    }
    const stored = (await db.report.findUniqueOrThrow({ where: { id: rep.id } })).layout as any;
    assert.equal(stored.blocks[0].hideHeader, true, 'hideHeader saved');
    assert.equal(stored.blocks[0].icon, 'target', 'icon saved');
    assert.equal(await page.locator('text=hidden').first().count() >= 1, true, 'the editor tags the hidden header');
    // the Look panel: switch the cover to a full-width header
    await page.click('button:has-text("Look")');
    await page.locator('[data-cover-options] input[name=coverLayout][value=header]').check();
    for (let i = 0; i < 40; i++) {
      const r = await db.report.findUniqueOrThrow({ where: { id: rep.id } });
      if ((r.layout as any)?.theme?.coverLayout === 'header') break;
      await page.waitForTimeout(250);
    }
    const pub = await (await browser.newContext()).newPage();
    pub.setDefaultTimeout(60000);
    await pub.goto(`${base}/r/${rep.shareToken}`, { waitUntil: 'networkidle' });
    const section = pub.locator(`section#${stored.blocks[0].id}`);
    assert.equal(await section.count(), 1, 'the block section is on the client link');
    assert.equal(await section.locator('h2').count(), 0, 'no title row on the client link');
    assert.equal(await pub.locator('[data-cover-layout="header"].cover-hero').count(), 1, 'the full-width cover header renders');
    // 'none': the document takes the whole width on a desktop (review C1)
    await page.locator('[data-cover-options] input[name=coverLayout][value=none]').check();
    for (let i = 0; i < 40; i++) {
      const r = await db.report.findUniqueOrThrow({ where: { id: rep.id } });
      if ((r.layout as any)?.theme?.coverLayout === 'none') break;
      await page.waitForTimeout(250);
    }
    await pub.goto(`${base}/r/${rep.shareToken}`, { waitUntil: 'networkidle' });
    const doc = await pub.locator('#document').boundingBox();
    assert.ok(doc && doc.width > 800, `the document spans the page without a cover column: ${doc?.width}`);
    // a block card (review I1/I6): after its block in the editor, in the preview and on the client link; pages still break
    const blockId = stored.blocks[0].id as string;
    await db.report.update({ where: { id: rep.id }, data: { analysis: [{ id: 'cardx1', title: 'Block card', html: '<p>blockcard</p>', author: 'ai', updatedAt: new Date().toISOString(), blockId, tone: 'general' }] as any } });
    await page.goto(`${base}/reports/${rep.id}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator(`[data-block="${blockId}"] + [data-analysis-card="cardx1"]`).count(), 1, 'the editor shows the card right after its block');
    await page.click('button:has-text("Preview as client")');
    assert.equal(await page.locator(`section#${blockId} + [data-analysis-card="cardx1"]`).count(), 1, 'the preview shows it too');
    await pub.goto(`${base}/r/${rep.shareToken}?print=1&layout=pages`, { waitUntil: 'networkidle' });
    await pub.emulateMedia({ media: 'print' });
    const breaks = (await pub.evaluate(() => [...document.querySelectorAll('.print-section')].map((s) => getComputedStyle(s).breakBefore))) as string[];
    assert.ok(breaks.length >= 2 && breaks.slice(1).every((b) => b === 'page'), `every section after the first starts a page, card or not: ${breaks.join(',')}`);
    assert.ok(firstTitle.length > 0);
  } finally {
    await browser.close();
    await db.report.delete({ where: { id: rep.id } }).catch(() => null);
  }
});

test('editor: the AI language defaults to the workspace locale and the analysis panel select drives the block controls', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const user = await greekUser('greek-output@demo.local', 'el');
  const rep = await db.report.findFirstOrThrow({ where: { shareToken: DEMO_TOKEN } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signInAs(page, user.email, 'greek1234');
    await page.goto(`${base}/reports/${rep.id}`, { waitUntil: 'networkidle' });
    assert.ok(/Προεπισκόπηση ως πελάτης/.test(await page.locator('main').innerText()), 'client components of the editor are Greek too (the provider is mounted)');
    assert.equal(await page.locator('[data-ai-language]').inputValue(), 'Greek', 'the panel select defaults to Greek for a Greek workspace');
    assert.equal(await page.locator('[data-block-analyse]').first().getAttribute('data-language'), 'Greek');
    await page.locator('[data-ai-language]').selectOption('French');
    assert.equal(await page.locator('[data-block-analyse]').first().getAttribute('data-language'), 'French', 'the block controls follow the select');
  } finally {
    await browser.close();
    await db.user.delete({ where: { id: user.id } }).catch(() => null);
  }
});
