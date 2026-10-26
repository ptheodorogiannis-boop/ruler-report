import assert from 'node:assert/strict';
import test from 'node:test';

// Editor smoke tests against a running dev server: NAV_BASE=http://localhost:3104 (skipped otherwise).
const base = process.env.NAV_BASE;
const REPORT_1_TOKEN = 'ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj'; // demo report 1 (Acme), open link

export async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

const saved = (page: any) => page.locator('div.sticky').getByText('Saved', { exact: true }).waitFor();
const rootBrand = (page: any) => page.$eval('.report-root', (e: any) => getComputedStyle(e).getPropertyValue('--brand').trim());

test('Look panel: the accent is saved with the layout, applied to the editor and the client link, and cleared by "Use client colour"', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Look")');
    const accent = await page.waitForSelector('[data-look] input[name=accent]');
    await accent.fill('#b8321f');
    await accent.dispatchEvent('change');
    await saved(page);
    assert.equal(await rootBrand(page), '#b8321f', 'editor root gets the accent at once');
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('button:has-text("Look")');
    assert.equal(await page.$eval('[data-look] input[name=accent]', (e: any) => e.value), '#b8321f');
    const pub = await ctx.newPage();
    pub.setDefaultTimeout(30000);
    await pub.goto(`${base}/r/${REPORT_1_TOKEN}`, { waitUntil: 'networkidle' });
    assert.equal(await rootBrand(pub), '#b8321f', 'the client link carries the accent');
    await pub.close();
    await page.click('[data-look] button:has-text("Use client colour")');
    await saved(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('button:has-text("Look")');
    assert.notEqual(await page.$eval('[data-look] input[name=accent]', (e: any) => e.value), '#b8321f', 'back to the client colour');
    assert.notEqual(await rootBrand(page), '#b8321f');
  } finally {
    await browser.close();
  }
});

test('Build widgets: a custom block takes a custom chart, a tile and an image from the drawer; the chart gets a series and the tile a metric through their settings; the block is removed again', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(30000);
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    page.on('dialog', (d: any) => d.accept()); // "Remove block" asks for confirmation
    const blocksBefore = await page.$$eval('.rgrid-edit', (els) => els.length);
    await page.click('button:has-text("Add block")');
    await page.click('button:has-text("Custom block")');
    await page.locator('.rgrid-edit').nth(blocksBefore).waitFor();
    const block = page.locator('section:has(.rgrid-edit)').last();
    if (!(await page.$('[data-add-metrics]'))) await block.locator('button:has-text("Add metrics")').click(); // adding a block already opens its drawer
    await page.click('[data-add-metrics] button:has-text("Customizable")');
    for (const label of ['Custom chart', 'Infographic', 'Image']) await page.click(`[data-add-metrics] button:has-text("${label}")`);
    await saved(page);
    for (const kind of ['chart', 'tile', 'image']) assert.equal(await block.locator(`[data-kind="${kind}"]`).count(), 1, `one ${kind} widget in the new block`);

    // the custom chart: pick the first account's first chart metric
    await block.locator('[data-kind="chart"]').click();
    const chartPanel = page.locator('[data-panel="custom-chart"]');
    await chartPanel.waitFor();
    await chartPanel.locator('select[aria-label="Account"]').selectOption({ index: 1 });
    await page.waitForFunction(() => ((document.querySelector('[data-panel="custom-chart"] select[aria-label="Metric"]') as HTMLSelectElement | null)?.options.length ?? 0) > 1, undefined, { polling: 200 });
    await chartPanel.locator('select[aria-label="Metric"]').selectOption({ index: 1 });
    await chartPanel.locator('button:has-text("Add series")').click();
    await saved(page);
    await block.locator('[data-kind="chart"] .recharts-wrapper svg').first().waitFor();

    // the tile: a big number from the first account's first number metric
    await block.locator('[data-kind="tile"]').click();
    const tilePanel = page.locator('[data-panel="tile"]');
    await tilePanel.waitFor();
    await tilePanel.locator('button:has-text("Big number")').click();
    await tilePanel.locator('select[aria-label="Account"]').selectOption({ index: 1 });
    await page.waitForFunction(() => ((document.querySelector('[data-panel="tile"] select[aria-label="Metric"]') as HTMLSelectElement | null)?.options.length ?? 0) > 1, undefined, { polling: 200 });
    await tilePanel.locator('select[aria-label="Metric"]').selectOption({ index: 1 });
    await saved(page);
    await block.locator('[data-kind="tile"] .tile-stat .kpi-value').waitFor();

    await block.locator('button[title="Remove block"]').click();
    await saved(page);
    assert.equal(await page.$$eval('.rgrid-edit', (els) => els.length), blocksBefore, 'block removed');
  } finally {
    await browser.close();
  }
});
