import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): the editor's period control re-pulls the report
// for the new dates, keeps a widget added a moment earlier, and marks text a person wrote for the writer only.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('period control: re-pull for Last 90 days, the just-added widget stays, the written-for note is for the writer', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { duplicateReport } = await import('../src/lib/services/reports');
  const { presetRange } = await import('../src/lib/util/dates');
  const src = await db.report.findFirstOrThrow({ where: { kind: 'report', archivedAt: null, layout: { not: undefined } }, include: { project: true }, orderBy: { id: 'asc' } });
  const copy = await duplicateReport(src.id, src.companyId);
  const now = new Date().toISOString();
  await db.report.update({ where: { id: copy.id }, data: { title: `Period ${copy.id}`, analysis: [{ id: 'mine', title: 'My notes', html: '<p>Notes for September</p>', author: 'human', updatedAt: now }] as any } });
  const expected = presetRange('last_90d', src.project.timezone);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${copy.id}`, { waitUntil: 'networkidle' });
    const block = page.locator('section[data-block]').first();
    const count = async () => {
      const r = await db.report.findUniqueOrThrow({ where: { id: copy.id } });
      return ((r.layout as any)?.blocks?.[0]?.widgets ?? []).length as number;
    };
    const before = await count();

    // add a metric, then change the period at once (the editor saves first)
    await block.getByRole('button', { name: 'Add metrics' }).click();
    await page.locator('[data-add-metrics] [draggable="true"]').first().click();
    await page.locator('[data-period]').click();
    await page.locator('[data-period-preset]').selectOption('last_90d');
    await page.locator('[data-period-apply]').click();
    await page.getByText('Updating numbers…').waitFor();
    await page.getByText('Updating numbers…').waitFor({ state: 'detached', timeout: 120000 });

    const r = await db.report.findUniqueOrThrow({ where: { id: copy.id } });
    assert.equal(r.startDate, expected.start);
    assert.equal(r.endDate, expected.end);
    assert.equal((r.data as any).range.start, expected.start, 'the snapshot was rebuilt');
    assert.equal(await count(), before + 1, 'the widget added just before is kept');

    // the note for text written for the old period: in the editor, never on the client link
    await page.locator('[data-written-for]').first().waitFor();
    await page.goto(`${base}/r/${r.shareToken}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-written-for]').count(), 0);
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: copy.id } });
  }
});
