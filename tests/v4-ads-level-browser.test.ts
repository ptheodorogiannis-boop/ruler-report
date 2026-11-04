import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): a campaign table in a Meta Ads block switched to
// the Ads level shows each ad's image and, under Results, what a result is (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1),
// in the editor and on the client link. Works on a copy of report 1, removed at the end.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('campaign table at the Ads level: thumbnails and result types, in the editor and on the client link', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { duplicateReport } = await import('../src/lib/services/reports');
  const src = await db.report.findUniqueOrThrow({ where: { id: 1 } });
  const copy = await duplicateReport(src.id, src.companyId);
  const containerOf = async () => ((await db.report.findUniqueOrThrow({ where: { id: copy.id } })).layout as any).blocks.flatMap((b: any) => b.widgets).find((w: any) => w.slug === 'container');
  const saved = async (ok: (w: any) => boolean) => {
    for (let i = 0; i < 60; i++) {
      const w = await containerOf();
      if (w && ok(w)) return w;
      await new Promise((r) => setTimeout(r, 250));
    }
    return containerOf();
  };
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${copy.id}`, { waitUntil: 'networkidle' });

    // a campaign table in the Meta Ads block, switched to Ads, with Results
    const metaBlock = page.locator('section[data-block]', { hasText: 'Meta Ads' }).first();
    await metaBlock.getByRole('button', { name: 'Add metrics' }).click();
    const drawer = page.locator('[data-add-metrics]');
    await drawer.getByRole('button', { name: 'Customizable' }).click();
    await drawer.locator('button', { hasText: 'Campaign table' }).click();
    const panel = page.locator('[data-panel="container"]');
    await panel.waitFor();
    await panel.locator('[data-container-level]').selectOption('ad');
    const results = panel.locator('label', { has: page.locator('input[type="checkbox"]') }).filter({ hasText: /^\s*Results\s*$/ });
    await results.locator('input').check();
    const w = await saved((x) => x.custom?.level === 'ad' && (x.custom?.metrics ?? []).includes('results'));
    assert.equal(w?.custom?.level, 'ad', 'the level is saved on the widget');

    // the editor: an image cell per ad, and the result type under Results
    const table = page.locator(`[data-widget="${w.id}"]`);
    await table.locator('[data-row-thumb]').first().waitFor();
    assert.ok((await table.locator('img[src*="/demo/creative-"]').count()) > 0);
    await table.locator('.cell-note:visible').first().waitFor();

    // the client link shows the same
    const link = await browser.newPage();
    await link.goto(`${base}/r/${copy.shareToken}`, { waitUntil: 'networkidle' });
    const rows = link.locator('tbody tr:visible:has([data-row-thumb])');
    await rows.first().waitFor();
    const n = await rows.count();
    assert.ok(n > 0);
    assert.equal(await link.locator('[data-row-thumb]:visible').count(), n, 'one image cell per ad');
    assert.ok((await link.locator('[data-row-thumb] img[src*="/demo/creative-"]').count()) > 0, 'the ad images');
    const notes = (await link.locator('.cell-note:visible').allInnerTexts()).map((s) => s.trim());
    assert.ok(notes.length > 0, 'result types under Results');
    assert.ok(notes.every((s) => s && !/^offsite_conversion/.test(s)), notes.join(' | '));
    assert.match(await link.locator('table', { has: link.locator('[data-row-thumb]') }).first().locator('thead').innerText(), /^Ad\b/, 'the name column says Ad');
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: copy.id } });
  }
});
