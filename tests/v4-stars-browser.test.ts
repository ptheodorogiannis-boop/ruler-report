import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against the mock dev server (NAV_BASE, skipped otherwise): a row starred in the editor shows tinted and
// bold on the client link; unstarring clears it.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('row stars: star in the editor, tinted on the client link, unstar clears it', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { duplicateReport } = await import('../src/lib/services/reports');
  const src = await db.report.findUniqueOrThrow({ where: { id: 1 } });
  const copy = await duplicateReport(src.id, src.companyId);
  const starredOf = async () => ((await db.report.findUniqueOrThrow({ where: { id: copy.id } })).layout as any).blocks.flatMap((b: any) => b.widgets).flatMap((w: any) => w.custom?.starredRows ?? []) as string[];
  const waitFor = async (ok: (s: string[]) => boolean) => {
    for (let i = 0; i < 40; i++) {
      const s = await starredOf();
      if (ok(s)) return s;
      await new Promise((r) => setTimeout(r, 250));
    }
    return starredOf();
  };
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${copy.id}`, { waitUntil: 'networkidle' });
    const row = page.locator('[data-widget] table tbody tr:has(.row-star)').first();
    await row.scrollIntoViewIfNeeded();
    const name = ((await row.locator('td').first().innerText()) ?? '').trim();
    await row.hover();
    await row.locator('.row-star').click();
    assert.deepEqual(await waitFor((s) => s.includes(name)), [name], 'saved on the widget');

    const link = await browser.newPage();
    await link.goto(`${base}/r/${copy.shareToken}`, { waitUntil: 'networkidle' });
    const starred = link.locator('tr.row-starred');
    assert.equal(await starred.count(), 1);
    assert.ok((await starred.innerText()).includes(name), `the starred row is ${name}`);
    assert.equal(await starred.locator('td').first().evaluate((el) => getComputedStyle(el).fontWeight), '600');
    assert.equal(await link.locator('.row-star').count(), 0, 'no star buttons on the client link');
    // the tint is the report's accent (not the app's red): same colour as a probe painted with the report root's --brand
    const [rowBg, probeBg] = await starred.locator('td').first().evaluate((td) => {
      const root = td.closest('.report-root') as HTMLElement;
      const probe = document.createElement('div');
      probe.style.background = 'color-mix(in srgb, var(--brand) 12%, transparent)';
      root.appendChild(probe);
      const out = [getComputedStyle(td).backgroundColor, getComputedStyle(probe).backgroundColor];
      probe.remove();
      return out;
    });
    assert.equal(rowBg, probeBg);

    await row.hover();
    await row.locator('.row-star').click();
    assert.deepEqual(await waitFor((s) => s.length === 0), []);
    await link.reload({ waitUntil: 'networkidle' });
    assert.equal(await link.locator('tr.row-starred').count(), 0);
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: copy.id } });
  }
});
