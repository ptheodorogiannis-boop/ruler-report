import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import { db } from '../src/lib/db';
import { hmac } from '../src/lib/crypto';
import { nextRunAfter, periodForRun, runAutomation, tick, zonedToUtc } from '../src/lib/services/automations';
import { evaluateGoals, goalProgress, loadGoal, periodFor } from '../src/lib/services/goals';
import { createReport } from '../src/lib/services/reports';
import { emitEvent } from '../src/lib/services/webhooks';
import { addIntegration, makeCompany } from './helpers';

const servers: http.Server[] = [];
interface Hit { url: string; headers: http.IncomingHttpHeaders; body: string }
async function receiver(status = 200): Promise<{ base: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  const base = await new Promise<string>((resolve) => {
    const s = http
      .createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          hits.push({ url: req.url!, headers: req.headers, body });
          res.writeHead(status).end('ok');
        });
      })
      .listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
    servers.push(s);
  });
  return { base, hits };
}
after(() => servers.forEach((s) => s.close()));

test('timezone maths: wall-clock hour in Athens maps to the right UTC instant across DST', () => {
  assert.equal(zonedToUtc(2026, 6, 15, 8, 'Europe/Athens').toISOString(), '2026-07-15T05:00:00.000Z'); // UTC+3 in summer
  assert.equal(zonedToUtc(2026, 11, 15, 8, 'Europe/Athens').toISOString(), '2026-12-15T06:00:00.000Z'); // UTC+2 in winter
  assert.equal(zonedToUtc(2026, 0, 10, 9, 'America/New_York').toISOString(), '2026-01-10T14:00:00.000Z');
  assert.equal(zonedToUtc(2026, 0, 10, 9, 'Not/AZone').toISOString(), '2026-01-10T09:00:00.000Z', 'unknown zones fall back to UTC');
});

test('schedule: monthly, weekly and biweekly next-run calculation', () => {
  const monthly = { frequency: 'monthly', dayOfWeek: 1, dayOfMonth: 1, hour: 8 };
  assert.equal(nextRunAfter(monthly, 'Europe/Athens', new Date('2026-10-19T00:00:00Z')).toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(nextRunAfter(monthly, 'Europe/Athens', new Date('2026-07-19T00:00:00Z')).toISOString(), '2026-08-01T05:00:00.000Z');
  assert.equal(nextRunAfter(monthly, 'Europe/Athens', new Date('2026-12-31T23:00:00Z')).toISOString(), '2027-01-01T06:00:00.000Z', 'rolls over the year');
  assert.equal(nextRunAfter({ ...monthly, dayOfMonth: 31 }, 'UTC', new Date('2026-01-01T00:00:00Z')).toISOString(), '2026-01-28T08:00:00.000Z', 'day-of-month is clamped to 28');
  const weekly = { frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, hour: 9 };
  // Monday 19 Oct 2026, already past 09:00 Athens → next Monday (DST ended on 25 Oct, so UTC+2)
  assert.equal(nextRunAfter(weekly, 'Europe/Athens', new Date('2026-10-19T10:00:00Z')).toISOString(), '2026-10-26T07:00:00.000Z');
  assert.equal(nextRunAfter(weekly, 'Europe/Athens', new Date('2026-10-19T01:00:00Z')).toISOString(), '2026-10-19T06:00:00.000Z', 'same day if the hour has not happened yet');
  const bi = { ...weekly, frequency: 'biweekly' };
  assert.equal(nextRunAfter(bi, 'Europe/Athens', new Date('2026-10-19T10:00:00Z'), new Date('2026-10-19T06:00:00Z')).toISOString(), '2026-11-02T07:00:00.000Z');
});

test('periods covered by each frequency', () => {
  assert.deepEqual(periodForRun('monthly', '2026-10-01'), { start: '2026-09-01', end: '2026-09-30', label: 'September 2026' });
  assert.deepEqual(periodForRun('monthly', '2026-01-05'), { start: '2025-12-01', end: '2025-12-31', label: 'December 2025' });
  assert.deepEqual(periodForRun('weekly', '2026-10-19'), { start: '2026-10-12', end: '2026-10-18', label: '2026-10-12 → 2026-10-18' });
  assert.equal(periodForRun('biweekly', '2026-10-19').start, '2026-10-05');
});

test('webhooks: signed JSON, scoped by project, formatted for Slack, failures are logged not thrown', async () => {
  const { company, project } = await makeCompany();
  const other = await db.project.create({ data: { companyId: company.id, name: 'Other' } });
  const r = await receiver();
  const slack = await receiver();
  const dead = await receiver(500);
  const hook = await db.webhook.create({ data: { companyId: company.id, url: `${r.base}/h`, eventType: 'report_created', secret: 'whsec_test' } });
  await db.webhook.create({ data: { companyId: company.id, url: `${slack.base}/s`, eventType: 'report_created', source: 'slack', secret: 's2' } });
  await db.webhook.create({ data: { companyId: company.id, url: `${dead.base}/d`, eventType: 'report_created', secret: 's3' } });
  await db.webhook.create({ data: { companyId: company.id, projectId: other.id, url: `${r.base}/other-only`, eventType: 'report_created', secret: 's4' } });
  await db.webhook.create({ data: { companyId: company.id, url: `${r.base}/paused`, eventType: 'report_created', status: 'inactive', secret: 's5' } });
  await db.webhook.create({ data: { companyId: company.id, url: `${r.base}/other-event`, eventType: 'report_viewed', secret: 's6' } });

  await emitEvent(company.id, project.id, 'report_created', { id: 5, title: 'T', url: 'http://x/r/1' });
  assert.deepEqual(r.hits.map((h) => h.url), ['/h'], 'only the matching, active, in-scope hook fires');
  const hit = r.hits[0];
  assert.equal(hit.headers['x-rulerreports-event'], 'report_created');
  assert.equal(hit.headers['x-rulerreports-signature'], `sha256=${hmac('whsec_test', hit.body)}`);
  const body = JSON.parse(hit.body);
  assert.equal(body.event, 'report_created');
  assert.equal(body.data.id, 5);
  assert.equal(body.data.project_id, project.id);
  assert.match(JSON.parse(slack.hits[0].body).text, /report created.*T/s);
  const deliveries = await db.webhookDelivery.findMany({ where: { webhookId: hook.id } });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].statusCode, 200);
  const failed = await db.webhookDelivery.findMany({ where: { webhook: { url: `${dead.base}/d` } } });
  assert.equal(failed[0].error, 'HTTP 500');
});

test('creating a report fires report_created and increments template usage', async () => {
  const { company, project } = await makeCompany();
  const r = await receiver();
  await db.webhook.create({ data: { companyId: company.id, url: `${r.base}/created`, eventType: 'report_created', secret: 'k' } });
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const base = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  // a private copy: the shared default's counter moves under every other test file that creates a report at the same time
  const tpl = await db.template.create({ data: { companyId: company.id, title: 'Usage', description: '', kind: 'report', isDefault: false, sections: base.sections as any } });
  const before = tpl.usedCount;
  const rep = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'R', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [fb.id] });
  assert.equal((await db.template.findUniqueOrThrow({ where: { id: tpl.id } })).usedCount, before + 1);
  assert.equal(r.hits.length, 1);
  assert.equal(JSON.parse(r.hits[0].body).data.id, rep.id);
  await assert.rejects(createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'R', start: '2026-09-30', end: '2026-09-01', templateId: tpl.id, integrationIds: [fb.id] }), /start must be/);
  await assert.rejects(createReport({ companyId: company.id + 999, projectId: project.id, kind: 'report', title: 'R', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [fb.id] }), /Project not found/);
});

test('automation: generates a report, writes analysis, delivers by email(outbox)/in-app/slack, fires automation_executed, reschedules', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const slack = await receiver();
  const hooks = await receiver();
  await db.webhook.create({ data: { companyId: company.id, url: `${hooks.base}/x`, eventType: 'automation_executed', secret: 'sek' } });
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const a = await db.automation.create({
    data: { projectId: project.id, title: 'Monthly', frequency: 'monthly', dayOfMonth: 1, hour: 8, templateId: tpl.id, integrationIds: [fb.id, ga.id], channels: ['email', 'in-app', 'slack'], emails: ['client@example.com', 'boss@example.com'], slackUrl: `${slack.base}/slack`, attachAnalysis: true },
  });
  const { report, detail } = await runAutomation(a.id);
  assert.equal(report.kind, 'report');
  assert.equal(report.automationId, a.id);
  assert.ok((report.analysis as any[]).length === 1);
  assert.equal((detail.email as any[]).length, 2);
  assert.equal(detail.slack, 'sent');
  const outbox = await db.outbox.findMany({ where: { companyId: company.id } });
  assert.deepEqual(outbox.map((o) => o.toAddr).sort(), ['boss@example.com', 'client@example.com']);
  assert.equal(outbox[0].status, 'queued', 'no SMTP configured → queued in the outbox');
  assert.match(outbox[0].body, /Open full report/);
  assert.match(outbox[0].body, new RegExp(`/r/${report.shareToken}`));
  assert.equal((await db.notification.count({ where: { companyId: company.id, title: { startsWith: 'Report ready' } } })), 1);
  assert.match(JSON.parse(slack.hits[0].body).text, /report is ready/);
  assert.equal(hooks.hits.length, 1);
  const ev = JSON.parse(hooks.hits[0].body);
  assert.equal(ev.event, 'automation_executed');
  assert.equal(ev.data.report_id, report.id);
  const after = await db.automation.findUniqueOrThrow({ where: { id: a.id }, include: { runs: true } });
  assert.equal(after.lastReportId, report.id);
  assert.ok(after.nextRunAt && after.nextRunAt > new Date());
  assert.equal(after.runs[0].status, 'ok');
  // the period is the previous calendar month
  const d = new Date();
  const prevEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
  assert.equal(report.endDate, prevEnd);
});

test('automation failures are recorded and do not stop the scheduler', async () => {
  const { company, project } = await makeCompany();
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const a = await db.automation.create({ data: { projectId: project.id, title: 'Broken', frequency: 'weekly', templateId: tpl.id, integrationIds: [], channels: ['in-app'], nextRunAt: new Date(Date.now() - 1000) } });
  const results = await tick();
  const mine = results.find((r) => r.id === a.id)!;
  assert.equal(mine.ok, false);
  const row = await db.automation.findUniqueOrThrow({ where: { id: a.id }, include: { runs: true } });
  assert.match(row.lastError ?? '', /at least one integration/);
  assert.equal(row.runs[0].status, 'error');
  assert.ok(row.nextRunAt! > new Date(), 'a broken automation is pushed to its next slot instead of retrying every minute');
  void company;
});

test('tick runs only enabled, due automations', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const mk = (extra: object) => db.automation.create({ data: { projectId: project.id, title: 'x', frequency: 'weekly', templateId: tpl.id, integrationIds: [fb.id], channels: ['in-app'], ...extra } });
  const due = await mk({ nextRunAt: new Date(Date.now() - 60_000) });
  const future = await mk({ nextRunAt: new Date(Date.now() + 3_600_000) });
  const off = await mk({ enabled: false, nextRunAt: new Date(Date.now() - 60_000) });
  const ids = (await tick()).filter((r) => r.ok).map((r) => r.id);
  assert.ok(ids.includes(due.id));
  assert.ok(!ids.includes(future.id));
  assert.ok(!ids.includes(off.id));
});

test('goals: period keys, pacing, projection, situation', async () => {
  assert.deepEqual(periodFor('monthly', '2026-09-16'), { key: 'M2026-09', start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(periodFor('weekly', '2026-10-21'), { key: 'W2026-10-19', start: '2026-10-19', end: '2026-10-25' });
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const mk = (target: number, extra: object = {}) => db.goal.create({ data: { projectId: project.id, integrationId: fb.id, referenceKey: 'fb_ads:spend', title: 'Spend', frequency: 'monthly', target, ...extra } });
  const g = await mk(1);
  const full = (await loadGoal(g.id))!;
  const p = await goalProgress(full, '2026-09-16');
  assert.equal(p.period.start, '2026-09-01');
  assert.ok(p.current! > 0);
  assert.equal(p.situation, 'high', 'far above target pace');
  assert.ok(p.additive);
  assert.ok(Math.abs(p.estimatedEnd! - (p.current! / 15) * 30) < 0.02, 'linear projection over 30 days using 15 elapsed days');
  assert.equal(p.daysRemaining, 14);
  assert.ok(p.progressPct! > 100);
  const hopeless = await mk(10_000_000);
  assert.equal((await goalProgress((await loadGoal(hopeless.id))!, '2026-09-16')).situation, 'low');
  const ratio = await db.goal.create({ data: { projectId: project.id, integrationId: fb.id, referenceKey: 'fb_ads:cpc', title: 'CPC', frequency: 'monthly', target: 100, direction: 'lower_better' } });
  const rp = await goalProgress((await loadGoal(ratio.id))!, '2026-09-16');
  assert.equal(rp.additive, false);
  assert.equal(rp.estimatedEnd, rp.current, 'ratios are not extrapolated');
  assert.ok(['high', 'ideal'].includes(rp.situation), 'cost under target is good');
  assert.ok((await db.goalValue.count({ where: { goalId: g.id } })) >= 1, 'history is recorded');
});

test('goal alerts: met fires once per period, drift once, missed once when the period closes', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const r = await receiver();
  for (const e of ['control_goal_met', 'control_goal_not_met']) await db.webhook.create({ data: { companyId: company.id, url: `${r.base}/${e}`, eventType: e, secret: 'k' } });
  const met = await db.goal.create({ data: { projectId: project.id, integrationId: fb.id, referenceKey: 'fb_ads:spend', title: 'Easy', frequency: 'monthly', target: 1, createdAt: new Date('2026-01-01') } });
  const hard = await db.goal.create({ data: { projectId: project.id, integrationId: fb.id, referenceKey: 'fb_ads:spend', title: 'Hard', frequency: 'monthly', target: 50_000_000, createdAt: new Date('2026-01-01') } });
  const now = '2026-09-16';
  const first = await evaluateGoals(company.id, now);
  assert.equal(first.find((x) => x.goalId === met.id)?.event, 'control_goal_met');
  // previous period (August) was closed and missed by the hard goal; the easy goal also passed it
  assert.equal(first.find((x) => x.goalId === hard.id)?.event, 'control_goal_not_met');
  const paths = r.hits.map((h) => h.url).sort();
  assert.deepEqual(paths, ['/control_goal_met', '/control_goal_not_met']);
  const second = await evaluateGoals(company.id, now);
  assert.ok(second.every((x) => !x.event), 'no duplicate alerts in the same period');
  assert.equal(r.hits.length, 2);
  const notes = await db.notification.findMany({ where: { companyId: company.id } });
  assert.ok(notes.some((n) => n.title === 'Goal met: Easy'));
  assert.ok(notes.some((n) => n.title === 'Goal missed: Hard'));
  assert.equal(notes.filter((n) => n.title === 'Off track: Hard').length, 1, 'drift alert once per period');
  // next period → met fires again
  const next = await evaluateGoals(company.id, '2026-10-16');
  assert.equal(next.find((x) => x.goalId === met.id)?.event, 'control_goal_met');
});
