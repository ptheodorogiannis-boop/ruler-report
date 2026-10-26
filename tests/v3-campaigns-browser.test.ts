import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';

// Browser checks of plan E against a running dev server: NAV_BASE=http://localhost:3104.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('integrations tab: an ads account shows its campaign scope, the inline editor lists the six demo campaigns, picking two saves "2 campaigns picked"', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const meta = await db.integration.findFirstOrThrow({ where: { projectId: 1, slug: 'facebook_ads' }, orderBy: { id: 'asc' } });
  const before = meta.config;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/projects/1?tab=integrations`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('[data-campaigns-line]').first().innerText(), /Campaigns: All campaigns/);
    await page.goto(`${base}/projects/1?tab=integrations&campaigns=${meta.id}`, { waitUntil: 'networkidle' });
    const editor = page.locator('[data-campaign-editor]');
    await editor.waitFor();
    await editor.locator('label:has-text("Pick campaigns")').click();
    assert.equal(await editor.locator('input[type=checkbox]').count(), 6, 'six demo campaigns');
    await editor.locator('label:has-text("Brand search") input').check();
    await editor.locator('label:has-text("Spring launch") input').check();
    assert.match(await editor.locator('[data-scope-label]').innerText(), /2 campaigns: Brand search, Spring launch/);
    await editor.locator('button:has-text("Save campaigns")').click();
    await page.waitForFunction(() => /2 campaigns picked/.test(document.body.innerText));
    const saved = await db.integration.findUniqueOrThrow({ where: { id: meta.id } });
    assert.deepEqual((saved.config as any).campaigns, { mode: 'pick', ids: ['c1', 'c4'] });
  } finally {
    await db.integration.update({ where: { id: meta.id }, data: { config: before as any } });
    await browser.close();
  }
});

test('wizard: a selected ads account shows the campaign step with the six demo campaigns; a non-ads account does not', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/new?project=1`, { waitUntil: 'networkidle' });
    const step = page.locator('[data-wizard-campaigns]');
    await step.waitFor();
    const editors = step.locator('[data-campaign-scope]');
    assert.ok((await editors.count()) >= 1, 'one campaign control per selected ads account');
    await editors.first().locator('label:has-text("Pick campaigns")').click();
    await editors.first().locator('input[type=checkbox]').first().waitFor();
    assert.equal(await editors.first().locator('input[type=checkbox]').count(), 6, 'the six demo campaigns are listed');
    // unticking every ads account hides the step
    const labels = page.locator('label:has(input[type=checkbox])').filter({ hasText: /Meta Ads|Google Ads|TikTok Ads|LinkedIn Ads/ });
    const n = await labels.count();
    for (let i = 0; i < n; i++) await labels.nth(i).locator('input').uncheck();
    assert.equal(await step.count(), 0, 'no ads account selected → no campaign step');
  } finally {
    await browser.close();
  }
});

test('editor: the drawer offers a Campaign table to an ads block, the table renders rows in the editor and on the client link, the block gear scopes the block to two campaigns', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const r = await db.report.findUniqueOrThrow({ where: { id: 1 } });
  const originalLayout = JSON.stringify(r.layout);
  const originalData = JSON.stringify(r.data);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    page.on('dialog', (d) => d.accept());
    const saved = () => page.locator('div.sticky').getByText('Saved', { exact: true }).waitFor();
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    // the first block is the Meta Ads block (an ads account)
    const block = page.locator('section:has(.rgrid-edit)').first();
    await block.locator('button:has-text("Add metrics")').click();
    await page.click('[data-add-metrics] button:has-text("Customizable")');
    await page.click('[data-add-metrics] button:has-text("Campaign table")');
    await saved();
    await block.locator('[data-kind="container"] tbody tr').first().waitFor();
    const rows = await block.locator('[data-kind="container"] tbody tr').count();
    assert.ok(rows >= 3 && rows <= 10, `rows in the editor: ${rows}`);
    const spendBefore = await block.locator('[data-kind="container"] tbody tr').first().innerText();
    // block gear → scope to two campaigns
    await block.locator('button[title="Campaigns"]').click();
    const scope = page.locator('[data-campaign-scope]').first();
    await scope.locator('label:has-text("Pick campaigns")').click();
    await scope.locator('label:has-text("Brand search") input').check();
    await scope.locator('label:has-text("Spring launch") input').check();
    await page.click('button:has-text("Apply scope")');
    await saved();
    await page.waitForFunction(() => document.querySelectorAll('[data-kind="container"] tbody tr').length === 2, undefined, { timeout: 60000 });
    const names = await block.locator('[data-kind="container"] tbody tr .ctable-name').allInnerTexts();
    assert.deepEqual(names.map((n) => n.trim()).sort(), ['Brand search', 'Spring launch'], `only the two picked campaigns remain (before: ${spendBefore.split('\n')[0]})`);
    const pub = await page.context().newPage();
    await pub.goto(`${base}/r/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj`, { waitUntil: 'networkidle' });
    assert.equal(await pub.locator('[data-kind="container"] tbody tr').count(), 2, 'the client link shows the scoped table');
    assert.match(await pub.locator('details.data-note').first().evaluate((e) => e.querySelector('.data-note-body')?.textContent ?? ''), /Campaigns: Brand search, Spring launch/);
    await pub.close();
  } finally {
    await db.report.update({ where: { id: 1 }, data: { layout: JSON.parse(originalLayout), data: JSON.parse(originalData) } });
    await browser.close();
  }
});
