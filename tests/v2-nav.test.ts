import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against a running dev server of this folder: NAV_BASE=http://localhost:3104 (skipped otherwise).
const base = process.env.NAV_BASE;

test('frame: pill menu and rail on desktop, floating tab bar on phones, active place marked, nothing off screen', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${base}/login`);
    await page.fill('#email', 'admin@demo.local');
    await page.fill('#password', 'demo1234');
    await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
    for (const w of [1440, 1280, 1024, 768]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
      const pills = await page.$$eval('.pillnav-item', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
      assert.equal(pills.length, 5, `5 daily places at ${w}`);
      assert.ok(pills.every(([l, r, wd]) => l >= 0 && r <= w && wd > 0), `all pills inside the viewport at ${w}: ${JSON.stringify(pills)}`);
      assert.equal(await page.$eval('.pillnav-item[aria-current="page"]', (e) => e.textContent?.trim()), 'Overview');
      assert.equal(await page.$$eval('.siderail .rail-btn', (els) => els.length), 7, `6 rail places and Settings at ${w}`);
      assert.equal(await page.$eval('.tabbar', (e) => getComputedStyle(e).display), 'none', `no tab bar at ${w}`);
    }
    // the active pill is the brand red with white text (design-system.md: the active place)
    const active = await page.$eval('.pillnav-item[aria-current="page"]', (e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
    assert.deepEqual(active, ['rgb(219, 1, 0)', 'rgb(255, 255, 255)']);
    // phones: no pill menu, no rail; a floating tab bar with four places and More
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.equal(await page.$eval('.topbar .pillnav', (e) => getComputedStyle(e).display), 'none');
    assert.equal(await page.$eval('.siderail', (e) => getComputedStyle(e).display), 'none');
    assert.equal(await page.$eval('.tabbar', (e) => getComputedStyle(e).position), 'fixed');
    assert.equal(await page.$$eval('.tabbar .tabbar-item', (els) => els.length), 5);
    const bar = await page.$eval('.tabbar', (e) => e.getBoundingClientRect().toJSON());
    assert.ok(bar.left >= 0 && bar.right <= 390 && bar.bottom <= 844, 'tab bar inside the screen: ' + JSON.stringify(bar));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no sideways scroll on a phone');
    await page.click('.tabbar-more > summary');
    assert.ok((await page.$$eval('.tabbar-sheet .navlink', (els) => els.length)) >= 7, 'More lists the rest and Settings');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.$eval('.topbar', (e) => getComputedStyle(e).display), 'none', 'top bar hidden in print');
    assert.equal(await page.$eval('.tabbar', (e) => getComputedStyle(e).display), 'none', 'tab bar hidden in print');
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1440, height: 900 });
    // keyboard order: skip link, brand, then the pill menu (Next's dev-only tools portal may take the first Tab in dev mode)
    await page.goto(`${base}/overview`);
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.className ?? ''));
    }
    const at = (cls: string) => order.findIndex((c) => c.split(' ').includes(cls));
    assert.ok(at('skip-link') >= 0 && at('topbar-brand') > at('skip-link') && at('pillnav-item') > at('topbar-brand'), 'keyboard focus follows the DOM: skip link, brand, menu: ' + JSON.stringify(order));
    assert.equal(await page.$$eval('.sruler', (els) => els.length), 0, 'no scroll ruler');
  } finally {
    await browser.close();
  }
});
