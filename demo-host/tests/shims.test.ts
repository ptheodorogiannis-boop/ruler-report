// Task 3: browser stand-ins for node, the connectors, Next navigation, the Anthropic call and the app's /api routes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash as nodeHash } from 'node:crypto';
import { createHash } from '../src/shims/node-crypto';
import { randomToken } from '../src/shims/crypto';
import { connectorFor } from '@/lib/connectors';
import { demoConnector } from '@/lib/connectors/demo';
import { isMediaOrHttps } from '@/lib/media/url';
import { installAnthropicBridge } from '../src/server/anthropic-bridge';
import { handleApi } from '../src/server/api';
import { setBusHandlers } from '../src/bus';
import { useRouter } from 'next/navigation';
import type { Seed } from '../src/seed/types';
import { createMemDb } from '../src/server/memdb';
import { setDb } from '../src/shims/db';
import { createReport } from '@/lib/services/reports';
import { analyse } from '@/lib/ai/insights';

const seed = JSON.parse(readFileSync('demo-host/capture-out/seed.json', 'utf8')) as Seed;

test('sha1 and sha256 shims match node', () => {
  for (const s of ['', 'abc', 'Δαπάνη · spend ✓'.repeat(9)]) {
    assert.equal(createHash('sha1').update(s).digest('hex'), nodeHash('sha1').update(s).digest('hex'), `sha1 of ${s.slice(0, 10)}`);
    assert.equal(createHash('sha256').update(s).digest('hex'), nodeHash('sha256').update(s).digest('hex'), `sha256 of ${s.slice(0, 10)}`);
  }
});

test('tokens are url-safe and the right length', () => {
  const t = randomToken(24);
  assert.equal(t.length, 32);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
});

test('connectorFor always returns the demo connector, and generated sources are healthy', async () => {
  assert.equal(connectorFor({ slug: 'facebook_ads', credentials: { accessToken: 'real-looking' } }), demoConnector);
  assert.equal(connectorFor({ slug: 'google_analytics_4', credentials: null }), demoConnector);
  setDb(createMemDb(seed));
  const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
  const ids = seed.integrations.filter((i) => i.projectId === 1).map((i) => i.id as number);
  const r = await createReport({ companyId: 1, projectId: 1, kind: 'report', title: 'Health', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: ids } as any);
  const sources = (r.data as any).sources as { data_status: string; platform: string }[];
  assert.ok(sources.length >= 5);
  assert.deepEqual(sources.filter((s) => s.data_status !== 'ok').map((s) => s.platform), [], 'every source returns sample numbers');
});

test('uploaded images are accepted as data URLs', () => {
  assert.equal(isMediaOrHttps('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isMediaOrHttps('https://example.com/a.png'), true);
  assert.equal(isMediaOrHttps('javascript:alert(1)'), false);
  assert.equal(isMediaOrHttps('data:text/html;base64,PGI+'), false);
  assert.equal(isMediaOrHttps('data:image/svg+xml;base64,PHN2Zy8+'), true, 'embedded SVG logos');
});

const data = { range: { start: '2026-09-01', end: '2026-09-30' }, comparison: null, sources: [], generated_at: '2026-10-01T00:00:00Z', sections: [] } as any;

test('the bridge answers the Anthropic call from sample', async () => {
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'demo-bridge';
  let asked = '';
  try {
    installAnthropicBridge(async () => (async (input: string) => ((asked = input), { text: '<p>ok</p>', truncated: false, modelTierApplied: 'default' })) as any);
    const r = await analyse(data, 'Acme');
    assert.deepEqual(r, { html: '<p>ok</p>', ai: true });
    assert.match(asked, /Client: Acme/);
    assert.match(asked, /senior performance-marketing analyst/, 'the system prompt travels in the input');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the bridge falls back when Claude is not available', async () => {
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'demo-bridge';
  try {
    installAnthropicBridge(async () => null);
    const r = await analyse(data, 'Acme');
    assert.equal(r.ai, false);
    assert.match(r.html, /Claude is not available in this view/);
    installAnthropicBridge(async () => (async () => Promise.reject({ code: 'not_granted', message: 'no' })) as any);
    const r2 = await analyse(data, 'Acme');
    assert.equal(r2.ai, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('review I3: block analyses and Ask use the quick tier, the full analysis the default one', async () => {
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'demo-bridge';
  const tiers: string[] = [];
  try {
    installAnthropicBridge(async () => (async (_i: string, o?: any) => (tiers.push(o?.modelTier), { text: '<p>ok</p>', truncated: false })) as any);
    const { analyseBlock } = await import('@/lib/ai/insights');
    const d = { ...data, sections: [{ id: 's1', title: 'Meta', blocks: [] }] };
    await analyse(d, 'Acme');
    await analyseBlock(d, 's1', { tone: 'general', projectName: 'Acme' });
    assert.deepEqual(tiers.slice(-2), ['default', 'quick']);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('review I2: Ask answers with the app rule-based reply when Claude is unavailable', async () => {
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'demo-bridge';
  try {
    installAnthropicBridge(async () => null);
    setDb(createMemDb(seed));
    const res = await handleApi(new URL('http://demo/api/v2/reports/1/ask'), { method: 'POST', body: JSON.stringify({ question: 'How did spend change?' }) });
    assert.equal(res!.status, 200);
    const j = await res!.json();
    assert.equal(j.ai, false);
    assert.ok(typeof j.answer === 'string' && j.answer.length > 10 && !/Anthropic API|503/.test(j.answer), j.answer);
    assert.equal(process.env.ANTHROPIC_API_KEY, 'demo-bridge', 'the key placeholder is restored');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('app api paths answer in the browser', async () => {
  const nope = await handleApi(new URL('http://demo/api/nope'));
  assert.equal(nope!.status, 404);
  assert.equal((await nope!.json()).message, 'Not available in the demo');
  const metrics = await handleApi(new URL('http://demo/api/v2/metrics?integration_slug=facebook_ads&per_page=100&search=spend'));
  const j = await metrics!.json();
  assert.ok(j.data.length >= 1 && j.data.every((d: any) => /spend/i.test(`${d.reference_key} ${d.references.title}`)), 'filtered catalog');
  assert.equal(await handleApi(new URL('https://example.com/x')), null, 'other hosts pass through');
  assert.deepEqual(await (await handleApi(new URL('http://demo/api/media')))!.json(), { items: [] });
  const fd = new FormData();
  fd.set('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'a.png');
  const up = await handleApi(new URL('http://demo/api/media'), { method: 'POST', body: fd });
  assert.equal(up!.status, 200);
  assert.match((await up!.json()).url, /^data:image\/png;base64,/);
});

test('next/navigation delegates to the shell', () => {
  const seen: string[] = [];
  setBusHandlers({ navigate: (h) => seen.push(`go ${h}`), refresh: () => seen.push('refresh') });
  const r = useRouter();
  r.push('/reports/1');
  r.refresh();
  assert.deepEqual(seen, ['go /reports/1', 'refresh']);
});
