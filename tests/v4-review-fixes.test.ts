// Fixes from the final review of docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md: each test pins one
// finding (sample Matomo rows, Matomo request hardening, image copies, campaign scope of a widget from another account,
// per-row metrics at the Campaigns level, Meta action names, Matomo columns, Greek labels).
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { encryptJson } from '../src/lib/crypto';
import { db } from '../src/lib/db';
import { addIntegration, makeCompany } from './helpers';

async function listen(handler: http.RequestListener): Promise<{ base: string; close: () => void }> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

// ── sample Matomo rows (review 7): a Matomo row without an address and a token is sample data, as before the connector
test('a Matomo row without address and token stays sample data: demo connector, sample label, a passing check', async () => {
  const { connectorFor, usesSampleData } = await import('../src/lib/connectors');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { matomoConnector } = await import('../src/lib/connectors/matomo');
  assert.equal(connectorFor({ slug: 'matomo', credentials: null }), demoConnector);
  assert.equal(connectorFor({ slug: 'matomo', credentials: { baseUrl: 'https://m.example' } }), demoConnector);
  assert.equal(connectorFor({ slug: 'matomo', credentials: { baseUrl: 'https://m.example', tokenAuth: 't' } }), matomoConnector);
  assert.equal(usesSampleData('matomo', null), true);
  assert.equal(usesSampleData('matomo', { baseUrl: 'https://m.example', tokenAuth: 't' }), false);
  assert.equal(usesSampleData('facebook_ads', { accessToken: 't' }), false);
  assert.equal(usesSampleData('facebook_ads', { demo: true }), true);
  assert.equal(usesSampleData('snapchat_ads', null), true, 'a platform without a live connector');

  const { checkAll } = await import('../src/lib/services/health');
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'matomo', { demo: false, sourceId: '' });
  await checkAll({ companyId: company.id });
  const after = (await db.integration.findUnique({ where: { id: row.id } }))!;
  assert.equal(after.health, 'ok');
  assert.equal(after.healthAlertKind, null, 'no failing alert');
});

// ── Matomo request hardening (review 8)
test('Matomo: a redirect is not followed (the token never reaches another address) and says where to point instead', async () => {
  const { listMatomoSites } = await import('../src/lib/connectors/matomo');
  const hits: string[] = [];
  const srv = await listen((req, res) => {
    hits.push(req.url ?? '');
    if (req.url?.startsWith('/old/')) res.writeHead(307, { location: '/new/index.php' }).end();
    else res.writeHead(200, { 'content-type': 'application/json' }).end('[]');
  });
  try {
    await assert.rejects(listMatomoSites({ baseUrl: `${srv.base}/old`, tokenAuth: 'tok' }), /Matomo redirected to .*\/new\/index\.php/);
    assert.deepEqual(hits, ['/old/index.php'], 'nothing sent to the redirect target');
  } finally {
    srv.close();
  }
});

test('Matomo: plain http to this machine is for local tests only; production asks for https', async () => {
  const { listMatomoSites } = await import('../src/lib/connectors/matomo');
  const before = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = 'production';
  try {
    await assert.rejects(listMatomoSites({ baseUrl: 'http://127.0.0.1:9/matomo', tokenAuth: 'tok' }), /use the https:\/\/ address/);
  } finally {
    (process.env as any).NODE_ENV = before;
  }
});

test('Matomo: an answer over the size cap is refused instead of read whole', async () => {
  const { matomoApi, MAX_ANSWER_BYTES } = await import('../src/lib/connectors/matomo');
  const big = new Response('x'.repeat(MAX_ANSWER_BYTES + 10), { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(matomoApi({ baseUrl: 'https://m.example', tokenAuth: 't' }, 'API.getMatomoVersion', {}, (async () => big) as any), /answer is too large/);
});

// ── image copies: size checked before reading (review 8), names by the full address (review 3), a time budget
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const tableData = (thumbs: (string | null)[]) =>
  ({ range: { start: '2026-10-01', end: '2026-10-31' }, comparison: null, generated_at: '', sources: [], sections: [{ id: 's', title: 'Posts', blocks: [{ integrationId: 1, platform: 'Facebook', slug: 'facebook', account_name: 'A', widget: { reference_key: 'fb:top_posts', key: 'top_posts', label: 'Top posts', format: 'number', diff_type: 'neutral', value: { type: 'table', columns: ['post'], rows: thumbs.map((_, i) => [`p${i}`]), total_rows: thumbs.length, thumbs } } }] }] }) as any;
const thumbsOf = (d: any) => d.sections[0].blocks[0].widget.value.thumbs as (string | null)[];

test('image copies: a declared size over 300 KB is skipped without reading the body; an undeclared one stops at the cap', async () => {
  const { keepThumbnails } = await import('../src/lib/media/thumbs');
  const { company } = await makeCompany();
  let bodyRead = false;
  // highWaterMark 0: the stream is pulled only when someone reads it
  const declared = new Response(new ReadableStream({ pull: (c) => ((bodyRead = true), c.enqueue(new Uint8Array(1024)), c.close()) }, { highWaterMark: 0 }), { headers: { 'content-type': 'image/jpeg', 'content-length': String(400 * 1024) } });
  const undeclared = new Response(new ReadableStream({ start: (c) => { for (let i = 0; i < 400; i++) c.enqueue(new Uint8Array(1024)); c.close(); } }), { headers: { 'content-type': 'image/jpeg' } });
  const fetchFn = (async (u: string) => (u.includes('declared') && !u.includes('undeclared') ? declared : undeclared)) as any;
  const out = await keepThumbnails(tableData(['https://cdn.example/declared.jpg', 'https://cdn.example/undeclared.jpg']), company.id, fetchFn);
  assert.deepEqual(thumbsOf(out), [null, null]);
  assert.equal(bodyRead, false, 'the declared-too-big body is never read');
});

test('image copies: two images that differ only in their query (proxied images) are two copies, never one shared', async () => {
  const { keepThumbnails } = await import('../src/lib/media/thumbs');
  const { company } = await makeCompany();
  const fetchFn = (async () => new Response(PNG, { headers: { 'content-type': 'image/png' } })) as any;
  const a = 'https://external.fbcdn.net/safe_image.php?d=1&url=https%3A%2F%2Fshop.example%2Fa.jpg';
  const b = 'https://external.fbcdn.net/safe_image.php?d=1&url=https%3A%2F%2Fshop.example%2Fb.jpg';
  const out = thumbsOf(await keepThumbnails(tableData([a, b]), company.id, fetchFn));
  assert.ok(out[0] && out[1]);
  assert.notEqual(out[0], out[1]);
});

test('image copies: the whole copy step has a time budget; what is left keeps no image', async () => {
  const { keepThumbnails } = await import('../src/lib/media/thumbs');
  const { company } = await makeCompany();
  const slow = (async (_u: string, init?: RequestInit) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(PNG, { headers: { 'content-type': 'image/png' } })), 5000);
      init?.signal?.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))));
    })) as any;
  const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example/slow-${i}.png`);
  const started = Date.now();
  const out = thumbsOf(await keepThumbnails(tableData(urls), company.id, slow, { budgetMs: 300 }));
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  assert.deepEqual(out, urls.map(() => null));
});

test('image copies are kept on every save of a frozen report: editing its layout and regenerating one account', async () => {
  const { readFileSync } = await import('node:fs');
  // both paths store values a person will see on the client link and in the PDF later
  assert.match(readFileSync('src/lib/layout/service.ts', 'utf8'), /keepThumbnails\(/);
  assert.match(readFileSync('src/lib/engine/report.ts', 'utf8').split('export async function regenerateSource')[1] ?? '', /keepThumbnails\(/);
});

void encryptJson;

// ── a metric from another account inside a scoped ads block (review 1): it reads its own account, account-wide
test('a Google Ads metric in a Meta block that picks campaigns is fetched account-wide, saved, keyed and shown as such', async () => {
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { createReport } = await import('../src/lib/services/reports');
  const { indexValues, widgetValueKey } = await import('../src/lib/layout/compose');
  const { layoutFingerprint } = await import('../src/lib/engine/report');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const gads = await addIntegration(company.id, project.id, 'google_adwords');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Scope', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id, gads.id] });
  const reload = () => db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const layout = JSON.parse(JSON.stringify((await reportView(await reload(), { includeHidden: true })).layout));
  const block = layout.blocks.find((b: any) => b.integrationId === meta.id);
  // a block holding only the Google Ads widget: two different Meta scopes need the same values
  const only = (ids: string[]) => ({ version: 1, blocks: [{ id: 'm', title: 'Meta', integrationId: meta.id, slug: 'facebook_ads', campaigns: { mode: 'pick', ids }, widgets: [{ id: 'fx', slug: 'google_adwords', key: 'spend', component: 'number_v1', integrationId: gads.id, x: 0, y: 0, w: 3, h: 2 }] }] }) as any;
  assert.equal(layoutFingerprint(only(['c1'])), layoutFingerprint(only(['c2'])), 'the Meta scope does not change what the Google Ads widget needs');
  block.campaigns = { mode: 'pick', ids: ['c1'] };
  block.widgets.push({ id: 'fx', slug: 'google_adwords', key: 'spend', component: 'number_v1', integrationId: gads.id, x: 0, y: 80, w: 3, h: 2 });
  const saved = await saveLayout(await reload(), layout);
  assert.equal(widgetValueKey(block.widgets.at(-1), block, saved.data), `${gads.id}:spend`);
  const stored = indexValues(saved.data).get(`${gads.id}:spend`);
  assert.equal(stored?.widget.value.type, 'number', JSON.stringify(stored?.widget.value).slice(0, 160));
  const view = await reportView(await reload());
  const fx = view.data.sections.find((s) => s.id === block.id)!.blocks.find((b) => b.id === 'fx')!;
  assert.equal(fx.widget.value.type, 'number', JSON.stringify(fx.widget.value).slice(0, 160));
  assert.equal((fx.widget.value as any).value, (stored!.widget.value as any).value);
  // the block's own widgets still follow its scope
  const own = view.data.sections.find((s) => s.id === block.id)!.blocks.find((b) => b.integrationId === meta.id && b.widget.key === 'spend');
  if (own) assert.ok(own.campaignScope, 'the Meta spend is the scoped one');
});

// ── Results / Cost per result at the Campaigns level (review 4): they count each ad set's own event, so never per campaign
test('a Campaigns-level table never shows Results or Cost per result, even when they were ticked at the Ads level', async () => {
  const { resolveContainer, metricsAtLevel } = await import('../src/lib/layout/container');
  const ctx = { id: 7, slug: 'facebook_ads', name: 'Acme', sourceId: 'act_1', config: {}, credentials: { demo: true } } as any;
  const session = { getBreakdown: async () => [{ key: '11', label: 'Brand', values: { spend: 10, results: 0 } }] } as any;
  const w = { id: 'w', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 7, x: 0, y: 0, w: 12, h: 6, custom: { metrics: ['spend', 'results', 'cost_per_result'] } } as any;
  const v = (await resolveContainer(ctx, w, { start: '2026-10-01', end: '2026-10-31' }, null, session, [{ id: '11', name: 'Brand', status: 'active' }])) as any;
  assert.deepEqual(v.metrics.map((m: any) => m.key), ['spend']);
  const ads = (await resolveContainer(ctx, { ...w, custom: { ...w.custom, level: 'ad' } }, { start: '2026-10-01', end: '2026-10-31' }, null, session, [])) as any;
  assert.deepEqual(ads.metrics.map((m: any) => m.key), ['spend', 'results', 'cost_per_result']);
  // switching the settings back to Campaigns drops them from the widget too
  assert.deepEqual(metricsAtLevel(['spend', 'results', 'cost_per_result'], 'campaign'), ['spend']);
  assert.deepEqual(metricsAtLevel(['spend', 'results'], 'ad'), ['spend', 'results']);
  assert.equal(metricsAtLevel(undefined, 'campaign'), undefined);
});

// ── Meta's action name for a checkout (review 5): initiate_checkout, as the insights actions and meta.ts's ACTION map name it
test('a checkout-optimised ad set counts offsite_conversion.fb_pixel_initiate_checkout, labelled Checkout started', async () => {
  const { promotedObjectAction, resultLabel } = await import('../src/lib/connectors/meta-results');
  const { t } = await import('../src/lib/i18n');
  const type = promotedObjectAction('OFFSITE_CONVERSIONS', { custom_event_type: 'INITIATED_CHECKOUT' });
  assert.equal(type, 'offsite_conversion.fb_pixel_initiate_checkout');
  assert.equal(resultLabel(type, (k: string) => t('en', k)), 'Checkout started');
  assert.equal(resultLabel(type, (k: string) => t('el', k)), 'Έναρξη ολοκλήρωσης αγοράς');
});

// ── Greek labels for the new metrics and table columns (final review)
test('Greek client pages name the new metrics and table columns in Greek', async () => {
  const { metricLabel, DIMENSION_LABELS_EL } = await import('../src/lib/catalog/labels');
  const el = (reference_key: string, title: string) => metricLabel({ reference_key, title }, 'el');
  assert.equal(el('fb_ads:results', 'Results'), 'Αποτελέσματα');
  assert.equal(el('fb_ads:cost_per_result', 'Cost per result'), 'Κόστος ανά αποτέλεσμα');
  assert.equal(el('ga4:top_page_titles', 'Top pages by title'), 'Κορυφαίες σελίδες ανά τίτλο');
  assert.equal(el('matomo:top_page_titles', 'Top pages by title'), 'Κορυφαίες σελίδες ανά τίτλο');
  assert.equal(el('matomo:sessions', 'Sessions'), el('ga4:sessions', 'Sessions'), 'Matomo speaks like GA4');
  assert.equal(el('matomo:conversions_by_goal', 'Conversions by goal'), 'Μετατροπές ανά στόχο');
  assert.equal(DIMENSION_LABELS_EL.page_title, 'Τίτλος σελίδας');
  assert.equal(DIMENSION_LABELS_EL.goal, 'Στόχος');
});
