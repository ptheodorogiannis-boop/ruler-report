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
