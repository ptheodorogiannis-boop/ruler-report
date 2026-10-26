// Task 7: the live views render from data loaded in the browser store, and the browser bundle pulls in nothing that needs
// a server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import type { Seed } from '../src/seed/types';
import { initStore } from '../src/server/store';
import { loadNewReport, loadPublic, loadReportPage } from '../src/views/load';
import { ReportPage } from '../src/views/ReportPageView';
import { PublicPage } from '../src/views/PublicReportView';
import { NewReport } from '../src/views/NewReportView';
import { I18nProvider } from '@/components/i18n-provider';
import { dictFor, lookupFor } from '@/lib/i18n';
import { setRequestLocale } from '@/lib/i18n/request';
import { rangeLength } from '@/lib/util/dates';
import { ALL_NAMESPACES } from '../src/i18n-all';
import { demoAliasPlugin, repoRoot } from '../aliases.mjs';

const seed = JSON.parse(readFileSync('demo-host/capture-out/seed.json', 'utf8')) as Seed;
const inApp = (locale: 'en' | 'el', el: any) => {
  setRequestLocale(locale, lookupFor(locale));
  return renderToStaticMarkup(h(I18nProvider, { locale, dict: dictFor(locale, ALL_NAMESPACES), children: el }));
};
const token = (id: number) => seed.reports.find((r) => r.id === id)!.shareToken as string;

test('report page renders the editor, the analysis panel and the PDF menu for report 1', async () => {
  initStore(seed, null);
  const d = await loadReportPage(1, 'report');
  assert.ok(d, 'report 1 loads');
  const html = inApp('en', h(ReportPage, { d: d!, kind: 'report', locale: 'en' }));
  assert.match(html, /Acme Running Co/);
  assert.match(html, /data-block-analyse=/, 'per-block AI controls of the editor');
  assert.match(html, /data-ai-language/, 'the analysis panel');
  assert.match(html, /href="\/api\/pdf\/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj\?layout=flow(&amp;lang=en)?"/, 'the PDF menu replaces browser print');
  assert.match(html, /href="\/api\/v2\/reports\/1\/export\.csv"/);
  assert.doesNotMatch(html, /\/studio"/, 'no Studio button in the demo');
  assert.equal(await loadReportPage(1, 'dashboard'), null, 'a report id opened as a dashboard is missing');
});

test('client link renders the cover, the sources and Greek labels with lang el', async () => {
  initStore(seed, null);
  const d = await loadPublic(token(1), 'report', { lang: 'el' });
  assert.ok(d && d.locale === 'el');
  const html = inApp('en', h(PublicPage, { d: d!, token: token(1), kind: 'report', query: 'lang=el' }));
  assert.match(html, /class="report-root[^"]*"[^>]*lang="el"/);
  assert.match(html, /Πηγ[έε]ς/, 'sources heading in Greek');
  assert.match(html, /Δαπάνη/, 'a Greek metric label');
  assert.match(html, /href="\/api\/pdf\/[^"]+layout=pages[^"]*lang=el/, 'the PDF links carry the language');
  const en = await loadPublic(token(1), 'report', {});
  assert.match(inApp('en', h(PublicPage, { d: en!, token: token(1), kind: 'report', query: '' })), /Sources/i);
});

test('a password-protected link shows the gate with the demo password hint', async () => {
  initStore(seed, null);
  const d = await loadPublic(token(5), 'report', {});
  const html = inApp('en', h(PublicPage, { d: d!, token: token(5), kind: 'report', query: '' }));
  assert.match(html, /name="password"/);
  assert.match(html, /data-demo-password-hint/);
  assert.match(html, /demo1234/);
});

test('client dashboard honours an offered preset and shows the period picker', async () => {
  initStore(seed, null);
  const d = await loadPublic(token(2), 'dashboard', { preset: 'last_7d', compare: true });
  assert.equal(rangeLength(d!.view.range), 7);
  const html = inApp('en', h(PublicPage, { d: d!, token: token(2), kind: 'dashboard', query: 'preset=last_7d&compare=1' }));
  assert.match(html, /data-period-picker/);
  assert.match(html, /<option value="last_7d" selected/);
});

test('new report view lists project 1 and its active integrations', async () => {
  initStore(seed, null);
  const pick = await loadNewReport('kind=report');
  assert.equal(pick.project, null);
  assert.match(inApp('en', h(NewReport, { d: pick })), /Acme Running Co/);
  const d = await loadNewReport('project=1&kind=report');
  const active = seed.integrations.filter((i) => i.projectId === 1 && i.status === 'active');
  assert.equal(d.integrations.length, active.length);
  const html = inApp('en', h(NewReport, { d }));
  for (const i of active.slice(0, 3)) assert.ok(html.includes(String(i.name)) || html.includes(String(d.integrations.find((x) => x.id === i.id)!.platform)), `lists ${i.name}`);
});

test('review C1: a report made in the wizard has a client link, Copy link and the PDF menu', async () => {
  initStore(seed, null);
  const { createReportAction } = await import('../src/server/actions');
  const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
  const r = await createReportAction({ projectId: 1, kind: 'report', title: 'Wizard link', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [seed.integrations.find((i) => i.projectId === 1)!.id as number] });
  assert.ok(r.ok);
  const d = await loadReportPage(r.ok ? r.id : -1, 'report');
  const html = inApp('en', h(ReportPage, { d: d!, kind: 'report', locale: 'en' }));
  assert.match(html, /Copy link/);
  assert.match(html, /href="\/api\/pdf\/[^"]+layout=flow/);
  assert.ok(await loadPublic(d!.r.shareToken, 'report', {}), 'the client link opens');
});

test('review I4: the client link follows the viewer language when the link names none, and the agency PDF menu sends it', async () => {
  const { clientLang } = await import('../src/views/PublicReportView');
  assert.equal(clientLang('', 'el'), 'el');
  assert.equal(clientLang('lang=en', 'el'), 'en');
  assert.equal(clientLang('', 'en'), undefined);
  initStore(seed, null);
  const d = await loadReportPage(1, 'report');
  assert.match(inApp('el', h(ReportPage, { d: d!, kind: 'report', locale: 'el' })), /href="\/api\/pdf\/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj\?layout=flow&amp;lang=el"/);
});

test('review I5: the screens the demo owns have no English left in Greek', async () => {
  initStore(seed, null);
  const d = await loadReportPage(1, 'report');
  const page = inApp('el', h(ReportPage, { d: d!, kind: 'report', locale: 'el' })).replace(/<[^>]+>/g, ' ');
  for (const en of ['Email this', 'Delete report', 'Sharing is disabled', 'snapshot']) assert.ok(!page.includes(en), `report page: ${en}`);
  const wizard = inApp('el', h(NewReport, { d: await loadNewReport('project=1&kind=report') })).replace(/<[^>]+>/g, ' ');
  assert.ok(!/New report/.test(wizard), 'wizard heading');
  const { demoT } = await import('../src/demo-strings');
  assert.match(demoT('el', 'pdfOnlySamples'), /για τα δείγματα/, 'grammar');
  const { PAGE } = await import('../build.mjs');
  assert.match(PAGE({}), /Φόρτωση/, 'the boot screen speaks Greek too');
});

test('the browser bundle builds and pulls in nothing that needs a server', async () => {
  const r = await build({
    entryPoints: [path.join(repoRoot, 'demo-host/src/main.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    metafile: true,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    inject: [path.join(repoRoot, 'demo-host/src/shims/process.ts')],
    tsconfig: path.join(repoRoot, 'demo-host/tsconfig.json'),
    plugins: [demoAliasPlugin({ browser: true })],
  });
  const inputs = Object.keys(r.metafile!.inputs);
  const bad = inputs.filter((p) => /node_modules[\\/](@prisma[\\/]client|\.prisma|nodemailer|playwright|bcryptjs|jose|ajv)[\\/]|node_modules[\\/]next[\\/]dist[\\/]server|src[\\/]lib[\\/]db\.ts|src[\\/]lib[\\/]auth\.ts|next[\\/]headers/.test(p));
  assert.deepEqual(bad, []);
  // Claude pages have no 'unsafe-eval': code that builds functions from strings dies on load
  const code = r.outputFiles![0].text;
  assert.equal(/new Function\s*\(|\beval\s*\(/.test(code), false, 'no new Function / eval in the bundle');
  assert.ok(inputs.some((p) => /src[\\/]components[\\/]report-editor\.tsx$/.test(p)), 'the real editor is in the bundle');
});
