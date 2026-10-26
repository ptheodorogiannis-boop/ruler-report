import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against a running dev server of this folder: NAV_BASE=http://localhost:3104 (skipped otherwise).
const base = process.env.NAV_BASE;

test('top nav: every item visible at 1440/1024/768/390, active item marked, separators between groups only', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${base}/login`);
    await page.fill('#email', 'admin@demo.local');
    await page.fill('#password', 'demo1234');
    await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
    for (const w of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      const boxes = await page.$$eval('.topnav-item', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
      assert.equal(boxes.length, 11, `11 items at ${w}`);
      assert.ok(boxes.every(([l, r, wd]) => l >= 0 && r <= w && wd > 0), `all inside the viewport at ${w}: ${JSON.stringify(boxes)}`);
      assert.equal(await page.$eval('.topnav-item[aria-current="page"]', (e) => e.textContent?.trim()), 'Overview');
      assert.equal(await page.$$eval('.topnav-sep', (els) => els.length), 2);
    }
    // laptops: the eleven default items fit one row at 1280 px (review finding); phones: the rail scrolls away instead of pinning four rows
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(150);
    const tops = await page.$$eval('.topnav-item', (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    assert.equal(tops.length, 1, 'one nav row at 1280: ' + JSON.stringify(tops));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.equal(await page.$eval('.rail', (e) => getComputedStyle(e).position), 'static', 'rail is not sticky on phones');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.$eval('.rail', (e) => getComputedStyle(e).display), 'none', 'rail hidden in print');
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1440, height: 900 });
    // keyboard order: skip link, brand, then the nav items (Next's dev-only tools portal may take the first Tab in dev mode)
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.className ?? ''));
    }
    const at = (cls: string) => order.findIndex((c) => c.split(' ').includes(cls));
    assert.ok(at('skip-link') >= 0 && at('rail-brand') > at('skip-link') && at('topnav-item') > at('rail-brand'), 'keyboard focus follows the DOM: skip link, brand, nav: ' + JSON.stringify(order));
    // the scroll ruler is gone and the content gutters are symmetric (Task 3)
    assert.equal(await page.$$eval('.sruler', (els) => els.length), 0, 'no scroll ruler');
    assert.equal(await page.$eval('.frame-main', (e) => getComputedStyle(e).paddingLeft), '40px');
  } finally {
    await browser.close();
  }
});
