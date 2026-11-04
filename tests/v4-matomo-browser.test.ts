import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise), whose mock providers include a stand-in Matomo at
// http://127.0.0.1:3198/matomo (token "mock-matomo"): a wrong token shows Matomo's message; the right one lists the sites;
// one site connects with its goals; a goal renamed in the Goals list is the name the metrics use.
const base = process.env.NAV_BASE;
const MATOMO = 'http://127.0.0.1:3198/matomo';

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('Matomo: address + token, load sites, connect one, rename a goal, the metrics use the new name', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  let createdId = 0;
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  try {
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/projects/5/connect/matomo`, { waitUntil: 'networkidle' });

    // a wrong token: Matomo's own message, no list
    await page.fill('#m-address', MATOMO);
    await page.fill('#m-token', 'not-the-token');
    await page.getByRole('button', { name: 'Load sites' }).click();
    await page.locator('[data-matomo-error]').waitFor();
    assert.match(await page.locator('[data-matomo-error]').innerText(), /token/i);
    assert.equal(await page.locator('[data-matomo-site]').count(), 0);

    // the right token: three sites; search narrows; tick Peak Fitness and connect it
    await page.fill('#m-token', 'mock-matomo');
    await page.getByRole('button', { name: 'Load sites' }).click();
    await page.locator('[data-matomo-site]').first().waitFor();
    assert.equal(await page.locator('[data-matomo-site]').count(), 3);
    assert.equal(await page.locator('[data-matomo-error]').count(), 0);
    await page.locator('[data-matomo-sites] input[type="search"]').fill('peak');
    assert.equal(await page.locator('[data-matomo-site]:visible').count(), 1);
    await page.locator('[data-matomo-site="3"] input[type="checkbox"]').check();
    await Promise.all([page.waitForURL(/tab=integrations/), page.getByRole('button', { name: 'Connect 1' }).click()]);
    createdId = Number(new URL(page.url()).searchParams.get('ids'));
    assert.ok(createdId > 0, page.url());
    assert.match(await page.locator('[data-connect-result]').innerText(), /Peak Fitness/);

    // the new row says how many goals Matomo has; its Goals list shows ID, Matomo's name and "Show as"
    const row = page.locator('[data-search]', { has: page.locator(`[data-goals-line] a[href*="goals=${createdId}"]`) });
    assert.match(await row.locator('[data-goals-line]').innerText(), /Goals: 3/);
    await row.locator('[data-goals-line] a').click();
    await page.locator('[data-goals-editor] [data-goal]').first().waitFor();
    const goals = await page.locator('[data-goals-editor] [data-goal]').allInnerTexts();
    assert.deepEqual(goals.map((g) => g.replace(/\s+/g, ' ').trim()), ['1 Lead', '2 ClickToPhone', '3 Contact form']);
    await page.fill('input[name="goal_2"]', 'Phone calls');
    await page.getByRole('button', { name: 'Save names' }).click();
    await page.getByText('Names saved').waitFor();

    // the metric picker's list for this account (the same request the editor makes) carries the new name, in Goals
    const metrics = await page.evaluate(async (id: number) => (await (await fetch(`/api/v2/metrics?integration_slug=matomo&integration_id=${id}&per_page=100&pickable=1&search=goal`)).json()).data, createdId);
    const conv = metrics.find((m: any) => m.reference_key === 'matomo:goal_2_conversions');
    assert.ok(conv, metrics.map((m: any) => m.reference_key).join(' '));
    assert.equal(conv.references.title, 'Phone calls – conversions');
    assert.ok(metrics.some((m: any) => m.reference_key === 'matomo:goal_1_conversions' && m.references.title === 'Lead – conversions'));

    // and the project's KPI goals offer it under that name
    await page.goto(`${base}/projects/5?tab=goals`, { waitUntil: 'networkidle' });
    const newGoal = page.locator('details', { has: page.locator('select[name="referenceKey"]') }).first();
    if ((await newGoal.getAttribute('open')) === null) await newGoal.locator('summary').click();
    await newGoal.locator('select[name="integrationId"]').selectOption(String(createdId));
    assert.ok((await newGoal.locator('select[name="referenceKey"] option').allInnerTexts()).includes('Phone calls – conversions'));
  } finally {
    // leave the mock database as it was
    if (createdId) {
      const { PrismaClient } = await import('@prisma/client');
      const db = new PrismaClient({ datasources: { db: { url: 'file:./mock.db' } } });
      await db.integration.deleteMany({ where: { id: createdId } }).finally(() => db.$disconnect());
    }
    await browser.close();
  }
});
