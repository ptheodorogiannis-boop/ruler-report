// Plan D: integration health, reconnect, report retry, data notes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { db } from '../src/lib/db';
import { encryptJson } from '../src/lib/crypto';
import type { Connector } from '../src/lib/engine/types';
import { alertFor, checkAll, checkIntegration, reconnectUrl, type Health, type HealthResult, type HealthSnapshot } from '../src/lib/services/health';
import { connectIntegration } from '../src/lib/services/integrations';
import { createReport } from '../src/lib/services/reports';
import { reportView, saveLayout } from '../src/lib/layout/service';
import { storeKey } from '../src/lib/layout/compose';
import type { ReportData } from '../src/lib/engine/types';
import type { ReportLayout } from '../src/lib/layout/types';
import { addIntegration, makeCompany } from './helpers';

const snap = (h: Health, kind: string | null = null, at: Date | null = null, exp: Date | null = null): HealthSnapshot => ({ health: h, healthAlertKind: kind, healthAlertAt: at, tokenExpiresAt: exp });

test('alertFor: transitions and dedupe', () => {
  const now = new Date('2026-10-22T09:00:00Z');
  const ok: HealthResult = { health: 'ok', error: null, tokenExpiresAt: null };
  const failing: HealthResult = { health: 'failing', error: 'Invalid OAuth access token', tokenExpiresAt: null };
  assert.equal(alertFor(snap('ok'), failing, now), 'failing');
  assert.equal(alertFor(snap('failing', 'failing', new Date(now.getTime() - 86400000)), failing, now), null, 'already alerted yesterday');
  assert.equal(alertFor(snap('failing', 'failing', new Date(now.getTime() - 8 * 86400000)), failing, now), 'failing', 're-alert after 7 days');
  const in5: HealthResult = { health: 'expiring', error: null, tokenExpiresAt: new Date(now.getTime() + 5 * 86400000) };
  assert.equal(alertFor(snap('ok'), in5, now), 'expiring7');
  assert.equal(alertFor(snap('expiring', 'expiring7', now), in5, now), null);
  const in12h: HealthResult = { ...in5, tokenExpiresAt: new Date(now.getTime() + 12 * 3600000) };
  assert.equal(alertFor(snap('expiring', 'expiring7', now), in12h, now), 'expiring1');
  assert.equal(alertFor(snap('failing', 'failing', now), ok, now), 'recovered');
  assert.equal(alertFor(snap('ok'), ok, now), null);
  assert.equal(alertFor(snap('unknown'), ok, now), null, 'first ever check that passes is silent');
});

test('checkIntegration: demo rows are ok; a throwing validate is failing with the message; expiresAt within 7 days is expiring; a past expiresAt is failing; a hanging validate times out', async () => {
  const demo = { id: 1, slug: 'facebook_ads', name: 'x', sourceId: 'act_1', config: {}, credentials: encryptJson({ demo: true }) };
  assert.deepEqual(await checkIntegration(demo), { health: 'ok', error: null, tokenExpiresAt: null });
  const bad: Connector = { id: 'fake', daily: async () => ({}), breakdown: async () => [], validate: async () => { throw new Error('Invalid OAuth access token'); } };
  const live = { ...demo, credentials: encryptJson({ accessToken: 't' }) };
  assert.deepEqual(await checkIntegration(live, { connector: bad }), { health: 'failing', error: 'Invalid OAuth access token', tokenExpiresAt: null });
  const good: Connector = { ...bad, validate: async () => undefined };
  const now = new Date('2026-10-22T09:00:00Z');
  const soon = { ...demo, credentials: encryptJson({ accessToken: 't', expiresAt: now.getTime() + 3 * 86400000 }) };
  assert.equal((await checkIntegration(soon, { connector: good, now })).health, 'expiring');
  const past = { ...demo, credentials: encryptJson({ accessToken: 't', expiresAt: now.getTime() - 60000 }) };
  assert.deepEqual(await checkIntegration(past, { connector: good, now }), { health: 'failing', error: 'The access token expired', tokenExpiresAt: new Date(now.getTime() - 60000) });
  const hang: Connector = { ...bad, validate: () => new Promise(() => {}) };
  assert.deepEqual(await checkIntegration(live, { connector: hang, timeoutMs: 50 }), { health: 'failing', error: 'Timed out after 0 s', tokenExpiresAt: null });
});

test('checkAll: writes snapshots, alerts once per transition (bell + e-mail to owners/admins + webhook), skips rows checked within 20 h, and never throws', async () => {
  const { company, project, token } = await makeCompany();
  await db.user.create({ data: { companyId: company.id, email: `owner-${token.slice(3, 11)}@x.test`, name: 'Owner', passwordHash: 'x', role: 'owner' } });
  await db.user.create({ data: { companyId: company.id, email: `editor-${token.slice(3, 11)}@x.test`, name: 'Editor', passwordHash: 'x', role: 'editor' } });
  const row = await addIntegration(company.id, project.id, 'rest', { demo: false, credentials: { accessToken: 't' } });
  const fresh = await addIntegration(company.id, project.id, 'facebook_ads'); // demo → ok
  await db.integration.update({ where: { id: fresh.id }, data: { healthCheckedAt: new Date() } });
  const bad: Connector = { id: 'fake', daily: async () => ({}), breakdown: async () => [], validate: async () => { throw new Error('HTTP 401'); } };
  const out = await checkAll({ now: new Date(), connectorFor: () => bad, companyId: company.id });
  assert.equal(out.checked, 1, 'the fresh row is skipped');
  assert.deepEqual(out.alerts, [{ integrationId: row.id, alert: 'failing' }]);
  const saved = await db.integration.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.health, 'failing');
  assert.equal(saved.healthError, 'HTTP 401');
  assert.equal(saved.healthAlertKind, 'failing');
  assert.ok(saved.healthCheckedAt && saved.healthAlertAt, 'timestamps written');
  const url = reconnectUrl({ id: row.id, projectId: project.id, slug: 'rest' });
  assert.equal(url, `/projects/${project.id}/connect/rest?reconnect=${row.id}`);
  const bell = await db.notification.findMany({ where: { companyId: company.id } });
  assert.equal(bell.length, 1);
  assert.match(bell[0].title, /failing/i);
  assert.equal(bell[0].link, url);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, subject: { contains: row.name } } }), 1, 'one e-mail to the single owner');
  const again = await checkAll({ now: new Date(Date.now() + 21 * 3600000), connectorFor: () => bad, companyId: company.id });
  assert.equal(again.checked, 2, 'both rows are due again after 21 h');
  assert.deepEqual(again.alerts, [], 'no second alert within 7 days, and the demo row stays silent');
});

test('reconnect: the same account replaces credentials in place; a different account is refused and nothing changes', async () => {
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_1' });
  await db.integration.update({ where: { id: row.id }, data: { health: 'failing', healthError: 'x', lastError: 'x', healthAlertKind: 'failing', healthAlertAt: new Date() } });
  await assert.rejects(
    connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook_ads', sourceId: 'act_2', credentials: { demo: true }, replaceId: row.id, skipValidation: true }),
    /Pick the same account \(act_1\)/,
  );
  assert.equal((await db.integration.findUniqueOrThrow({ where: { id: row.id } })).health, 'failing', 'nothing changed');
  const updated = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook_ads', sourceId: 'act_1', credentials: { demo: true, v: 2 }, replaceId: row.id, skipValidation: true });
  assert.equal(updated.id, row.id);
  assert.equal(updated.health, 'ok');
  assert.equal(updated.lastError, null);
  assert.equal(updated.healthError, null);
  assert.equal(updated.healthAlertKind, null);
  assert.equal(updated.name, row.name, 'the name is kept');
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 1, 'no second integration');
  const other = await makeCompany('Other');
  await assert.rejects(connectIntegration({ companyId: other.company.id, projectId: other.project.id, slug: 'facebook_ads', sourceId: 'act_1', credentials: { demo: true }, replaceId: row.id, skipValidation: true }), /not found/i);
});

test('HealthChip: connected, expiring in N days, failing with the error, not checked yet', async () => {
  const { HealthChip } = await import('../src/components/health-chip');
  const now = new Date('2026-10-22T09:00:00Z');
  const html = (props: Parameters<typeof HealthChip>[0]) => renderToStaticMarkup(createElement(HealthChip, props));
  assert.match(html({ health: 'ok', tokenExpiresAt: null, healthCheckedAt: now, error: null, now }), /Connected/);
  assert.match(html({ health: 'expiring', tokenExpiresAt: new Date(now.getTime() + 3 * 86400000), healthCheckedAt: now, error: null, now }), /Expires in 3 days/);
  assert.match(html({ health: 'expiring', tokenExpiresAt: new Date(now.getTime() + 20 * 3600000), healthCheckedAt: now, error: null, now }), /Expires tomorrow/);
  const failing = html({ health: 'failing', tokenExpiresAt: null, healthCheckedAt: now, error: 'HTTP 401 from Meta', now });
  assert.match(failing, /Failing/);
  assert.match(failing, /title="HTTP 401 from Meta"/);
  assert.match(html({ health: 'unknown', tokenExpiresAt: null, healthCheckedAt: null, error: null, now }), /Not checked yet/);
  // review I3: the last sync still speaks when no health check has run yet
  const synced = html({ health: 'unknown', tokenExpiresAt: null, healthCheckedAt: null, error: null, now, lastError: 'HTTP 500 from the provider', lastSyncAt: now });
  assert.match(synced, /Failed on the last sync/);
  assert.match(synced, /title="HTTP 500 from the provider"/);
  assert.match(html({ health: 'ok', tokenExpiresAt: null, healthCheckedAt: null, error: null, now, lastError: null, lastSyncAt: new Date('2026-10-21T10:00:00Z') }), /synced 2026-10-21/);
  assert.match(html({ health: 'unknown', tokenExpiresAt: null, healthCheckedAt: null, error: null, now, lastError: null, lastSyncAt: new Date('2026-10-21T10:00:00Z') }), /synced 2026-10-21/);
});

test('reconnect through the OAuth picker: only the stored account is accepted, several ticked accounts are refused, the row keeps its id (review I4)', async () => {
  const { finalizeSelection } = await import('../src/lib/oauth/flow');
  const { decryptJson } = await import('../src/lib/crypto');
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_1' });
  await db.integration.update({ where: { id: row.id }, data: { health: 'failing', healthError: 'x' } });
  const pending = { provider: 'meta' as const, companyId: company.id, projectId: project.id, slug: 'facebook_ads', userId: null, credentials: { accessToken: 'fresh-token' }, integrationId: row.id, exp: Date.now() + 60000 };
  const options = [
    { key: 'a', sourceId: 'act_1', name: 'Acme ads' },
    { key: 'b', sourceId: 'act_2', name: 'Other ads' },
  ];
  const deps = { listAccounts: async () => options };
  await assert.rejects(finalizeSelection(pending, ['b'], deps), /Pick the same account \(act_1\)/);
  await assert.rejects(finalizeSelection(pending, ['a', 'b'], deps), /only the account being reconnected \(act_1\)/i);
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 1, 'nothing created by the refused attempts');
  assert.deepEqual(await finalizeSelection(pending, ['a'], deps), { created: 0, reconnected: 1 });
  const after = await db.integration.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after.health, 'ok');
  assert.equal(decryptJson<any>(after.credentials)?.accessToken, 'fresh-token');
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 1, 'the row kept its id');
});

test('data notes: a sentence set per platform, the generic one for unknown slugs; the block header control and the print footnotes follow the company switch', async () => {
  const { dataNote, GENERIC_DATA_NOTE } = await import('../src/lib/catalog/data-notes');
  const meta = dataNote('facebook_ads');
  assert.ok(meta.some((s) => /attribution window/i.test(s)), 'Meta: attribution window');
  assert.ok(meta.some((s) => /time zone/i.test(s)), 'Meta: time zone');
  assert.ok(dataNote('google_analytics_4').some((s) => /sampling|threshold/i.test(s)), 'GA4: sampling or thresholding');
  assert.ok(dataNote('search_console').some((s) => /days? (late|behind|delay)/i.test(s)), 'GSC: delay');
  assert.deepEqual(dataNote('unknown_slug'), [GENERIC_DATA_NOTE]);
  assert.ok(meta.every((s) => /[.!]$/.test(s)), 'every note is a sentence');

  const { ReportBody } = await import('../src/components/widgets');
  const { DataFootnotes } = await import('../src/components/data-note');
  const data: ReportData = {
    range: { start: '2026-09-01', end: '2026-09-30' },
    comparison: null,
    generated_at: '2026-10-22T09:14:00.000Z',
    sources: [{ integrationId: 1, source_id: 'act_1', platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme – Meta Ads', currency: 'EUR', data_status: 'ok' }],
    sections: [{ id: 'b1', title: 'Paid media', source: { integrationId: 1, slug: 'facebook_ads', platform: 'Meta Ads', account_name: 'Acme – Meta Ads' }, blocks: [] }],
  } as ReportData;
  const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
  const on = renderToStaticMarkup(createElement(ReportBody, { data, fmt, dataNotes: true }));
  assert.match(on, /<details class="data-note[^"]*"/);
  assert.match(on, /About these numbers/);
  assert.match(on, /attribution window/);
  const off = renderToStaticMarkup(createElement(ReportBody, { data, fmt, dataNotes: false }));
  assert.doesNotMatch(off, /data-note/);
  const foot = renderToStaticMarkup(createElement(DataFootnotes, { sources: data.sources }));
  assert.match(foot, /class="print-only data-footnotes"/);
  assert.match(foot, /\[1\]/);
  assert.match(foot, /Meta Ads/);
});

test('regenerateSource: refreshes only the failed account (its blocks, store keys and source status); the other account stays byte-identical', async () => {
  const { regenerateSource } = await import('../src/lib/engine/report');
  const { company, project } = await makeCompany();
  const a = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_a' });
  const b = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_b' });
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Retry', start: '2026-09-01', end: '2026-09-30', comparisonStart: '2026-08-01', comparisonEnd: '2026-08-31', templateId: tpl.id, integrationIds: [a.id, b.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  // a custom widget referencing B puts a B key into the store
  const layout: ReportLayout = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  layout.blocks.push({ id: 'x', title: 'Extra', integrationId: 0, slug: 'custom', widgets: [{ id: 'st', slug: 'infographic', key: 'tile', component: 'infographic_v1', integrationId: 0, x: 0, y: 0, w: 3, h: 2, custom: { kind: 'stat', ref: { integrationId: b.id, key: 'cpm' } } }] as any });
  await saveLayout(r, layout);
  r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const data = r.data as unknown as ReportData;
  const bKey = storeKey(b.id, 'cpm');
  assert.ok(data.widgets?.[bKey], 'B has a store entry');
  // corrupt everything of B
  const err = { type: 'error', code: 'provider_error', message: 'HTTP 401' } as const;
  for (const s of data.sections) for (const blk of s.blocks) if (blk.integrationId === b.id) blk.widget.value = err;
  data.widgets![bKey].widget.value = err;
  const src = data.sources.find((s) => s.integrationId === b.id)!;
  src.data_status = 'error';
  src.error = 'HTTP 401';
  await db.report.update({ where: { id: r.id }, data: { data: data as any } });
  r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const aBefore = JSON.stringify({ blocks: data.sections.flatMap((s) => s.blocks.filter((x) => x.integrationId === a.id)), src: data.sources.find((s) => s.integrationId === a.id) });

  const out = await regenerateSource(r, b.id);
  const bBlocks = out.sections.flatMap((s) => s.blocks.filter((x) => x.integrationId === b.id));
  assert.ok(bBlocks.length > 0, 'B still has blocks');
  assert.ok(bBlocks.every((x) => x.widget.value.type !== 'error'), 'B blocks are values again');
  assert.notEqual(out.widgets?.[bKey].widget.value.type, 'error', 'the B store entry was refreshed');
  assert.equal(out.sources.find((s) => s.integrationId === b.id)?.data_status, 'ok');
  const aAfter = JSON.stringify({ blocks: out.sections.flatMap((s) => s.blocks.filter((x) => x.integrationId === a.id)), src: out.sources.find((s) => s.integrationId === a.id) });
  assert.equal(aAfter, aBefore, 'A untouched');
  const stored = (await db.report.findUniqueOrThrow({ where: { id: r.id } })).data as unknown as ReportData;
  assert.equal(stored.sources.find((s) => s.integrationId === b.id)?.data_status, 'ok', 'written to the report');
});

test('regenerateSource keeps the other account\'s store keys that a prefix formula needs and recomputes blended metrics (review I1, I2)', async () => {
  const { regenerateSource } = await import('../src/lib/engine/report');
  const { company, project } = await makeCompany();
  const a = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_a' });
  const b = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_b' });
  const cm = await db.customMetric.create({ data: { companyId: company.id, name: 'Blended CPC', formula: '{fb_ads:spend} / {fb_ads:clicks}', format: 'currency', diff: 'positive_bad' } });
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Retry 2', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [a.id, b.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const layout: ReportLayout = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  layout.blocks.push({ id: 'x', title: 'Extra', integrationId: 0, slug: 'custom', widgets: [
    { id: 'calc', slug: 'calculated', key: 'formula', component: 'calculated_v1', integrationId: 0, x: 0, y: 0, w: 3, h: 2, custom: { title: 'Average CPM', formula: '{fb_ads:cpm}' } },
    { id: 'blend', slug: 'custom', key: `cm_${cm.id}`, component: 'number_v1', integrationId: 0, x: 3, y: 0, w: 3, h: 2 },
  ] as any });
  await saveLayout(r, layout);
  r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const data = r.data as unknown as ReportData;
  const aKey = storeKey(a.id, 'cpm');
  const blendKey = storeKey(0, `cm_${cm.id}`);
  assert.ok(data.widgets?.[aKey], 'A key (outside the template) fetched into the store for the prefix formula');
  assert.ok(data.widgets?.[blendKey], 'blended key fetched');
  const err = { type: 'error', code: 'provider_error', message: 'HTTP 401' } as const;
  for (const k of Object.keys(data.widgets!)) if (k.startsWith(`${b.id}:`) || k === blendKey) data.widgets![k].widget.value = err;
  await db.report.update({ where: { id: r.id }, data: { data: data as any } });
  r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const out = await regenerateSource(r, b.id);
  assert.ok(out.widgets?.[aKey], 'the A key the formula needs was not pruned (I1)');
  assert.notEqual(out.widgets?.[aKey].widget.value.type, 'error');
  assert.equal(out.widgets?.[blendKey].widget.value.type, 'number', 'the blended metric was recomputed (I2)');
});
