// Task 2: the app's real services run on the in-memory database loaded from the seed.
// Run through demo-host/tests/run-bundled.mjs so `@/lib/db` resolves to the demo shim.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { Seed } from '../src/seed/types';
import { createMemDb } from '../src/server/memdb';
import { setDb } from '../src/shims/db';
import { createReport } from '@/lib/services/reports';
import { reportView, saveLayout } from '@/lib/layout/service';
import { liveDashboardData } from '@/lib/engine/report';
import { rangeLength } from '@/lib/util/dates';

const seed = JSON.parse(readFileSync('demo-host/capture-out/seed.json', 'utf8')) as Seed;
const fresh = () => {
  const db = createMemDb(seed);
  setDb(db);
  return db;
};

test('createReport generates a report from sample data', async () => {
  const db = fresh();
  const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
  const ids = seed.integrations.filter((i) => i.projectId === 1).slice(0, 2).map((i) => i.id as number);
  const r = await createReport({ companyId: 1, projectId: 1, kind: 'report', title: 'Demo test', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: ids } as any);
  assert.equal(r.shareToken.length, 32);
  const stored = await db.report.findUniqueOrThrow({ where: { id: r.id } });
  assert.ok((stored.data as any)?.sections?.length > 0, 'the snapshot has sections');
  assert.equal((await db.template.findUniqueOrThrow({ where: { id: tpl.id } })).usedCount, (tpl.usedCount as number) + 1, 'increment works');
});

test('review C1: create applies the schema defaults the app relies on (a wizard report is shared, with 0 views)', async () => {
  const db = fresh();
  const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
  const ids = seed.integrations.filter((i) => i.projectId === 1).slice(0, 1).map((i) => i.id as number);
  const r = await createReport({ companyId: 1, projectId: 1, kind: 'report', title: 'Defaults', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: ids } as any);
  const stored = await db.report.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(stored.shareEnabled, true);
  assert.equal(stored.views, 0);
  const t = await db.template.create({ data: { companyId: 1, title: 'T', kind: 'report', sections: [] } });
  assert.equal(t.isDefault, false);
  assert.equal(t.usedCount, 0);
});

test('review M8: ids are never reused after a delete', async () => {
  const db = fresh();
  const max = Math.max(...seed.reports.map((r) => r.id as number));
  await db.report.delete({ where: { id: max } });
  const tpl = seed.templates.find((t) => t.kind === 'report' && t.isDefault && t.companyId == null)!;
  const r = await createReport({ companyId: 1, projectId: 1, kind: 'report', title: 'After delete', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [seed.integrations.find((i) => i.projectId === 1)!.id] } as any);
  assert.ok(r.id > max, `new id ${r.id} > ${max}`);
});

test('reportView composes the seeded Acme report', async () => {
  const db = fresh();
  const r = await db.report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
  const view = await reportView(r as any);
  assert.ok(view.data.sections.length > 0);
  assert.ok(view.layout.blocks.length > 0);
});

test('saveLayout resolves values for a newly added widget', async () => {
  const db = fresh();
  const r = await db.report.findUniqueOrThrow({ where: { id: 1 }, include: { project: true } });
  const view = await reportView(r as any);
  const block = view.layout.blocks.find((b) => b.slug === 'facebook_ads')!;
  assert.ok(block, 'the Acme report has a Meta Ads block');
  const layout = structuredClone(view.layout);
  const target = layout.blocks.find((b) => b.id === block.id)!;
  target.widgets.push({ id: 'w-test', slug: 'facebook_ads', key: 'spend_by_country', component: 'chart_v1' as any, integrationId: block.integrationId, x: 0, y: 99, w: 6, h: 3 });
  const out = await saveLayout(r as any, layout);
  assert.ok(Object.keys(out.data.widgets ?? {}).some((k) => k.includes('spend_by_country')), 'the new widget has values');
});

test('liveDashboardData follows a preset the dashboard allows, and ignores one it does not', async () => {
  const db = fresh();
  const before = await db.report.findUniqueOrThrow({ where: { id: 2 }, include: { project: true } });
  assert.equal(before.kind, 'dashboard');
  const ignored = await liveDashboardData(before as any, { preset: 'last_7d', force: true });
  assert.notEqual(rangeLength(ignored.range), 7, 'a preset the agency did not offer is ignored');
  await db.report.update({ where: { id: 2 }, data: { clientPresets: ['last_7d', 'last_30d'] } });
  const d = await db.report.findUniqueOrThrow({ where: { id: 2 }, include: { project: true } });
  const live = await liveDashboardData(d as any, { preset: 'last_7d', force: true });
  assert.equal(rangeLength(live.range), 7);
});

test('where and include basics', async () => {
  const db = fresh();
  const rows = await db.project.findMany({ where: { companyId: 1 }, include: { _count: { select: { reports: true } } }, orderBy: { id: 'asc' } });
  assert.equal(rows.length, 6);
  assert.equal(typeof (rows[0] as any)._count.reports, 'number');
  assert.ok(((rows[0] as any)._count.reports as number) >= 1, 'Acme has reports');
  const some = await db.integration.findMany({ where: { id: { in: [1, 2, 999] }, projectId: 1 } });
  assert.ok(some.length >= 1 && some.every((i) => i.projectId === 1));
  const tpls = await db.template.findMany({ where: { OR: [{ companyId: null }, { companyId: 1 }], kind: 'report' } });
  assert.ok(tpls.length >= 1 && tpls.every((t) => t.kind === 'report'));
  await assert.rejects(() => db.report.findMany({ where: { title: { search: 'x' } } as any }), /MemDbUnsupported/);
});
