// Task 8: the built demo in a browser, served like an Artifact (demo-host/serve.mjs), with no `window.claude`.
// Run: node demo-host/serve.mjs & NAV_BASE=http://localhost:3199 npx tsx --test demo-host/tests/e2e.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { Manifest } from '../src/route-key';
import type { Seed } from '../src/seed/types';

const base = process.env.NAV_BASE;
const manifest = JSON.parse(readFileSync('demo-host/build/views/manifest.json', 'utf8')) as Manifest;
const seed = JSON.parse(readFileSync('demo-host/build/seed.json', 'utf8')) as Seed;
const token = (id: number) => seed.reports.find((r) => r.id === id)!.shareToken as string;

async function open(viewport = { width: 1440, height: 900 }, locale = 'en-US') {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport, locale })).newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource.*404/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  return { browser, page, errors };
}

async function signIn(page: any) {
  await page.waitForSelector('#email');
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await page.press('#password', 'Enter');
  await page.waitForSelector('[data-captured-host] nav.topnav');
}

const go = async (page: any, href: string) => {
  await page.evaluate((h: string) => (window as any).__demo.navigate(h), href);
  await page.waitForFunction(() => !document.querySelector('[data-demo-loading]'), null, { timeout: 30000 });
};

test('every captured screen opens in English and in Greek without errors', { skip: !base, timeout: 600000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await signIn(page);
    const problems: string[] = [];
    for (const lang of ['en', 'el'] as const) {
      if (lang === 'el') {
        await page.click('details.umenu > summary');
        await page.click('[data-locale-switch] button[value=el]');
        await page.waitForFunction(() => document.querySelector('nav.topnav')?.textContent?.includes('Επισκόπηση'));
      }
      // the captured not-found screen is not routed: an unknown link shows the demo's own "not in the demo" card
      for (const r of manifest.routes.filter((x) => x.key !== 'not-found')) {
        await go(page, r.path);
        const state = await page.evaluate(() => ({ missing: !!document.querySelector('[data-demo-missing]'), failed: !!document.querySelector('[role=alert]'), frame: !!document.querySelector('[data-captured-host] .frame, [data-captured-host] main') }));
        if (state.missing || state.failed || !state.frame) problems.push(`${lang} ${r.path}: ${JSON.stringify(state)}`);
      }
    }
    assert.deepEqual(problems.slice(0, 10), []);
    assert.deepEqual(errors.slice(0, 10), []);
  } finally {
    await browser.close();
  }
});

test('the editor works: drag, add a metric, change the cover and see it on the client link; the AI falls back; PDF says downloads are unavailable', { skip: !base, timeout: 300000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await signIn(page);
    await go(page, '/reports/1');
    await page.waitForSelector('[title="Drag to move"]');
    const before = await page.evaluate(() => JSON.stringify((window as any).__demo.reports().find((r: any) => r.id === 1).layout));
    const handle = page.locator('[title="Drag to move"]').first();
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 4, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((b: string) => JSON.stringify((window as any).__demo.reports().find((r: any) => r.id === 1).layout) !== b, before, { timeout: 15000 });

    const block = page.locator('section[data-block]').filter({ has: page.locator('button:has-text("Add metrics")') }).first();
    const cardsBefore = await page.locator('[data-block] .card').count();
    await block.locator('button:has-text("Add metrics")').click();
    await page.waitForSelector('[data-add-metrics]');
    await page.locator('[data-add-metrics] button:has-text("Customizable")').click();
    await page.locator('[data-add-metrics] button:has-text("Infographic")').first().click();
    await page.waitForFunction((n: number) => document.querySelectorAll('[data-block] .card').length > n, cardsBefore, { timeout: 15000 });

    await page.click('button:has-text("Look")');
    await page.locator('[data-cover-options] input[name=coverLayout][value=none]').check();
    await page.waitForFunction(() => (window as any).__demo.reports().find((r: any) => r.id === 1).layout?.theme?.coverLayout === 'none', null, { timeout: 15000 });

    await page.click('[data-analyse-all]');
    await page.waitForSelector('[data-analysis-card]', { timeout: 30000 });

    await page.click('a:has-text("Open client view")');
    await page.waitForSelector('main.dossier[data-cover-layout="none"]');
    const width = await page.evaluate(() => document.getElementById('document')!.getBoundingClientRect().width);
    assert.ok(width > 800, `the client link shows the cover change (document ${width}px wide)`);
    await page.click('details.pdf-menu > summary');
    await page.click('details.pdf-menu a[href*="layout=flow"]');
    await page.waitForSelector('.demo-toast:has-text("Downloads are not available in this view")');
    assert.deepEqual(errors.slice(0, 10), []);
  } finally {
    await browser.close();
  }
});

test('the client dashboard switches period, the wizard creates a report, Reset demo removes it, and the protected link opens with the demo password', { skip: !base, timeout: 300000 }, async () => {
  const { browser, page, errors } = await open();
  try {
    await go(page, `/d/${token(2)}`);
    await page.waitForSelector('[data-period-picker]');
    await page.selectOption('[data-period-picker] select', 'last_7d');
    await page.click('[data-period-picker] button');
    await page.waitForFunction(() => (document.querySelector('[data-period-picker] select') as HTMLSelectElement)?.value === 'last_7d');
    await go(page, `/r/${token(5)}`);
    await page.fill('input[name=password]', 'wrong');
    await page.click('form button.btn-primary');
    await page.waitForSelector('text=Wrong password');
    await page.fill('input[name=password]', 'demo1234');
    await page.click('form button.btn-primary');
    await page.waitForSelector('main.dossier');

    await go(page, '/login');
    await signIn(page);
    await go(page, '/reports/new?project=1&kind=report');
    await page.waitForSelector('button.btn-primary:has-text("Generate")');
    await page.click('button.btn-primary:has-text("Generate")');
    await page.waitForSelector('[data-live-view="report-page"]', { timeout: 60000 });
    const created = await page.evaluate(() => (window as any).__demo.reports().filter((r: any) => r.id > 13).length);
    assert.equal(created, 1, 'one report created');
    await go(page, '/reports');
    await page.waitForSelector('[data-demo-created]');
    await page.click('details.umenu > summary');
    await page.click('[data-demo-reset]');
    await page.waitForSelector('.demo-toast');
    await go(page, '/reports');
    assert.equal(await page.locator('[data-demo-created]').count(), 0, 'Reset demo removes it');
    assert.deepEqual(errors.slice(0, 10), []);
  } finally {
    await browser.close();
  }
});

test('phone width has no horizontal scroll, and a Greek browser opens in Greek', { skip: !base, timeout: 300000 }, async () => {
  const { browser, page, errors } = await open({ width: 390, height: 844 });
  try {
    const wide = async (label: string) => {
      const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      assert.ok(w.s <= w.c + 1, `${label}: scrollWidth ${w.s} > ${w.c}`);
    };
    await wide('sign-in');
    await signIn(page);
    await wide('overview');
    await go(page, '/reports/1');
    await page.waitForSelector('[data-live-view="report-page"]');
    await wide('report 1');
    await go(page, `/r/${token(1)}`);
    await page.waitForSelector('main.dossier');
    await wide('client link');
    assert.deepEqual(errors.slice(0, 10), []);
  } finally {
    await browser.close();
  }
  const greek = await open({ width: 1280, height: 900 }, 'el-GR');
  try {
    await greek.page.waitForSelector('#email');
    assert.match(await greek.page.locator('body').innerText(), /Σύνδεση/);
  } finally {
    await greek.browser.close();
  }
});
