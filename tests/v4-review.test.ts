// Approval before send (competitor research, AgencyAnalytics / NinjaCat): an automation can hold every report it
// generates until someone presses "Approve and send", even when every source loaded.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { addIntegration, api, makeCompany } from './helpers';

test('approve before sending: every report waits, the agency is asked to check it, the client gets it on approval only', async () => {
  const { runAutomation, deliverRun, failedSources } = await import('../src/lib/services/automations');
  const { company, project, token } = await makeCompany();
  const owner = `owner-${token.slice(3, 11)}@x.test`;
  await db.user.create({ data: { companyId: company.id, email: owner, name: 'Owner', passwordHash: 'x', role: 'owner' } });
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const a = await db.automation.create({ data: { projectId: project.id, title: 'Monthly review', frequency: 'monthly', channels: ['email'], emails: ['client@x.test'], integrationIds: [meta.id], reviewBeforeSend: true, attachAnalysis: false } });
  const r = await runAutomation(a.id);
  assert.equal(failedSources(r.report.data as any).length, 0, 'every source loaded');
  assert.equal(r.status, 'held', 'still held: it waits for approval');
  const run = await db.automationRun.findFirstOrThrow({ where: { automationId: a.id } });
  assert.deepEqual(run.detail, { review: true });
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 0, 'the client got nothing yet');
  const asked = await db.outbox.findMany({ where: { companyId: company.id, toAddr: owner } });
  assert.equal(asked.length, 1);
  assert.match(asked[0].subject, /approval/i);
  assert.equal(await db.notification.count({ where: { companyId: company.id, link: '/automations' } }), 1, 'a notification points at the waiting list');
  await deliverRun(run.id);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 1, 'approved and sent once');
  assert.equal((await db.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'ok');
  // the API carries the flag both ways
  const body = { project_id: project.id, title: 'Via API', frequency: 'monthly', channels: ['in-app'], integration_ids: [meta.id] };
  const created = await api(token, 'POST', '/automations', { ...body, review_before_send: true });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.data.review_before_send, true);
  assert.equal((await api(token, 'POST', '/automations', body)).json.data.review_before_send, false, 'off by default');
});
