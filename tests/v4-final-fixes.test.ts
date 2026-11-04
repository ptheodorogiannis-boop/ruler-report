import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/lib/i18n';

// Fixes from the final review of the editor and report management work
// (docs/superpowers/specs/2026-11-04-editor-report-management-design.md).

test('the app pages ship the strings of the Ask box and the metric picker (no raw keys)', async () => {
  const { APP_NAMESPACES } = await import('../src/lib/i18n/namespaces');
  const { dictFor } = await import('../src/lib/i18n');
  const { I18nProvider } = await import('../src/components/i18n-provider');
  const { AskBox } = await import('../src/components/ask-box');
  for (const locale of ['en', 'el'] as const) {
    const dict = dictFor(locale, APP_NAMESPACES);
    const html = renderToStaticMarkup(createElement(I18nProvider, { locale, dict, children: createElement(AskBox, { reportId: 1, suggestions: [] }) }));
    assert.doesNotMatch(html, /askbox\./, `${locale}: ${html.slice(0, 200)}`);
    assert.ok(dict['catalog.group.delivery'], `${locale}: picker group names`);
  }
});

test('an archived report is never sent: "Send now" on its held run refuses, nothing is mailed, the run stays held', async () => {
  const { db } = await import('../src/lib/db');
  const { addIntegration, makeCompany } = await import('./helpers');
  const { runAutomation, deliverRun } = await import('../src/lib/services/automations');
  const { archiveReport } = await import('../src/lib/services/reports');
  const { company, project } = await makeCompany('Archived delivery Co');
  const fine = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_ok' });
  const broken = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_broken', demo: false, credentials: { oauth: 'meta' } });
  const a = await db.automation.create({ data: { projectId: project.id, title: 'Held', frequency: 'monthly', channels: ['email'], emails: ['client@x.test'], integrationIds: [fine.id, broken.id], holdOnFailure: true, dayOfMonth: 1, hour: 8, enabled: true, nextRunAt: new Date() } });
  const r = await runAutomation(a.id);
  assert.equal(r.status, 'held');
  const run = await db.automationRun.findFirstOrThrow({ where: { automationId: a.id } });
  await archiveReport(r.report.id, company.id);
  const before = await db.report.findUniqueOrThrow({ where: { id: r.report.id } });
  await assert.rejects(deliverRun(run.id), /archived/i);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 0, 'no dead link mailed');
  assert.equal((await db.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'held');
  assert.equal(JSON.stringify((await db.report.findUniqueOrThrow({ where: { id: r.report.id } })).data), JSON.stringify(before.data), 'no new data');
});

test('the metric picker reads every page of /metrics (a big Sheet has more than 100), and a failed page is an error, not a spinner', async () => {
  const { fetchAllPages } = await import('../src/lib/api/fetch-all');
  const asked: string[] = [];
  const fake = (async (url: string) => {
    asked.push(url);
    const page = Number(new URL(url, 'http://x').searchParams.get('page'));
    const data = Array.from({ length: page === 1 ? 100 : 50 }, (_, i) => ({ id: (page - 1) * 100 + i }));
    return new Response(JSON.stringify({ data, meta: { last_page: 2 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const all = await fetchAllPages<{ id: number }>('/api/v2/metrics?integration_slug=google_sheets&per_page=100&pickable=1', fake);
  assert.equal(all.length, 150);
  assert.deepEqual(asked, ['/api/v2/metrics?integration_slug=google_sheets&per_page=100&pickable=1&page=1', '/api/v2/metrics?integration_slug=google_sheets&per_page=100&pickable=1&page=2']);
  const broken = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(fetchAllPages('/api/v2/metrics?x=1', broken), /500/);
});
