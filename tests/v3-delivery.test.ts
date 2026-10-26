// Plan F: schedules, hold on failure, goal e-mails, public goals page, client period picker, duplicate/convert.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FREQUENCIES, nextRunAfter, nthWeekday, parseMonthlyRule, periodForRun } from '../src/lib/services/automations';
import { db } from '../src/lib/db';
import { addIntegration, api, makeCompany } from './helpers';

const base = { dayOfWeek: 1, dayOfMonth: 1, hour: 8 };

test('scheduler: daily runs keep 08:00 local across the Europe/Athens DST change; weekdaysOnly skips the weekend', () => {
  assert.ok((FREQUENCIES as readonly string[]).includes('daily'));
  const tz = 'Europe/Athens';
  // Sat 24 Oct 2026 08:00 EEST = 05:00Z; DST ends Sun 25 Oct, so Sunday's 08:00 is EET = 06:00Z
  const sat = new Date('2026-10-24T05:00:00Z');
  const sun = nextRunAfter({ ...base, frequency: 'daily' }, tz, sat);
  assert.equal(sun.toISOString(), '2026-10-25T06:00:00.000Z');
  assert.equal(nextRunAfter({ ...base, frequency: 'daily' }, tz, sun).toISOString(), '2026-10-26T06:00:00.000Z');
  // Fri 23 Oct 09:00 EEST (after the 08:00 run) with weekdays only → Mon 26 Oct 08:00 EET
  assert.equal(nextRunAfter({ ...base, frequency: 'daily', weekdaysOnly: true }, tz, new Date('2026-10-23T06:00:00Z')).toISOString(), '2026-10-26T06:00:00.000Z');
  assert.deepEqual(periodForRun('daily', '2026-10-22'), { start: '2026-10-21', end: '2026-10-21', label: '2026-10-21' });
});

test('scheduler: monthly by weekday position (first Monday, last Friday)', () => {
  const tz = 'Europe/Athens';
  assert.deepEqual(parseMonthlyRule('day'), { kind: 'day' });
  assert.deepEqual(parseMonthlyRule('first:1'), { kind: 'first', dow: 1 });
  assert.deepEqual(parseMonthlyRule('last:5'), { kind: 'last', dow: 5 });
  assert.deepEqual(parseMonthlyRule('first:9'), { kind: 'day' }, 'an invalid rule falls back to the day of month');
  assert.equal(nthWeekday(2026, 5, 1, 'first'), 1, 'June 1 2026 is a Monday');
  assert.equal(nthWeekday(2026, 9, 5, 'last'), 30, 'Oct 30 2026 is the last Friday');
  assert.equal(nextRunAfter({ ...base, frequency: 'monthly', monthlyRule: 'first:1' }, tz, new Date('2026-05-20T00:00:00Z')).toISOString(), '2026-06-01T05:00:00.000Z', '08:00 EEST');
  assert.equal(nextRunAfter({ ...base, frequency: 'monthly', monthlyRule: 'last:5' }, tz, new Date('2026-10-01T00:00:00Z')).toISOString(), '2026-10-30T06:00:00.000Z', '08:00 EET after the DST change');
  assert.equal(nextRunAfter({ ...base, frequency: 'monthly', dayOfMonth: 15, monthlyRule: 'day' }, tz, new Date('2026-10-01T00:00:00Z')).toISOString(), '2026-10-15T05:00:00.000Z', 'the plain day rule is unchanged');
});

test('automations API: daily with weekdays only, a weekday-position rule, hold-on-failure and attach-pdf flags round-trip; bad values are refused', async () => {
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const body = { project_id: project.id, title: 'Daily digest', integration_ids: [meta.id], channels: ['in-app'] };
  const c = await api(token, 'POST', '/automations', { ...body, frequency: 'daily', weekdays_only: true, hold_on_failure: false, attach_pdf: true });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.deepEqual([c.json.data.frequency, c.json.data.weekdays_only, c.json.data.monthly_rule, c.json.data.hold_on_failure, c.json.data.attach_pdf], ['daily', true, 'day', false, true]);
  assert.ok(c.json.data.next_run_at, 'scheduled');
  const d = await api(token, 'POST', '/automations', body);
  assert.deepEqual([d.json.data.frequency, d.json.data.weekdays_only, d.json.data.monthly_rule, d.json.data.hold_on_failure, d.json.data.attach_pdf], ['monthly', false, 'day', true, false], 'defaults');
  const u = await api(token, 'PUT', `/automations/${c.json.data.id}`, { ...body, frequency: 'monthly', monthly_rule: 'last:5' });
  assert.equal(u.status, 200, JSON.stringify(u.json));
  assert.equal(u.json.data.monthly_rule, 'last:5');
  assert.equal((await api(token, 'POST', '/automations', { ...body, monthly_rule: 'first:9' })).status, 422);
  assert.equal((await api(token, 'POST', '/automations', { ...body, frequency: 'hourly' })).status, 422);
});

test('hold on failure: a report with a failed source is held (the agency is told, the client is not) and "Send now" delivers it; without the hold the client still gets it and the agency a failure note', async () => {
  const { runAutomation, deliverRun, failedSources } = await import('../src/lib/services/automations');
  const { company, project, token } = await makeCompany();
  const owner = `owner-${token.slice(3, 11)}@x.test`;
  await db.user.create({ data: { companyId: company.id, email: owner, name: 'Owner', passwordHash: 'x', role: 'owner' } });
  const fine = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_ok' });
  // a live Meta row without an access token: the connector throws before any network call → the source fails
  const broken = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_broken', demo: false, credentials: { oauth: 'meta' } });
  const mk = (hold: boolean) => db.automation.create({ data: { projectId: project.id, title: hold ? 'Held digest' : 'Loose digest', frequency: 'monthly', channels: ['email', 'in-app'], emails: ['client@x.test'], integrationIds: [fine.id, broken.id], holdOnFailure: hold, attachAnalysis: false } });
  const held = await mk(true);
  const r1 = await runAutomation(held.id);
  assert.equal(r1.status, 'held');
  assert.equal(failedSources(r1.report.data as any).map((s) => s.integrationId).join(','), String(broken.id));
  const run1 = await db.automationRun.findFirstOrThrow({ where: { automationId: held.id } });
  assert.equal(run1.status, 'held');
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 0, 'the client got nothing');
  const agency = await db.outbox.findMany({ where: { companyId: company.id, toAddr: owner } });
  assert.equal(agency.length, 1, 'one e-mail to the owner');
  assert.match(agency[0].subject, /held/i);
  assert.equal(await db.notification.count({ where: { companyId: company.id, title: { contains: 'held' } } }), 1);
  assert.ok((await db.automation.findUniqueOrThrow({ where: { id: held.id } })).nextRunAt, 'the schedule still advanced');
  await deliverRun(run1.id);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 1, 'Send now delivered the stored report');
  assert.equal((await db.automationRun.findUniqueOrThrow({ where: { id: run1.id } })).status, 'ok');
  await assert.rejects(deliverRun(run1.id), /not held/i);
  const loose = await mk(false);
  const r2 = await runAutomation(loose.id);
  assert.equal(r2.status, 'ok');
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'client@x.test' } }), 2, 'sent despite the failure');
  const agency2 = await db.outbox.findMany({ where: { companyId: company.id, toAddr: owner } });
  assert.equal(agency2.length, 2, 'the agency still hears about the failure');
  assert.match(agency2[1].subject, /missing data|failed/i);
});

test('goal alerts by e-mail: a met goal e-mails its alert addresses once; the API accepts and validates them', async () => {
  const { evaluateGoals } = await import('../src/lib/services/goals');
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const goal = await db.goal.create({ data: { projectId: project.id, integrationId: meta.id, referenceKey: 'fb_ads:spend', title: 'Spend at least 1', frequency: 'monthly', target: 1, direction: 'higher_better', alert: true, alertEmails: ['pm@x.test', 'lead@x.test'] } });
  const first = await evaluateGoals(company.id);
  assert.equal(first.find((g) => g.goalId === goal.id)?.event, 'control_goal_met');
  const mails = await db.outbox.findMany({ where: { companyId: company.id, toAddr: { in: ['pm@x.test', 'lead@x.test'] } } });
  assert.equal(mails.length, 2, 'one e-mail per address');
  assert.match(mails[0].subject, /^\[Ruler Reports\] Goal met: Spend at least 1/);
  assert.match(mails[0].body, /Spend at least 1/);
  await evaluateGoals(company.id);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, toAddr: 'pm@x.test' } }), 1, 'not sent twice for the same period');
  const viaApi = await api(token, 'POST', '/goals', { project_id: project.id, integration_id: meta.id, reference_key: 'fb_ads:clicks', title: 'Clicks', frequency: 'monthly', target: 10, direction: 'higher_better', alert_emails: ['x@y.test'] });
  assert.equal(viaApi.status, 201, JSON.stringify(viaApi.json));
  assert.deepEqual(viaApi.json.data.alert_emails, ['x@y.test']);
  assert.equal((await api(token, 'POST', '/goals', { project_id: project.id, integration_id: meta.id, reference_key: 'fb_ads:clicks', title: 'Bad', target: 10, alert_emails: ['not-an-email'] })).status, 422);
});

test('public goals page: sharing mints a token, the page data lists the goals with progress, the body renders rings, a password is stored hashed, stopping removes the page', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createGoalsShare, goalsPageData, setGoalsPassword, stopGoalsShare } = await import('../src/lib/services/goals-share');
  const { goalsUnlockCookie } = await import('../src/lib/share');
  const { PublicGoalsBody } = await import('../src/components/public-goals');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  await db.goal.create({ data: { projectId: project.id, integrationId: meta.id, referenceKey: 'fb_ads:spend', title: 'Spend target', frequency: 'monthly', target: 1, direction: 'higher_better' } });
  const token = await createGoalsShare(project.id);
  assert.match(token, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal(await createGoalsShare(project.id), token, 'sharing again keeps the token');
  const data = await goalsPageData(token);
  assert.ok(data, 'the page resolves');
  assert.equal(data!.project.id, project.id);
  assert.equal(data!.goals.length, 1);
  assert.equal(data!.goals[0].title, 'Spend target');
  assert.ok(['high', 'ideal', 'average', 'low', 'no_data'].includes(data!.goals[0].progress.situation));
  const html = renderToStaticMarkup(createElement(PublicGoalsBody, { data: data!, embed: false }));
  assert.match(html, /Spend target/);
  assert.match(html, /class="ring"/);
  assert.match(html, /Powered by Ruler Reports/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(PublicGoalsBody, { data: data!, embed: true })), /Powered by/);
  await setGoalsPassword(project.id, 'secret');
  const p = await db.project.findUniqueOrThrow({ where: { id: project.id } });
  assert.ok(p.goalsPassword && p.goalsPassword !== 'secret', 'stored hashed');
  assert.equal(goalsUnlockCookie(project.id, p.goalsPassword!), goalsUnlockCookie(project.id, p.goalsPassword!), 'deterministic cookie value');
  assert.notEqual(goalsUnlockCookie(project.id, p.goalsPassword!), goalsUnlockCookie(project.id + 1, p.goalsPassword!));
  await setGoalsPassword(project.id, null);
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: project.id } })).goalsPassword, null);
  await stopGoalsShare(project.id);
  assert.equal(await goalsPageData(token), null, 'gone after stopping');
  assert.equal(await goalsPageData('nope'), null);
});

test('client period picker: only allowed presets are honoured, live data follows the requested preset and comparison, the head offers the picker only with presets and auto-refresh only on rolling presets', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { clientPreset, allowedPresets } = await import('../src/lib/services/dashboards');
  const { liveDashboardData } = await import('../src/lib/engine/report');
  const { createReport } = await import('../src/lib/services/reports');
  const { DashboardControls } = await import('../src/components/dashboard-controls');
  assert.equal(clientPreset({ preset: 'last_30d', clientPresets: null }, 'last_7d'), 'last_30d', 'locked → the saved preset');
  assert.equal(clientPreset({ preset: 'last_30d', clientPresets: ['last_7d', 'last_30d'] }, 'last_7d'), 'last_7d');
  assert.equal(clientPreset({ preset: 'last_30d', clientPresets: ['last_7d'] }, 'last_90d'), 'last_30d', 'not allowed → the saved preset');
  assert.equal(clientPreset({ preset: 'last_30d', clientPresets: ['last_7d'] }, 'nonsense'), 'last_30d');
  assert.deepEqual(allowedPresets({ preset: 'last_30d', clientPresets: ['last_7d', 'bogus'] }), ['last_30d', 'last_7d'], 'the saved preset always leads; unknown names dropped');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'dashboard', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'dashboard', title: 'Live', preset: 'last_30d', templateId: tpl.id, integrationIds: [meta.id] });
  await db.report.update({ where: { id: created.id }, data: { clientPresets: ['last_7d'] } });
  const r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const week = await liveDashboardData(r, { preset: 'last_7d' });
  const days = (new Date(week.range.end).getTime() - new Date(week.range.start).getTime()) / 86400000 + 1;
  assert.equal(days, 7, `a 7-day range: ${week.range.start}..${week.range.end}`);
  assert.ok(week.comparison, 'comparison on by default');
  const noCmp = await liveDashboardData(r, { preset: 'last_7d', compare: false });
  assert.equal(noCmp.comparison, null, 'comparison off on request');
  assert.equal(noCmp.data.comparison ?? null, null);
  const month = await liveDashboardData(r, { preset: 'last_90d' });
  assert.ok(((new Date(month.range.end).getTime() - new Date(month.range.start).getTime()) / 86400000 + 1) === 30, 'a preset outside the allow-list falls back to the saved one');
  const head = renderToStaticMarkup(createElement(DashboardControls, { report: { preset: 'last_30d', clientPresets: ['last_7d'] }, preset: 'last_7d', compare: true, dateFormat: 'DD/MM/YYYY', updatedAt: '2026-10-22T12:04:00Z', timezone: 'Europe/Athens' }));
  assert.match(head, /<select name="preset"/);
  assert.match(head, /value="last_7d"[^>]*selected/);
  assert.match(head, /name="compare"/);
  assert.match(head, /Live/);
  const locked = renderToStaticMarkup(createElement(DashboardControls, { report: { preset: 'last_30d', clientPresets: null }, preset: 'last_30d', compare: true, dateFormat: 'DD/MM/YYYY', updatedAt: '2026-10-22T12:04:00Z', timezone: 'Europe/Athens' }));
  assert.doesNotMatch(locked, /<select/);
  const custom = renderToStaticMarkup(createElement(DashboardControls, { report: { preset: 'custom', clientPresets: null }, preset: 'custom', compare: true, dateFormat: 'DD/MM/YYYY', updatedAt: '2026-10-22T12:04:00Z', timezone: 'Europe/Athens' }));
  assert.doesNotMatch(custom, /data-auto-refresh/, 'no refresh timer on a fixed period');
  assert.match(head, /data-auto-refresh/, 'a refresh timer on a rolling preset');
});

test('duplicate and convert: a copy keeps layout, analysis, sources and data under a new link; converting swaps the kind, the period and the data mode; the API exposes both', async () => {
  const { duplicateReport, convertReport, createReport } = await import('../src/lib/services/reports');
  const { reportView } = await import('../src/lib/layout/service');
  const { listRoutes } = await import('../src/lib/api/routes');
  const { presetRange } = await import('../src/lib/util/dates');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Original', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id] });
  // the seeded layout is stored so the copy has a real layout to carry and the live path has blocks to compose
  const seeded = JSON.parse(JSON.stringify((await reportView(await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } }), { includeHidden: true })).layout));
  await db.report.update({ where: { id: created.id }, data: { password: 'hash', views: 7, analysis: [{ id: 'a1', title: 'Note', html: '<p>hi</p>', author: 'user', updatedAt: '2026-10-22T00:00:00Z' }], layout: seeded } });
  const copy = await duplicateReport(created.id, company.id);
  const orig = await db.report.findUniqueOrThrow({ where: { id: created.id } });
  assert.notEqual(copy.id, orig.id);
  assert.equal(copy.title, 'Copy of Original');
  assert.deepEqual(copy.layout, orig.layout);
  assert.deepEqual(copy.analysis, orig.analysis);
  assert.deepEqual(copy.integrationIds, orig.integrationIds);
  assert.deepEqual(copy.data, orig.data, 'the frozen snapshot is copied, not regenerated');
  assert.notEqual(copy.shareToken, orig.shareToken);
  assert.equal(copy.password, null);
  assert.equal(copy.views, 0);
  assert.equal(copy.kind, 'report');
  assert.equal(copy.startDate, orig.startDate);
  await assert.rejects(duplicateReport(created.id, company.id + 100000), /not found/i, 'another company cannot copy it');
  // report → dashboard: live on the last 30 days, the password kept
  const dash = await convertReport(created.id, company.id, 'dashboard');
  assert.equal(dash.id, created.id);
  assert.equal(dash.kind, 'dashboard');
  assert.equal(dash.preset, 'last_30d');
  assert.equal(dash.data, null, 'frozen data dropped so the live path generates');
  assert.equal(dash.password, 'hash', 'the password stays');
  const live = await reportView(await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } }));
  const expected = presetRange('last_30d', project.timezone);
  assert.deepEqual(live.range, expected, 'the live view follows the preset');
  assert.ok(live.raw.sections.length > 0, 'live data generated (the test layout is empty, so the raw store is what proves it)');
  // dashboard → report: frozen on today's range of its preset
  const back = await convertReport(created.id, company.id, 'report');
  assert.equal(back.kind, 'report');
  assert.equal(back.preset, 'custom');
  assert.deepEqual({ start: back.startDate, end: back.endDate }, expected);
  assert.ok(back.data, 'data frozen');
  assert.ok(back.dataSyncedAt, 'sync time recorded');
  assert.equal((await convertReport(created.id, company.id, 'report')).kind, 'report', 'converting to the same kind changes nothing');
  const have = new Set(listRoutes().map((r) => `${r.method} ${r.path}`));
  for (const p of ['POST /reports/:id/duplicate', 'POST /reports/:id/convert', 'POST /dashboards/:id/duplicate', 'POST /dashboards/:id/convert']) assert.ok(have.has(p), p);
});
