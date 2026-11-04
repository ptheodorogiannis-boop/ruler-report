import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): right-click in a channel block opens the app's
// menu; "Add metric here" picks a metric in a small picker and places it right after the clicked widget.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('right-click: Add metric here lands after the clicked widget; Escape closes; Shift keeps the browser menu', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { duplicateReport } = await import('../src/lib/services/reports');
  const src = await db.report.findUniqueOrThrow({ where: { id: 1 } });
  const copy = await duplicateReport(src.id, src.companyId);
  const layoutOf = async () => (await db.report.findUniqueOrThrow({ where: { id: copy.id } })).layout as any;
  const block = (await layoutOf()).blocks.find((b: any) => b.slug === 'facebook_ads');
  assert.ok(block, 'a Meta Ads block');
  const first = block.widgets.find((w: any) => w.x === 0 && w.y === 0);
  assert.ok(first, 'a widget at the top left');
  const before = new Set(block.widgets.map((w: any) => w.id));
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${copy.id}`, { waitUntil: 'networkidle' });
    const target = page.locator(`[data-widget="${first.id}"]`);
    await target.scrollIntoViewIfNeeded();

    // Shift + right-click: no app menu
    await target.click({ button: 'right', modifiers: ['Shift'] });
    assert.equal(await page.locator('[data-block-menu]').count(), 0);
    await page.keyboard.press('Escape');

    // right-click, Escape closes
    await target.click({ button: 'right' });
    await page.locator('[data-block-menu]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-block-menu]').waitFor({ state: 'detached' });

    // right-click → Add metric here → Enter picks the first option
    await target.click({ button: 'right' });
    await page.locator('[data-block-menu]').getByRole('menuitem', { name: 'Add metric here' }).click();
    const search = page.locator('[data-metric-picker="popover"] input[type="search"]');
    await page.locator('[data-metric-picker="popover"] [role="option"]').first().waitFor();
    await search.press('Enter');
    await page.locator('[data-metric-picker="popover"]').waitFor({ state: 'detached' });

    // saved at once (immediate save); the new widget sits right of the clicked one, or under it
    let added: any;
    for (let i = 0; i < 40 && !added; i++) {
      added = (await layoutOf()).blocks.find((b: any) => b.id === block.id).widgets.find((w: any) => !before.has(w.id));
      if (!added) await page.waitForTimeout(250);
    }
    assert.ok(added, 'a widget was added');
    const expected = first.w + added.w <= 12 ? { x: first.w, y: 0 } : { x: 0, y: first.h };
    assert.deepEqual({ x: added.x, y: added.y }, expected);
    assert.equal(await page.locator(`[data-widget="${added.id}"]`).count(), 1, 'drawn in the block');
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: copy.id } });
  }
});
