import assert from 'node:assert/strict';
import test from 'node:test';

// Browser checks of the public and signed-in pages against a running dev server: NAV_BASE=http://localhost:3104.
const base = process.env.NAV_BASE;
const OPEN_REPORT = '/r/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj'; // Acme monthly report (demo data, no password)

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('client mark: on the public cover, the reports index, the report page and the overview board', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${base}${OPEN_REPORT}`, { waitUntil: 'networkidle' });
    assert.equal(await page.$$eval('.dossier-cover .cmark', (els) => els.length), 1, 'one mark on the public cover');
    await signIn(page);
    assert.ok((await page.$$eval('.board-client .cmark', (els) => els.length)) >= 1, 'marks on the overview board');
    await page.goto(`${base}/reports`, { waitUntil: 'networkidle' });
    assert.ok((await page.$$eval('.rlist-row .cmark', (els) => els.length)) >= 1, 'marks on the reports index rows');
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    assert.equal(await page.$$eval('.report-head .cmark', (els) => els.length), 1, 'one mark in the report page header');
  } finally {
    await browser.close();
  }
});

test('a project logo whose file is gone shows the placeholder, never a broken image (review Important 2)', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(30000);
    await signIn(page);
    await page.goto(`${base}/projects/1?tab=settings`, { waitUntil: 'networkidle' });
    await page.$eval('input[name=logo]', (e: any) => (e.value = '/api/media/clzzzzzzzzzzzzzzzzzzzzzz'));
    await page.click('button:has-text("Save settings")');
    await page.waitForSelector('text=Saved');
    await page.goto(`${base}/projects`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const state = await page.$$eval('.cmark', (els) => els.map((e) => ({ broken: [...e.querySelectorAll('img')].some((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0), ph: !!e.querySelector('.media-ph') })));
    assert.ok(state.some((s) => s.ph), 'one mark fell back to the placeholder');
    assert.ok(!state.some((s) => s.broken), 'no broken image is left on the page');
    await page.goto(`${base}/projects/1?tab=settings`, { waitUntil: 'networkidle' });
    await page.$eval('input[name=logo]', (e: any) => (e.value = ''));
    await page.click('button:has-text("Save settings")');
    await page.waitForSelector('text=Saved');
  } finally {
    await browser.close();
  }
});
test('cover banner: sits above the client mark when the theme has a cover, and is absent otherwise', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { deleteMedia } = await import('../src/lib/media/store');
  const r = await db.report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
  const original = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  const browser = await chromium.launch();
  let media: { id: string; url: string } | null = null;
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ff0f000101010079c0b9890000000049454e44ae426082', 'hex');
    const up = await page.request.post(`${base}/api/media`, { multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: png } } });
    assert.equal(up.status(), 201, await up.text());
    media = await up.json();
    await saveLayout(r, { ...original, theme: { ...(original.theme ?? {}), cover: media!.url } });
    await page.goto(`${base}${OPEN_REPORT}`, { waitUntil: 'networkidle' });
    // since v3 output the cover column wraps its content in .cover-head-inner[data-cover-layout]; the order inside is what the client sees
    const order = await page.$eval('.cover-head .cover-head-inner', (el) => [...el.children].map((c) => c.className.split(' ')[0]));
    assert.equal(order[0], 'cover-banner', `banner first: ${order.join(' > ')}`);
    assert.ok(order.indexOf('cmark') === 1 && order.indexOf('eyebrow') === 2, `then the mark, then the eyebrow: ${order.join(' > ')}`);
    assert.deepEqual(await page.$$eval('.cover-banner img', (els) => els.map((i) => i.getAttribute('src'))), [media!.url]);
    await saveLayout(r, original);
    await page.goto(`${base}${OPEN_REPORT}`, { waitUntil: 'networkidle' });
    assert.equal(await page.$$eval('.cover-banner', (els) => els.length), 0, 'no banner without a cover');
    assert.equal((await page.$eval('.cover-head .cover-head-inner', (el) => el.children[0].className.split(' ')[0])), 'cmark', 'the mark leads when there is no banner');
  } finally {
    await saveLayout(r, original).catch(() => {});
    if (media) await deleteMedia(media.id, r.companyId).catch(() => {});
    await browser.close();
  }
});
