import assert from 'node:assert/strict';
import test from 'node:test';

// Browser test against a running dev server (NAV_BASE, skipped otherwise) and its database (DATABASE_URL): the map widget.
// The editor offers a Map block whose colour picker lists only "by country" metrics; on the client link a country opens
// its panel, Escape returns to the top country, and nothing overflows a phone. The report's layout is restored at the end.
const base = process.env.NAV_BASE;

test('map: the editor offers a Map block with "by country" metrics; on the client link a country opens its panel', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { db } = await import('../src/lib/db');
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const r = await db.report.findUniqueOrThrow({ where: { id: 13 }, include: { project: true } });
  const original = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  const sources = await db.integration.findMany({ where: { projectId: r.projectId } });
  const ga4 = sources.find((s) => s.slug === 'google_analytics_4')!;
  const meta = sources.find((s) => s.slug === 'facebook_ads')!;
  assert.ok(ga4 && meta, 'the demo report has GA4 and Meta Ads');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${base}/login`);
    await page.fill('#email', 'admin@demo.local');
    await page.fill('#password', 'demo1234');
    await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);

    // the editor: drawer → Customizable → Map; the colour picker lists GA4's country metrics and nothing else
    await page.goto(`${base}/reports/${r.id}`);
    const block = page.locator('section[data-block]').first();
    await block.waitFor();
    await block.locator('button:has-text("Add metrics")').click();
    await page.locator('aside button', { hasText: 'Customizable' }).click();
    await page.locator('aside button', { hasText: /^Map/ }).first().click();
    const panel = page.locator('[data-panel="map"]');
    await panel.waitFor();
    await panel.locator('select[aria-label="Account"]').first().selectOption(String(ga4.id));
    const metric = panel.locator('select[aria-label="Metric"]').first();
    // the list reloads for the picked account: wait for GA4's own entries, not the previous account's
    await page.waitForFunction((el) => [...(el as HTMLSelectElement).options].some((o) => o.textContent === 'Sessions by country'), await metric.elementHandle());
    const options = await metric.locator('option').allTextContents();
    assert.ok(options.includes('Sessions by country') && options.includes('Conversions by country'), options.join(', '));
    assert.ok(!options.includes('Sessions'), 'only "by country" metrics');

    // the client link: a map coloured by GA4 sessions with Meta spend in the panel
    const layout = JSON.parse(JSON.stringify(original));
    layout.blocks.unshift({ id: 'map-test', title: 'Where', integrationId: 0, slug: 'custom', widgets: [{ id: 'm1', slug: 'map', key: 'map', component: 'map_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 7, custom: { mapShade: { integrationId: ga4.id, key: 'sessions_by_country' }, mapPanel: [{ integrationId: meta.id, key: 'spend_by_country' }] } }] });
    await saveLayout(r, layout);
    await page.goto(`${base}/r/${r.shareToken}`, { waitUntil: 'networkidle' });
    const greece = page.locator('.map-country[aria-label^="Greece"]');
    await greece.waitFor();
    await greece.click();
    const mapPanel = page.locator('.map-panel');
    assert.match((await mapPanel.textContent()) ?? '', /Greece/);
    assert.match((await mapPanel.textContent()) ?? '', /Sessions by country[\s\S]*\d/);
    assert.equal(await greece.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await greece.getAttribute('aria-pressed'), 'false', 'Escape clears the pick');
    assert.ok((await page.locator('.map-list li').count()) >= 2, 'the ranked list under the map');

    // a phone: the panel moves under the map and the page does not scroll sideways
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.map-country').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal overflow at 390');
  } finally {
    await browser.close();
    await saveLayout(await db.report.findUniqueOrThrow({ where: { id: r.id }, include: { project: true } }), original);
  }
});
