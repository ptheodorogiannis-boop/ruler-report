// Review fix pass: browser-level checks against the built demo (NAV_BASE=http://localhost:3199), no window.claude.
import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.NAV_BASE;

async function open() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })).newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  return { browser, page, errors };
}
async function signIn(page: any) {
  await page.waitForSelector('#email');
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await page.press('#password', 'Enter');
  await page.waitForSelector('[data-captured-host] nav.topnav');
}
const go = (page: any, href: string) => page.evaluate((h: string) => (window as any).__demo.navigate(h), href);

test('review C2: the client view opened from the app has a way back', { skip: !base, timeout: 120000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await signIn(page);
    await go(page, '/reports/1');
    await page.waitForSelector('[data-live-view="report-page"]');
    await page.click('a:has-text("Open client view")');
    await page.waitForSelector('main.dossier');
    await page.click('[data-demo-back]');
    await page.waitForSelector('[data-live-view="report-page"]');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('review I1: remove block and delete card work; widget CSV export and browser print explain themselves', { skip: !base, timeout: 180000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await signIn(page);
    await go(page, '/reports/1');
    await page.waitForSelector('[title="Drag to move"]');
    const blocks = await page.locator('section[data-block]').count();
    await page.locator('section[data-block] button.btn-danger[title]').first().click();
    await page.waitForFunction((n: number) => document.querySelectorAll('section[data-block]').length === n - 1, blocks);
    await page.click('[data-analyse-all]');
    await page.waitForSelector('[data-analysis-card]');
    const before = await page.evaluate(() => (window as any).__demo.reports().find((r: any) => r.id === 1).analysis.length);
    await page.locator('button[title="Delete"]').first().click();
    await page.waitForFunction((n: number) => (window as any).__demo.reports().find((r: any) => r.id === 1).analysis.length === n - 1, before);
    await page.evaluate(() => window.print());
    await page.waitForSelector('.demo-toast:has-text("Download PDF")');
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['a,b\n1,2'], { type: 'text/csv' }));
      a.download = 'widget.csv';
      document.body.appendChild(a);
      a.click();
    });
    await page.waitForSelector('.demo-toast:has-text("Downloads are not available in this view")');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('review M1/M3/M11: screens show their own content while loading, a failed area offers Back, connect forms name their client, and "Create a workspace" explains itself', { skip: !base, timeout: 180000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.click('a:has-text("Create a workspace")');
    await page.waitForSelector('.demo-toast');
    await signIn(page);
    await go(page, '/projects/4/connect/facebook_ads');
    await page.waitForSelector('[data-captured-host][data-key="projects-1-connect-facebook_ads"]');
    const text = await page.locator('main').innerText();
    assert.match(text, /Metro Dental/);
    assert.doesNotMatch(text, /Acme Running Co/);
    await page.route('**/views/en/settings.json', (r: any) => r.abort());
    await go(page, '/settings?tab=team');
    await page.waitForSelector('[role=alert] button:has-text("Back")');
    assert.equal(await page.locator('[data-captured-host] .frame').count(), 0, 'the previous screen is not left on display');
    await page.click('[role=alert] button:has-text("Back")');
    await page.waitForSelector('[data-captured-host][data-key="projects-1-connect-facebook_ads"]');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
