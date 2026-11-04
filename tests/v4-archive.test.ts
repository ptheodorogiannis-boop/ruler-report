import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { addIntegration, api, makeCompany } from './helpers';

// Archive and delete (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §1): archiving hides a report
// and turns its public link off without touching the share setting; delete needs the archive and the exact name.

async function setup(name = 'Archive Co') {
  const { createReport } = await import('../src/lib/services/reports');
  const { company, project, token } = await makeCompany(name);
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const r = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'October review', start: '2026-10-01', end: '2026-10-31', templateId: tpl.id, integrationIds: [meta.id] });
  return { company, project, token, r };
}

test('archive and restore: archivedAt set and cleared, the share setting untouched', async () => {
  const { archiveReport, restoreReport } = await import('../src/lib/services/reports');
  const { company, r } = await setup();
  const a = await archiveReport(r.id, company.id);
  assert.ok(a.archivedAt instanceof Date);
  assert.equal(a.shareEnabled, true);
  const b = await restoreReport(r.id, company.id);
  assert.equal(b.archivedAt, null);
  assert.equal(b.shareEnabled, true);
});

test('public routes 404 while archived and answer again after restore', async () => {
  const { archiveReport, restoreReport } = await import('../src/lib/services/reports');
  const { POST } = await import('../src/app/api/public/ask/[token]/route');
  const { GET } = await import('../src/app/api/pdf/[token]/route');
  const { NextRequest } = await import('next/server');
  const { company, r } = await setup();
  const ask = () => POST(new NextRequest(`http://localhost:3100/api/public/ask/${r.shareToken}`, { method: 'POST', body: JSON.stringify({ question: 'How many leads?' }), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ token: r.shareToken }) });
  const pdf = () => GET(new NextRequest(`http://localhost:3100/api/pdf/${r.shareToken}`), { params: Promise.resolve({ token: r.shareToken }) });
  await archiveReport(r.id, company.id);
  assert.equal((await ask()).status, 404);
  assert.equal((await pdf()).status, 404);
  await restoreReport(r.id, company.id);
  assert.notEqual((await ask()).status, 404, 'the link answers again (403 or 503, never 404)');
  assert.notEqual((await pdf()).status, 404);
});

test('a link that was off stays off after archive and restore', async () => {
  const { archiveReport, restoreReport } = await import('../src/lib/services/reports');
  const { publicReportWhere } = await import('../src/lib/share');
  const { company, r } = await setup();
  await db.report.update({ where: { id: r.id }, data: { shareEnabled: false } });
  await archiveReport(r.id, company.id);
  const back = await restoreReport(r.id, company.id);
  assert.equal(back.shareEnabled, false);
  assert.equal(await db.report.findFirst({ where: publicReportWhere(r.shareToken) }), null);
  await db.report.update({ where: { id: r.id }, data: { shareEnabled: true } });
  assert.ok(await db.report.findFirst({ where: publicReportWhere(r.shareToken, 'report') }));
  assert.equal(await db.report.findFirst({ where: publicReportWhere(r.shareToken, 'dashboard') }), null);
});

test('delete needs the archive and the exact name', async () => {
  const { archiveReport, deleteArchivedReport } = await import('../src/lib/services/reports');
  const { company, r } = await setup();
  await assert.rejects(deleteArchivedReport(r.id, company.id, r.title), /Archive the report before deleting it/);
  await archiveReport(r.id, company.id);
  await assert.rejects(deleteArchivedReport(r.id, company.id, 'wrong'), /Type the report name exactly/);
  await deleteArchivedReport(r.id, company.id, r.title);
  assert.equal(await db.report.findUnique({ where: { id: r.id } }), null);
});

test('delete cascades: client questions go, timeline events stay without the report', async () => {
  const { archiveReport, deleteArchivedReport } = await import('../src/lib/services/reports');
  const { company, project, r } = await setup();
  const q = await db.clientQuestion.create({ data: { reportId: r.id, question: 'How many leads?', answer: '42', locale: 'en', ai: true } });
  const ev = await db.timelineEvent.create({ data: { projectId: project.id, reportId: r.id, title: 'Launch', date: '2026-10-05' } });
  await archiveReport(r.id, company.id);
  await deleteArchivedReport(r.id, company.id, r.title);
  assert.equal(await db.clientQuestion.findUnique({ where: { id: q.id } }), null);
  assert.equal((await db.timelineEvent.findUniqueOrThrow({ where: { id: ev.id } })).reportId, null);
});

test("another company's report is not found", async () => {
  const { archiveReport, restoreReport, deleteArchivedReport } = await import('../src/lib/services/reports');
  const { r } = await setup();
  const other = await makeCompany('Other Archive Co');
  await assert.rejects(archiveReport(r.id, other.company.id), /Not found/);
  await assert.rejects(restoreReport(r.id, other.company.id), /Not found/);
  await assert.rejects(deleteArchivedReport(r.id, other.company.id, r.title), /Not found/);
});

test('app-wide search skips archived reports', async () => {
  const { archiveReport } = await import('../src/lib/services/reports');
  const { searchAll } = await import('../src/lib/services/search');
  const { principalFor } = await import('./principal');
  const { company, r } = await setup();
  await db.report.update({ where: { id: r.id }, data: { title: 'Zephyr quarterly' } });
  const p = await principalFor(company.id, 'admin', null);
  const titles = async () => (await searchAll(p, 'zephyr')).flatMap((g) => g.items.map((i) => i.label));
  assert.deepEqual(await titles(), ['Zephyr quarterly']);
  await archiveReport(r.id, company.id);
  assert.deepEqual(await titles(), []);
});

test('the API keeps listing archived reports and says when they were archived', async () => {
  const { archiveReport } = await import('../src/lib/services/reports');
  const { company, token, r } = await setup();
  await archiveReport(r.id, company.id);
  const res = await api(token, 'GET', '/reports');
  assert.equal(res.status, 200);
  const row = res.json.data.find((x: any) => x.id === r.id);
  assert.ok(row, 'still listed');
  assert.match(row.archived_at, /^\d{4}-\d{2}-\d{2}T/);
});
