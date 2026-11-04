import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): the reports list's row menu archives,
// restores and, from Archived only, deletes a report after its name is typed.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('reports list: archive, restore, and delete permanently from Archived', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { duplicateReport } = await import('../src/lib/services/reports');
  // a throw-away copy, so the demo data keeps its reports
  const src = await db.report.findFirstOrThrow({ where: { kind: 'report', archivedAt: null }, orderBy: { id: 'asc' } });
  const copy = await duplicateReport(src.id, src.companyId);
  const title = `Archive me ${copy.id}`;
  await db.report.update({ where: { id: copy.id }, data: { title } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    const row = () => page.locator('.rlist-row', { hasText: title });

    await page.goto(`${base}/reports?q=${encodeURIComponent(title)}`, { waitUntil: 'networkidle' });
    await row().locator('[data-row-menu] summary').click();
    await row().getByRole('button', { name: 'Archive' }).click();
    await row().waitFor({ state: 'detached' });

    await page.goto(`${base}/reports?q=${encodeURIComponent(title)}&archived=1`, { waitUntil: 'networkidle' });
    await row().locator('[data-row-menu] summary').click();
    await row().getByRole('button', { name: 'Restore' }).click();
    await row().waitFor({ state: 'detached' });
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: copy.id } })).archivedAt, null, 'restored');

    // archive again, then delete for good from Archived
    await page.goto(`${base}/reports?q=${encodeURIComponent(title)}`, { waitUntil: 'networkidle' });
    await row().locator('[data-row-menu] summary').click();
    await row().getByRole('button', { name: 'Archive' }).click();
    await row().waitFor({ state: 'detached' });
    await page.goto(`${base}/reports?q=${encodeURIComponent(title)}&archived=1`, { waitUntil: 'networkidle' });
    await row().locator('[data-row-menu] summary').click();
    await row().getByRole('button', { name: 'Delete permanently' }).click();
    const confirm = page.locator('[data-delete-confirm]');
    assert.equal(await confirm.isDisabled(), true, 'disabled until the name is typed');
    await page.locator('[data-delete-name]').fill('wrong');
    assert.equal(await confirm.isDisabled(), true);
    await page.locator('[data-delete-name]').fill(title);
    assert.equal(await confirm.isDisabled(), false);
    await confirm.click();
    await page.waitForURL(/archived=1/);
    await row().waitFor({ state: 'detached' });
    assert.equal(await db.report.findUnique({ where: { id: copy.id } }), null, 'gone');
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: copy.id } });
  }
});
