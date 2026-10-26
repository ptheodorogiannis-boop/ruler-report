// Plan E review fix pass, browser checks against a running dev server: NAV_BASE=http://localhost:3104.
import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('I4: typing in the wizard title does not re-fetch the campaign lists (one load per ads account)', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/new?project=1`, { waitUntil: 'networkidle' });
    const step = page.locator('[data-wizard-campaigns]');
    await step.waitFor();
    await step.locator('[data-campaign-scope]').first().locator('label:has-text("Pick campaigns")').click();
    await step.locator('[data-campaign-scope]').first().locator('input[type=checkbox]').first().waitFor();
    await page.waitForTimeout(500);
    let posts = 0;
    page.on('request', (q: any) => {
      if (q.method() === 'POST' && q.url().startsWith(`${base}/reports/new`)) posts++;
    });
    await page.locator('input.input[placeholder]').first().pressSequentially('Autumn review', { delay: 40 });
    await page.waitForTimeout(1200);
    assert.equal(posts, 0, `server actions fired while typing: ${posts}`);
  } finally {
    await browser.close();
  }
});
