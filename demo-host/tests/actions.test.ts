// Task 4: the demo store (seed + browser overlay + reset) and the server actions the live components call.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { Seed } from '../src/seed/types';
import { canPersist, createdIds, getDb, initStore, isUnlocked, resetDemo, STORE_KEY, type StorageLike } from '../src/server/store';
import { createReportAction, generateAllBlocksAction, generateBlockAnalysisAction, loginAction, saveLayoutAction, unlockShareAction } from '../src/server/actions';
import { demoT } from '../src/demo-strings';
import { setBusHandlers } from '../src/bus';
import { reportView } from '@/lib/layout/service';

const seed = JSON.parse(readFileSync('demo-host/capture-out/seed.json', 'utf8')) as Seed;
const memoryStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
const acmeIds = seed.integrations.filter((i) => i.projectId === 1).slice(0, 3).map((i) => i.id as number);
const newReport = () => createReportAction({ projectId: 1, kind: 'report', title: 'Wizard test', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: acmeIds });

test('createReportAction adds a report that persists across a reload', async () => {
  const storage = memoryStorage();
  initStore(seed, storage);
  const r = await newReport();
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.kind, 'report');
  assert.ok(storage.data.has(STORE_KEY), 'written to storage');
  initStore(seed, storage);
  assert.ok(await getDb().report.findUnique({ where: { id: r.id } }), 'the created report survives a reload');
  assert.deepEqual(createdIds('report'), [r.id]);
});

test('saveLayoutAction returns values for a new widget', async () => {
  initStore(seed, memoryStorage());
  const r = await getDb().report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
  const layout = structuredClone((await reportView(r as any)).layout);
  const block = layout.blocks.find((b) => b.slug === 'facebook_ads')!;
  block.widgets.push({ id: 'w-new', slug: 'facebook_ads', key: 'spend_by_country', component: 'chart_v1' as any, integrationId: block.integrationId, x: 0, y: 99, w: 6, h: 3 });
  const out = await saveLayoutAction({ reportId: 1, layout });
  assert.ok(out.ok, JSON.stringify(out).slice(0, 200));
  if (out.ok) assert.ok(Object.keys(out.data.widgets ?? {}).some((k) => k.includes('spend_by_country')));
});

test('block analysis falls back to the rule-based analyst when Claude is unavailable', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  initStore(seed, memoryStorage());
  const r = await getDb().report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
  const blockId = (await reportView(r as any)).data.sections.find((s) => s.blocks.length > 0)!.id;
  const out = await generateBlockAnalysisAction({ reportId: 1, blockId, tone: 'performance' });
  assert.ok(out.ok && out.ai === false, JSON.stringify(out));
  const cards = ((await getDb().report.findUniqueOrThrow({ where: { id: 1 } })).analysis ?? []) as any[];
  const card = cards.find((c) => c.blockId === blockId && c.tone === 'performance');
  assert.ok(card && card.author === 'ai' && card.html.length > 20);
});

test('analyse all replaces earlier general block cards instead of piling them up', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  initStore(seed, memoryStorage());
  const first = await generateAllBlocksAction({ reportId: 1 });
  assert.ok(first.ok && first.blocks > 0);
  await generateAllBlocksAction({ reportId: 1 });
  const cards = ((await getDb().report.findUniqueOrThrow({ where: { id: 1 } })).analysis ?? []) as any[];
  assert.equal(cards.filter((c) => c.blockId && (c.tone ?? 'general') === 'general').length, first.ok ? first.blocks : -1);
});

test('resetDemo restores the seed and clears the browser copy', async () => {
  const storage = memoryStorage();
  initStore(seed, storage);
  const r = await newReport();
  assert.ok(r.ok);
  resetDemo();
  assert.equal(storage.data.has(STORE_KEY), false);
  assert.equal(await getDb().report.findUnique({ where: { id: r.ok ? r.id : -1 } }), null);
  assert.deepEqual(createdIds('report'), []);
});

test('storage that throws: the demo still works for the session', async () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  initStore(seed, broken);
  assert.equal(canPersist(), false);
  assert.ok((await newReport()).ok);
  initStore(seed, null);
  assert.equal(canPersist(), false);
});

test('review I7: a browser copy saved against another seed is ignored after a republish', async () => {
  const storage = memoryStorage();
  initStore(seed, storage);
  const r = await newReport();
  assert.ok(r.ok);
  initStore({ ...seed, exportedAt: '2030-01-01T00:00:00.000Z' }, storage);
  assert.equal(await getDb().report.findUnique({ where: { id: r.ok ? r.id : -1 } }), null, 'the old copy is not loaded');
  assert.equal(storage.data.has(STORE_KEY), false, 'and it is cleared');
});

test('review I2/M15: without Claude the AI cards carry a plain note, never the API error text', async () => {
  const { installAnthropicBridge } = await import('../src/server/anthropic-bridge');
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'demo-bridge';
  try {
    installAnthropicBridge(async () => null);
    initStore(seed, memoryStorage());
    const r = await getDb().report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
    const blockId = (await reportView(r as any)).data.sections.find((s) => s.blocks.length > 0)!.id;
    await generateBlockAnalysisAction({ reportId: 1, blockId, tone: 'general' });
    await generateAllBlocksAction({ reportId: 1 });
    const created = await createReportAction({ projectId: 1, kind: 'report', title: 'AI note', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: acmeIds, withAi: true });
    assert.ok(created.ok);
    const all = [...(((await getDb().report.findUniqueOrThrow({ where: { id: 1 } })).analysis ?? []) as any[]), ...(((await getDb().report.findUniqueOrThrow({ where: { id: created.ok ? created.id : -1 } })).analysis ?? []) as any[])];
    assert.ok(all.length >= 2);
    assert.deepEqual(all.filter((c) => /Anthropic API|\b503\b/.test(c.html)).map((c) => c.title), [], 'no API error text');
    assert.ok(all.some((c) => /Claude was not used/.test(c.html)), 'the plain note');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('the sample dashboards offer client periods in the demo', async () => {
  initStore(seed, memoryStorage());
  for (const id of [2, 4, 10]) {
    const d = await getDb().report.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(d.clientPresets, ['last_7d', 'last_30d', 'this_month', 'previous_month'], `dashboard ${id}`);
  }
});

test('sign-in accepts the shown demo credentials only, and a password gate refuses a wrong password', async () => {
  const seen: string[] = [];
  setBusHandlers({ signIn: () => seen.push('signIn'), navigate: (h) => seen.push(`go ${h}`), refresh: () => seen.push('refresh') });
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  assert.deepEqual(await loginAction(null, fd({ email: 'admin@demo.local', password: 'nope' })), { error: 'Invalid email or password.' });
  assert.deepEqual(seen, []);
  await loginAction(null, fd({ email: ' Admin@Demo.local ', password: 'demo1234' }));
  assert.deepEqual(seen, ['signIn', 'go /overview']);
  const gate = await unlockShareAction(null, fd({ token: 'x', kind: 'report', password: 'x' }));
  assert.ok(gate && typeof gate.error === 'string' && gate.error.length > 0);
  assert.equal(isUnlocked('x'), false);
  seen.length = 0;
  const open = await unlockShareAction(null, fd({ token: 'x', kind: 'report', password: 'demo1234', lang: 'el' }));
  assert.equal(open, undefined, 'no error');
  assert.equal(isUnlocked('x'), true, 'the demo password opens the link for this session');
  assert.deepEqual(seen, ['go /r/x?lang=el', 'refresh'], 'keeps the language, and re-renders when the address is unchanged');
});
