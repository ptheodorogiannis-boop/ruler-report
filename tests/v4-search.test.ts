import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import type { Principal } from '../src/lib/auth';
import { addIntegration, makeCompany } from './helpers';

const owner = (companyId: number): Principal => ({ kind: 'user', companyId, userId: null, name: 'Owner', role: 'owner', projectIds: null }) as Principal;

test('search: clients, reports, dashboards and accounts of the company, any case and accents, plain text only', async () => {
  const { searchAll } = await import('../src/lib/services/search');
  const { createReport } = await import('../src/lib/services/reports');
  const { company, project } = await makeCompany('Search Co');
  await db.project.update({ where: { id: project.id }, data: { name: 'Όμιλος Υγείας' } });
  const other = await db.project.create({ data: { companyId: company.id, name: 'Olive Clinic', timezone: 'Europe/Athens', currency: 'EUR' } });
  const meta = await addIntegration(company.id, other.id, 'facebook_ads');
  await db.integration.update({ where: { id: meta.id }, data: { name: 'Olive Clinic Ads 100%' } });
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  await createReport({ companyId: company.id, projectId: other.id, kind: 'report', title: 'Olive monthly', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id] });
  const p = owner(company.id);

  const kinds = (g: { kind: string }[]) => g.map((x) => x.kind);
  for (const q of ['όμιλος', 'ΟΜΙΛΟΣ', 'ομιλος']) {
    const g = await searchAll(p, q);
    assert.deepEqual(g.find((x) => x.kind === 'clients')?.items.map((i) => i.label), ['Όμιλος Υγείας'], q);
  }
  const olive = await searchAll(p, 'olive');
  assert.deepEqual(kinds(olive), ['clients', 'reports', 'accounts'], 'empty groups are left out; no connect group without a project');
  assert.equal(olive.find((x) => x.kind === 'accounts')!.items[0].href, `/projects/${other.id}?tab=integrations`);
  assert.equal(olive.find((x) => x.kind === 'clients')!.items[0].href, `/projects/${other.id}`);
  assert.match(olive.find((x) => x.kind === 'reports')!.items[0].href, /^\/reports\/\d+$/);
  assert.deepEqual(await searchAll(p, 'o'), [], 'one character finds nothing');
  assert.deepEqual(kinds(await searchAll(p, '100%')), ['accounts'], '% is plain text');
  assert.deepEqual(await searchAll(p, '_'), [], '_ is plain text');
  const meta2 = await searchAll(p, 'meta ads', other.id);
  assert.ok(meta2.find((x) => x.kind === 'accounts'), 'the platform name finds its accounts');
  const connect = meta2.find((x) => x.kind === 'connect')!;
  assert.equal(connect.items[0].href, `/projects/${other.id}/connect/facebook_ads`);
  assert.ok(connect.items.length <= 8);
});

test('search: at most eight per group; a client user finds only reports and dashboards of their projects', async () => {
  const { searchAll } = await import('../src/lib/services/search');
  const { company, project } = await makeCompany('Many Co');
  for (let i = 0; i < 12; i++) await db.project.create({ data: { companyId: company.id, name: `Shop ${i}`, timezone: 'Europe/Athens', currency: 'EUR' } });
  const all = await searchAll(owner(company.id), 'shop');
  assert.equal(all.find((x) => x.kind === 'clients')!.items.length, 8);
  const { createReport } = await import('../src/lib/services/reports');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const a1 = await addIntegration(company.id, project.id, 'facebook_ads');
  const mine = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Shop report mine', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [a1.id] });
  const other = await db.project.findFirstOrThrow({ where: { companyId: company.id, name: 'Shop 1' } });
  const a2 = await addIntegration(company.id, other.id, 'facebook_ads');
  await createReport({ companyId: company.id, projectId: other.id, kind: 'report', title: 'Shop report theirs', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [a2.id] });
  const client: Principal = { ...owner(company.id), role: 'client', projectIds: [project.id] } as Principal;
  const seen = await searchAll(client, 'shop');
  assert.deepEqual(seen.map((g) => g.kind), ['reports']);
  assert.deepEqual(seen[0].items.map((i) => i.href), [`/reports/${mine.id}`]);
  // another company's data never shows
  const { company: c2 } = await makeCompany('Elsewhere');
  assert.deepEqual(await searchAll(owner(c2.id), 'shop'), []);
});
