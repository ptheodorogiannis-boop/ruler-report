// Connecting Matomo (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3) against the stand-in Matomo
// in scripts/mock-providers.mjs: address + token, pick sites, one integration per site with its goals; goal renames; every
// health check reads the goals again.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { createMockProviders } from '../scripts/mock-providers.mjs';
import { decryptJson } from '../src/lib/crypto';
import { db } from '../src/lib/db';
import type { Connector } from '../src/lib/engine/types';
import { addIntegration, makeCompany } from './helpers';

const mock = createMockProviders();
let base = '';
before(async () => {
  await new Promise<void>((r) => mock.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}/matomo`;
});
after(() => mock.server.close());

test('the stand-in lists its sites for the right token and refuses any other', async () => {
  const { listMatomoSites } = await import('../src/lib/connectors/matomo');
  const sites = await listMatomoSites({ baseUrl: base, tokenAuth: 'mock-matomo' });
  assert.deepEqual(sites.map((s) => s.id), ['1', '2', '3']);
  assert.equal(sites[0].name, 'Acme Running Co');
  await assert.rejects(listMatomoSites({ baseUrl: base, tokenAuth: 'wrong' }), /invalid_token: Matomo: .*token/);
});

test('connecting two sites creates two integrations, each named from Matomo with its goals in config', async () => {
  const { connectMatomoSites } = await import('../src/lib/services/matomo');
  const { company, project } = await makeCompany();
  const ids = await connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: base, tokenAuth: 'mock-matomo', siteIds: ['1', '2'] });
  assert.equal(ids.length, 2);
  const rows = await db.integration.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
  assert.deepEqual(rows.map((r) => [r.slug, r.sourceId, r.name]), [
    ['matomo', '1', 'Acme Running Co'],
    ['matomo', '2', 'Olive Grove Taverna'],
  ]);
  const cfg = rows[0].config as any;
  assert.deepEqual(cfg.goals, [
    { id: '1', name: 'Lead' },
    { id: '2', name: 'ClickToPhone' },
    { id: '3', name: 'Contact form' },
  ]);
  assert.equal(cfg.currency, 'EUR');
  assert.deepEqual(decryptJson(rows[0].credentials), { baseUrl: base, tokenAuth: 'mock-matomo' });
});

test('a wrong token connects nothing and says what Matomo said', async () => {
  const { connectMatomoSites } = await import('../src/lib/services/matomo');
  const { company, project } = await makeCompany();
  await assert.rejects(connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: base, tokenAuth: 'wrong', siteIds: ['1'] }), /token/);
  await assert.rejects(connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: base, tokenAuth: 'mock-matomo', siteIds: [] }), /Pick at least one site/);
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 0);
});

test('goal names: a rename is kept trimmed, an empty one removed, 61 characters refused, markup stored as text', async () => {
  const { saveGoalNames } = await import('../src/lib/services/matomo');
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'matomo', { config: { goals: [{ id: '1', name: 'Lead' }, { id: '2', name: 'ClickToPhone' }, { id: '3', name: 'Contact form' }], goalNames: { '2': 'Phone calls' } } });
  await saveGoalNames(company.id, row.id, { '1': '  Leads  ', '2': '', '3': '<b>x</b>' });
  const cfg = (await db.integration.findUnique({ where: { id: row.id } }))!.config as any;
  assert.deepEqual(cfg.goalNames, { '1': 'Leads', '3': '<b>x</b>' });
  assert.equal(cfg.goals.length, 3, 'the goals themselves are untouched');
  await assert.rejects(saveGoalNames(company.id, row.id, { '1': 'x'.repeat(61) }), /Goal names are at most 60 characters/);
  await saveGoalNames(company.id, row.id, { '1': 'x'.repeat(60) });
  await assert.rejects(saveGoalNames(company.id + 999, row.id, { '1': 'Leads' }), /Integration not found/);
});

test('a health check reads the goals again: a goal added in Matomo appears, the renames stay', async () => {
  const { connectMatomoSites, saveGoalNames } = await import('../src/lib/services/matomo');
  const { checkAll } = await import('../src/lib/services/health');
  const { company, project } = await makeCompany();
  const [id] = await connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: base, tokenAuth: 'mock-matomo', siteIds: ['3'] });
  await saveGoalNames(company.id, id, { '1': 'Leads' });
  await db.integration.update({ where: { id }, data: { healthCheckedAt: null } });
  mock.state.matomoGoals.push({ idgoal: '4', name: 'Newsletter' });
  try {
    await checkAll({ companyId: company.id });
  } finally {
    mock.state.matomoGoals.pop();
  }
  const row = (await db.integration.findUnique({ where: { id } }))!;
  assert.equal(row.health, 'ok');
  const cfg = row.config as any;
  assert.deepEqual(cfg.goals.map((g: any) => g.id), ['1', '2', '3', '4']);
  assert.deepEqual(cfg.goalNames, { '1': 'Leads' });
});

test('a check refreshes only the goals: other config a validate returns (columns, currency) is left alone', async () => {
  const { checkIntegration } = await import('../src/lib/services/health');
  const { encryptJson } = await import('../src/lib/crypto');
  const row = { id: 1, slug: 'webhook_ingest', name: 'x', sourceId: 's', config: { columns: [{ key: 'leads' }] }, credentials: encryptJson({ accessToken: 't' }) };
  const conn: Connector = { id: 'fake', daily: async () => ({}), breakdown: async () => [], validate: async () => ({ config: { columns: [], currency: 'USD', goals: [{ id: '9', name: 'G' }] } }) };
  assert.deepEqual((await checkIntegration(row, { connector: conn })).config, { goals: [{ id: '9', name: 'G' }] });
  const plain: Connector = { ...conn, validate: async () => ({ config: { columns: [] } }) };
  assert.equal((await checkIntegration(row, { connector: plain })).config, undefined);
});

test('connecting a site already in the project from the same Matomo refreshes its token instead of adding it twice', async () => {
  const { connectMatomoSites, matomoSitesInProject } = await import('../src/lib/services/matomo');
  const { company, project } = await makeCompany();
  const [first] = await connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: base, tokenAuth: 'mock-matomo', siteIds: ['1'] });
  assert.deepEqual([...(await matomoSitesInProject(company.id, project.id, `${base}/`))], [['1', first]], 'a trailing slash is the same Matomo');
  assert.equal((await matomoSitesInProject(company.id, project.id, 'https://other-matomo.example')).size, 0);
  const again = await connectMatomoSites({ companyId: company.id, projectId: project.id, baseUrl: `${base}/index.php`, tokenAuth: 'mock-matomo', siteIds: ['1', '2'] });
  assert.equal(again[0], first);
  assert.equal(await db.integration.count({ where: { projectId: project.id, slug: 'matomo' } }), 2);
});
