// Plan F review fix pass (.superpowers/sdd/2026-10-22-v3-f-delivery/review.md): I1–I5.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { encryptJson } from '../src/lib/crypto';
import { addIntegration, api, makeCompany } from './helpers';

/** A held run: one fine demo Meta account and one live Meta row without a token (fails before any network call). */
async function heldRun(title: string) {
  const { runAutomation } = await import('../src/lib/services/automations');
  const { company, project, token } = await makeCompany();
  const owner = `owner-${token.slice(3, 11)}@x.test`;
  await db.user.create({ data: { companyId: company.id, email: owner, name: 'Owner', passwordHash: 'x', role: 'owner' } });
  const fine = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_ok' });
  const broken = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_broken', demo: false, credentials: { oauth: 'meta' } });
  const a = await db.automation.create({ data: { projectId: project.id, title, frequency: 'monthly', channels: ['email'], emails: ['client@x.test'], integrationIds: [fine.id, broken.id], holdOnFailure: true, dayOfMonth: 1, hour: 8, enabled: true, nextRunAt: new Date() } });
  const r = await runAutomation(a.id);
  assert.equal(r.status, 'held');
  const run = await db.automationRun.findFirstOrThrow({ where: { automationId: a.id } });
  return { company, project, token, owner, fine, broken, automation: a, run, report: r.report };
}

test('F-I1: "Send now" refreshes the sources that failed before delivering, and the held e-mail says so', async () => {
  const { deliverRun, failedSources } = await import('../src/lib/services/automations');
  const { company, owner, broken, run } = await heldRun('Refresh on send');
  const mail = await db.outbox.findFirstOrThrow({ where: { companyId: company.id, toAddr: owner } });
  assert.match(mail.body, /Send now/);
  assert.match(mail.body, /refresh/i, 'the e-mail says the failed sources are refreshed on send');
  // the agency reconnects the account (here: the row becomes a working demo account)
  await db.integration.update({ where: { id: broken.id }, data: { credentials: encryptJson({ demo: true }) } });
  const { detail } = await deliverRun(run.id);
  const delivered = await db.report.findUniqueOrThrow({ where: { id: run.reportId! } });
  assert.equal(failedSources(delivered.data as any).length, 0, 'the failed source was refreshed before sending');
  assert.deepEqual(detail.refreshed, [`Meta Ads · ${broken.name}`], JSON.stringify(detail));
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 1);
});

test('F-I1b: a source that still fails on "Send now" is delivered as is, and the run detail says which', async () => {
  const { deliverRun, failedSources } = await import('../src/lib/services/automations');
  const { company, broken, run } = await heldRun('Still broken');
  const { detail } = await deliverRun(run.id);
  const delivered = await db.report.findUniqueOrThrow({ where: { id: run.reportId! } });
  assert.equal(failedSources(delivered.data as any).length, 1, 'still failing');
  assert.deepEqual(detail.still_failing, [`Meta Ads · ${broken.name}`], JSON.stringify(detail));
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 1, 'delivered anyway: the agency chose Send now');
});

test('F-I2: two concurrent "Send now" calls deliver once', async () => {
  const { deliverRun } = await import('../src/lib/services/automations');
  const { company, run } = await heldRun('Double click');
  const results = await Promise.allSettled([deliverRun(run.id), deliverRun(run.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.match(String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason?.message), /not held/i);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 1, 'one e-mail to the client');
  assert.equal((await db.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'ok');
});

test('F-I3: PUT /goals/:id updates alert_emails ([] clears them) and validates them', async () => {
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const created = await api(token, 'POST', '/goals', { project_id: project.id, integration_id: meta.id, reference_key: 'fb_ads:spend', title: 'Spend', target: 10, alert_emails: ['a@x.test'] });
  assert.equal(created.status, 201);
  const id = created.json.data.id;
  const upd = await api(token, 'PUT', `/goals/${id}`, { alert_emails: ['b@x.test', 'c@x.test'] });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.json.data.alert_emails, ['b@x.test', 'c@x.test']);
  assert.deepEqual((await db.goal.findUniqueOrThrow({ where: { id } })).alertEmails, ['b@x.test', 'c@x.test']);
  assert.deepEqual((await api(token, 'PUT', `/goals/${id}`, { alert_emails: [] })).json.data.alert_emails, []);
  assert.equal((await api(token, 'PUT', `/goals/${id}`, { alert_emails: ['nope'] })).status, 422);
  assert.deepEqual((await api(token, 'PUT', `/goals/${id}`, { title: 'Renamed' })).json.data.alert_emails, [], 'untouched when absent');
});

test('F-I4: a project-restricted session user cannot send, read, run, toggle, edit or delete automations of another project', async () => {
  const { match } = await import('../src/lib/api/routes');
  const { principalFor } = await import('./principal');
  const { company, project, automation, run } = await heldRun('Tenancy');
  const other = await db.project.create({ data: { companyId: company.id, name: 'Other client' } });
  const restricted = await principalFor(company.id, 'editor', [other.id]);
  const call = async (method: string, path: string, body?: unknown) => {
    const m = match(method, path)!;
    try {
      await m.route.fn({ p: restricted, query: new URLSearchParams(), params: m.params, body });
      return 200;
    } catch (e: any) {
      return e.status as number;
    }
  };
  assert.equal(await call('POST', `/automations/${automation.id}/runs/${run.id}/send`), 404);
  assert.equal(await call('GET', `/automations/${automation.id}`), 404);
  assert.equal(await call('POST', `/automations/${automation.id}/run`), 404);
  assert.equal(await call('POST', `/automations/${automation.id}/toggle`), 404);
  assert.equal(await call('PUT', `/automations/${automation.id}`, { title: 'x' }), 404);
  assert.equal(await call('DELETE', `/automations/${automation.id}`), 404);
  assert.equal((await db.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'held', 'nothing was sent');
  const allowed = await principalFor(company.id, 'editor', [project.id]);
  const m = match('GET', `/automations/${automation.id}`)!;
  await m.route.fn({ p: allowed, query: new URLSearchParams(), params: m.params, body: undefined });
});

test('F-I5: the public goals page is served from a short cache, writes no history per view, and a password change or stop applies at once', async () => {
  const { createGoalsShare, goalsPageData, setGoalsPassword, stopGoalsShare } = await import('../src/lib/services/goals-share');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const goal = await db.goal.create({ data: { projectId: project.id, integrationId: meta.id, referenceKey: 'fb_ads:spend', title: 'Spend', frequency: 'monthly', target: 1, direction: 'higher_better' } });
  const token = await createGoalsShare(project.id);
  const orig = demoConnector.daily;
  let calls = 0;
  (demoConnector as any).daily = (...a: unknown[]) => {
    calls++;
    return (orig as any).apply(demoConnector, a);
  };
  try {
    const first = await goalsPageData(token);
    assert.ok(first && first.goals.length === 1);
    assert.ok(calls > 0, 'the first view reads the provider');
    calls = 0;
    const second = await goalsPageData(token);
    assert.equal(calls, 0, 'the second view within the TTL is served from the cache');
    assert.equal(second!.goals[0].progress.current, first!.goals[0].progress.current);
    assert.equal(await db.goalValue.count({ where: { goalId: goal.id } }), 0, 'anonymous views write no history');
    await setGoalsPassword(project.id, 'pw');
    assert.ok((await goalsPageData(token))!.project.goalsPassword, 'a password change applies at once');
    await stopGoalsShare(project.id);
    assert.equal(await goalsPageData(token), null, 'stopping applies at once');
  } finally {
    (demoConnector as any).daily = orig;
  }
});
