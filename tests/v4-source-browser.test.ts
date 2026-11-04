import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): Add metrics on a Meta Ads block opens on that
// account; the source dropdown lists every account of the report once, with its icon, and works from the keyboard; a metric
// from Google Analytics 4 lands in the Meta block with the GA4 icon before its title, and a value.
// It edits report 1 of the mock database; back prisma/mock.db up before the browser tests and restore it after.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('Add metrics: the source dropdown switches accounts and adds a metric from another account', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    const metaBlock = page.locator('section[data-block]', { hasText: 'Meta Ads' }).first();
    await metaBlock.getByRole('button', { name: 'Add metrics' }).click();
    const drawer = page.locator('[data-add-metrics]');
    const trigger = drawer.locator('[data-source-select] button[aria-haspopup="listbox"]');
    await trigger.waitFor();
    assert.match(await trigger.innerText(), /Meta Ads/, 'opens on the block own account');
    assert.equal(await drawer.locator('[data-source-select] [role="option"]').count(), 0, 'closed: no source options');

    // open: every account once, each with its icon; Escape closes and gives the focus back
    await trigger.click();
    const sourceOptions = drawer.locator('[data-source-select] [role="option"]');
    await sourceOptions.first().waitFor();
    const ids = await sourceOptions.evaluateAll((els) => els.map((e) => e.getAttribute('data-source')));
    assert.ok(ids.length >= 9, ids.join(','));
    assert.equal(new Set(ids).size, ids.length, 'each account once');
    assert.equal(await drawer.locator('[data-source-select] [role="option"] > svg:first-child').count(), ids.length, 'a platform icon leads each account');
    assert.equal(await drawer.locator('[data-source-select] [role="option"][aria-selected="true"]').count(), 1);
    assert.match(await sourceOptions.first().innerText(), /Ads/, 'paid media first');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await sourceOptions.count(), 0);
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true, 'focus back on the button');

    // pick Google Analytics 4: its metrics list; add Sessions
    await trigger.click();
    await sourceOptions.filter({ hasText: 'Google Analytics 4' }).first().click();
    assert.match(await trigger.innerText(), /Google Analytics 4/);
    const sessions = drawer.locator('[role="option"][data-component="number_v1"]', { has: page.locator('span.truncate', { hasText: /^Sessions$/ }) }).first();
    await sessions.waitFor();
    const before = await metaBlock.locator('[data-foreign-source="google_analytics_4"]').count();
    await sessions.click();

    // the new widget sits in the Meta block, with the GA4 icon before its title, and gets a value
    const foreign = metaBlock.locator('[data-widget]', { has: page.locator('[data-foreign-source="google_analytics_4"]') });
    await page.waitForFunction((n) => document.querySelectorAll('section[data-block] [data-foreign-source="google_analytics_4"]').length > n, before);
    const card = foreign.last();
    assert.match(await card.innerText(), /Sessions/);
    await card.locator('.kpi-value').waitFor();
    assert.match(await card.locator('.kpi-value').innerText(), /\d/);
    assert.equal(await card.locator('[data-foreign-source]').getAttribute('aria-label'), 'Google Analytics 4 · Acme Running Co – Google Analytics 4');
  } finally {
    await browser.close();
  }
});
