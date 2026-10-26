import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';

// Browser checks of plan D against a running dev server: NAV_BASE=http://localhost:3104.
const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

test('integrations tab: a failing integration shows the chip, a Reconnect link that keeps its id, and Check now; the overview counts it', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const row = await db.integration.findFirstOrThrow({ where: { projectId: 1 }, orderBy: { id: 'asc' } });
  const before = { health: row.health, healthError: row.healthError, healthCheckedAt: row.healthCheckedAt };
  await db.integration.update({ where: { id: row.id }, data: { health: 'failing', healthError: 'HTTP 401 from the provider', healthCheckedAt: new Date() } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/projects/1?tab=integrations`, { waitUntil: 'networkidle' });
    const chip = page.locator('[data-health="failing"]').first();
    await chip.waitFor();
    assert.match(await chip.innerText(), /Failing/);
    assert.equal(await chip.getAttribute('title'), 'HTTP 401 from the provider');
    const links = await page.$$eval('a[href*="?reconnect="]', (els) => els.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
    assert.ok(links.some((h) => h === `/projects/1/connect/${row.slug}?reconnect=${row.id}`), `reconnect link present: ${links.join(', ')}`);
    assert.ok((await page.$$eval('button', (els) => els.filter((b) => b.textContent?.trim() === 'Check now').length)) >= 1, 'Check now button');
    await page.goto(`${base}/overview`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('section[aria-label="Needs attention"]').innerText(), /attention/);
    await page.goto(`${base}/projects/1/connect/${row.slug}?reconnect=${row.id}`, { waitUntil: 'networkidle' });
    assert.ok(await page.$('[data-reconnect]'), 'the connect page is in reconnect mode');
    assert.equal(await page.$eval('input[name=sourceId]', (e) => (e as HTMLInputElement).value), row.sourceId);
    assert.ok(await page.$('input[name=replaceId]'), 'replaceId travels with the form');
  } finally {
    await db.integration.update({ where: { id: row.id }, data: before });
    await browser.close();
  }
});

test('report page: a writer sees Retry and Reconnect for a failed source above the editor, and Retry repairs it (review C1)', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const r = await db.report.findUniqueOrThrow({ where: { id: 1 } });
  const original = JSON.stringify(r.data);
  const data = JSON.parse(original);
  data.sources[0].data_status = 'error';
  data.sources[0].error = 'forced for the test';
  await db.report.update({ where: { id: 1 }, data: { data } });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/1`, { waitUntil: 'networkidle' });
    const retry = page.locator('button:has-text("Retry")').first();
    await retry.waitFor();
    assert.ok(await page.$(`a[href*="?reconnect=${data.sources[0].integrationId}"]`), 'Reconnect link for the failed source');
    await retry.click();
    await page.waitForFunction(() => !document.body.innerText.includes('forced for the test'), undefined, { timeout: 60000 });
    const after = await db.report.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal((after.data as any).sources[0].data_status, 'ok', 'the retry regenerated the source');
  } finally {
    await db.report.update({ where: { id: 1 }, data: { data: JSON.parse(original) } });
    await browser.close();
  }
});

test('public report: every account block has the "About these numbers" control, the footer carries the generic note, and print lists the footnotes', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/r/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj`, { waitUntil: 'networkidle' });
    const blocks = await page.$$eval('section.print-section', (els) => els.filter((s) => s.querySelector('.pbadge, [data-platform]') || s.querySelector('h2')).length);
    const notes = await page.$$eval('details.data-note', (els) => els.length);
    assert.ok(notes >= 1 && notes <= blocks, `one control per account block (${notes} of ${blocks})`);
    await page.click('details.data-note > summary');
    assert.match(await page.locator('details.data-note[open] .data-note-body').first().innerText(), /About these numbers/i);
    assert.match(await page.locator('[data-data-note-footer]').innerText(), /Data fetched/);
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.$eval('.data-footnotes', (e) => getComputedStyle(e).display !== 'none'), 'footnotes visible in print');
    assert.ok(await page.$eval('details.data-note', (e) => getComputedStyle(e).display === 'none'), 'controls hidden in print');
  } finally {
    await browser.close();
  }
});
