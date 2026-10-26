// Plan F browser checks against a running dev server: NAV_BASE=http://localhost:3104.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';

const base = process.env.NAV_BASE;

async function signIn(page: any) {
  await page.goto(`${base}/login`);
  await page.fill('#email', 'admin@demo.local');
  await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
}

async function demoProject() {
  const project = await db.project.findUniqueOrThrow({ where: { id: 1 } });
  const integration = await db.integration.findFirstOrThrow({ where: { projectId: 1, slug: 'facebook_ads' } });
  return { project, integration };
}

test('client link: a dashboard with client presets shows the Live label, switches period through the form, and a preset outside the list falls back', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { createReport } = await import('../src/lib/services/reports');
  const { project, integration } = await demoProject();
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'dashboard', isDefault: true } });
  const dash = await createReport({ companyId: project.companyId, projectId: project.id, kind: 'dashboard', title: 'Browser dash', preset: 'last_30d', templateId: tpl.id, integrationIds: [integration.id], clientPresets: ['last_7d'] });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${base}/d/${dash.shareToken}`, { waitUntil: 'networkidle' });
    await page.locator('[data-dashboard-controls]').waitFor();
    assert.match(await page.locator('[data-live-label]').innerText(), /Live · updated \d\d:\d\d/);
    assert.equal(await page.locator('select[name=preset]').inputValue(), 'last_30d');
    assert.equal(await page.locator('[data-auto-refresh]').count(), 1, 'a refresh timer on a rolling preset');
    await page.selectOption('select[name=preset]', 'last_7d');
    await Promise.all([page.waitForURL(/preset=last_7d/), page.click('[data-period-picker] button:has-text("Apply")')]);
    await page.locator('[data-dashboard-controls]').waitFor();
    assert.equal(await page.locator('select[name=preset]').inputValue(), 'last_7d', 'the picked preset is served');
    await page.goto(`${base}/d/${dash.shareToken}?preset=last_90d`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('select[name=preset]').inputValue(), 'last_30d', 'a preset outside the allow-list falls back to the saved one');
  } finally {
    await browser.close();
    await db.report.delete({ where: { id: dash.id } }).catch(() => null);
  }
});

test('report page: Duplicate opens the copy; the goals tab shares a public goals page that renders', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const { createReport } = await import('../src/lib/services/reports');
  const { project, integration } = await demoProject();
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const rep = await createReport({ companyId: project.companyId, projectId: project.id, kind: 'report', title: 'Browser original', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [integration.id] });
  const ids = [rep.id];
  const hadToken = project.goalsToken;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(60000);
    await signIn(page);
    await page.goto(`${base}/reports/${rep.id}`, { waitUntil: 'networkidle' });
    await page.locator('summary:has-text("Sharing & delivery")').click();
    await Promise.all([page.waitForURL((u: URL) => /\/reports\/\d+$/.test(u.pathname) && !u.pathname.endsWith(`/${rep.id}`)), page.click('[data-report-more] button:has-text("Duplicate")')]);
    const copyId = Number(page.url().split('/').pop());
    ids.push(copyId);
    await page.locator('text=Copy of Browser original').first().waitFor();
    const copy = await db.report.findUniqueOrThrow({ where: { id: copyId } });
    assert.equal(copy.title, 'Copy of Browser original');
    assert.notEqual(copy.shareToken, rep.shareToken);

    await page.goto(`${base}/projects/${project.id}?tab=goals`, { waitUntil: 'networkidle' });
    const share = page.locator('[data-goals-share]');
    await share.waitFor();
    if ((await share.getAttribute('data-goals-share')) === 'off') await share.locator('button:has-text("Share with the client")').click();
    await page.locator('[data-goals-share="on"]').waitFor();
    const url = (await page.locator('[data-goals-share] code').first().innerText()).trim();
    assert.match(url, /\/g\/[A-Za-z0-9_-]{24,}$/, url);
    const pub = await (await browser.newContext()).newPage();
    pub.setDefaultTimeout(60000);
    await pub.goto(url, { waitUntil: 'networkidle' });
    assert.match(await pub.locator('h1').first().innerText(), /Goals/);
    assert.ok((await pub.locator('[data-goals], .card').count()) >= 1, 'goal cards or the empty card');
  } finally {
    await browser.close();
    await db.report.deleteMany({ where: { id: { in: ids } } }).catch(() => null);
    if (!hadToken) await db.project.update({ where: { id: project.id }, data: { goalsToken: null, goalsPassword: null } }).catch(() => null);
  }
});
