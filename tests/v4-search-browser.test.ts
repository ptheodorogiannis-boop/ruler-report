import assert from 'node:assert/strict';
import test from 'node:test';

// Browser tests against the mock dev server (NAV_BASE, skipped otherwise; scripts/dev-mock.mjs wires Google and Meta to
// the mock providers): search on the account lists, and the app-wide search.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('list search: the Integrations tab and the reconnect list filter as you type; a ticked account stays ticked when hidden', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);

    // the project's Integrations tab
    await page.goto(`${base}/projects/1?tab=integrations`, { waitUntil: 'networkidle' });
    const box = page.getByRole('searchbox', { name: 'Search accounts' });
    const rows = page.locator('[data-search]');
    const total = await rows.count();
    assert.ok(total >= 5, `${total} rows`);
    await box.fill('google analytics');
    const visible = page.locator('[data-search]:not([hidden])');
    assert.ok((await visible.count()) >= 1 && (await visible.count()) < total, 'some rows, not all');
    for (const text of await visible.evaluateAll((els) => els.map((e) => e.getAttribute('data-search') ?? ''))) assert.match(text, /google analytics/i);
    assert.match((await page.locator('[data-search-count]').textContent()) ?? '', new RegExp(`of ${total}`));
    await box.fill('zzzz');
    assert.equal(await visible.count(), 0);
    await page.getByText('No matches').waitFor();
    await box.press('Escape');
    assert.equal(await visible.count(), total, 'Escape clears the search');

    // the reconnect list after the provider's consent (mock Meta)
    const { db } = await import('../src/lib/db');
    const id = (await db.integration.findFirst({ where: { projectId: 1, slug: 'facebook_ads' } }))?.id;
    assert.ok(id, 'a Meta Ads account to reconnect');
    await page.goto(`${base}/api/oauth/meta/start?projectId=1&slug=facebook_ads&reconnect=${id}`);
    await page.locator('button[value="allow"]').click();
    await page.waitForURL(/\/connect\/facebook_ads\/pick/);
    const pickBox = page.getByRole('searchbox', { name: 'Search accounts' });
    const options = page.locator('li[data-search]');
    const n = await options.count();
    assert.ok(n >= 2, `${n} accounts to pick from`);
    const first = options.first();
    const name = ((await first.getAttribute('data-search')) ?? '').split(' ')[0];
    await first.locator('input[type=checkbox]').check();
    await pickBox.fill('zzzz');
    assert.equal(await first.isHidden(), true, 'filtered out');
    const picked = await first.locator('input[type=checkbox]').evaluate((el) => {
      const box = el as HTMLInputElement;
      return { sent: new FormData(box.form!).getAll('pick'), mine: box.value };
    });
    assert.ok(picked.sent.includes(picked.mine), 'the hidden ticked account still submits');
    void name;
  } finally {
    await browser.close();
  }
});
