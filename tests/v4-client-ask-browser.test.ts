import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise). scripts/dev-mock.mjs points the AI at the mock
// providers, which answer every question with "You got 42 leads." The test switches Ask on for the demo report, asks a
// suggested question on the client link, finds it in the share panel's log, and switches Ask off again.
const base = process.env.NAV_BASE;

test('client Ask: the share panel switches it on; the client link offers suggested questions and answers; the agency sees the question', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const r = await db.report.findUniqueOrThrow({ where: { id: 13 } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/login`);
    await page.fill('#email', 'admin@demo.local');
    await page.fill('#password', 'demo1234');
    await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);

    // off by default: no tile on the client link
    await page.goto(`${base}/r/${r.shareToken}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.client-ask').count(), 0, 'off by default');

    // the agency switches it on in Sharing & delivery
    await page.goto(`${base}/reports/${r.id}`, { waitUntil: 'networkidle' });
    await page.locator('summary', { hasText: 'Sharing' }).click();
    await page.locator('[data-client-ask] button', { hasText: 'Switch on' }).click();
    await page.locator('[data-client-ask] button', { hasText: 'Switch off' }).waitFor();

    // the client asks a suggested question
    await page.goto(`${base}/r/${r.shareToken}`, { waitUntil: 'networkidle' });
    const tile = page.locator('.client-ask');
    await tile.waitFor();
    const chips = tile.locator('button[data-suggestion]');
    assert.ok((await chips.count()) >= 1 && (await chips.count()) <= 3, 'one to three suggestions');
    const question = (await chips.first().textContent())!.trim();
    await chips.first().click();
    await tile.getByText('You got 42 leads.').waitFor();

    // the agency reads it in the share panel
    await page.goto(`${base}/reports/${r.id}`, { waitUntil: 'networkidle' });
    await page.locator('summary', { hasText: 'Sharing' }).click();
    await page.locator('[data-client-questions]').getByText(question).waitFor();
  } finally {
    await browser.close();
    await db.report.update({ where: { id: r.id }, data: { clientAsk: false } });
    await db.clientQuestion.deleteMany({ where: { reportId: r.id } });
  }
});
