import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): the metric picker searches, filters by kind,
// collapses groups, ticks what the block already has, and offers Google Ads no "… on Facebook" variants.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('metric picker: search, chips, collapsing groups, ticks; Google Ads without Meta variants', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    const options = page.locator('[data-add-metrics] [role="option"]');

    await page.locator('section[data-block]', { hasText: 'Meta Ads' }).first().getByRole('button', { name: 'Add metrics' }).click();
    await options.first().waitFor();
    const total = await options.count();
    assert.ok(total > 30, `${total} options`);
    // a metric the block already has is ticked
    assert.ok((await page.locator('[data-add-metrics] [role="option"][data-in-report]').count()) > 0, 'ticks');

    const search = page.locator('[data-add-metrics] input[type="search"]');
    await search.fill('cost per');
    // the search covers the title and the description (the option's tooltip)
    const shown = await options.evaluateAll((els) => els.map((e) => `${(e as HTMLElement).innerText} ${e.getAttribute('title') ?? ''}`));
    assert.ok(shown.length > 0 && shown.length < total, `${shown.length} of ${total}`);
    for (const s of shown) assert.match(s, /cost.*per|per.*cost/i);
    await search.fill('');

    await page.locator('[data-chip="chart_v1"]').click();
    const kinds = await options.evaluateAll((els) => els.map((e) => e.getAttribute('data-component')));
    assert.ok(kinds.length > 0);
    assert.deepEqual([...new Set(kinds)], ['chart_v1']);
    await page.locator('[data-chip="all"]').click();

    const delivery = page.locator('[data-group="delivery"]');
    assert.ok((await delivery.locator('[role="option"]').count()) > 0);
    await delivery.locator('[data-group-toggle]').click();
    assert.equal(await delivery.locator('[role="option"]').count(), 0, 'collapsed');

    // Google Ads: no "on Facebook" variants
    await page.locator('[data-add-metrics]').getByRole('button', { name: 'Close' }).click();
    await page.locator('section[data-block]', { hasText: 'Google Ads' }).first().getByRole('button', { name: 'Add metrics' }).click();
    await options.first().waitFor();
    const titles = await options.allInnerTexts();
    assert.equal(titles.filter((s) => / on (Facebook|Instagram|Messenger|Audience Network)/.test(s)).length, 0, titles.join(' | '));
  } finally {
    await browser.close();
  }
});
