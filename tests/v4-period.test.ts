import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '../src/lib/db';
import { addIntegration, makeCompany } from './helpers';
import type { AnalysisCard } from '../src/lib/engine/types';
import type { ReportLayout } from '../src/lib/layout/types';

// Changing a report's period (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §2): the numbers are
// re-pulled for the new dates, AI cards are rewritten, text a person wrote is kept and marked with the old period, and a
// source that only errors leaves everything as it was.

// a stand-in for the Anthropic API: a fixed answer, or 500 when `fail` is set; `before` runs before it answers (a
// concurrent edit), `delay` holds the answer back, and every request body is kept
let fail = false;
let before: (() => Promise<void>) | null = null;
let delay = 0;
const bodies: any[] = [];
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    bodies.push(JSON.parse(body || '{}'));
    if (before) await before();
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (fail) return res.writeHead(500).end('boom');
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ content: [{ type: 'text', text: '<p>New text.</p>' }] }));
  });
});
async function withStub<T>(fn: () => Promise<T>): Promise<T> {
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()));
  const prev = { key: process.env.ANTHROPIC_API_KEY, base: process.env.ANTHROPIC_BASE_URL };
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  try {
    return await fn();
  } finally {
    process.env.ANTHROPIC_API_KEY = prev.key ?? '';
    process.env.ANTHROPIC_BASE_URL = prev.base ?? '';
    await new Promise<void>((r) => stub.close(() => r()));
  }
}

const OLD = { start: '2026-09-01', end: '2026-09-30' };

/** A September report on a demo Meta Ads account, its layout stored, with an AI block card, an AI top card and a card a person wrote. */
async function setup(name = 'Period Co') {
  const { createReport } = await import('../src/lib/services/reports');
  const { reportView, persistSeed } = await import('../src/lib/layout/service');
  const { previousPeriod } = await import('../src/lib/util/dates');
  const { company, project } = await makeCompany(name);
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const comp = previousPeriod(OLD);
  const r0 = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'September', start: OLD.start, end: OLD.end, comparisonStart: comp.start, comparisonEnd: comp.end, templateId: tpl.id, integrationIds: [meta.id] });
  const r1 = await db.report.findUniqueOrThrow({ where: { id: r0.id }, include: { project: true } });
  const layout = await persistSeed(r1, await reportView(r1));
  const block = layout.blocks.find((b) => b.integrationId === meta.id)!;
  const num = block.widgets.find((w) => w.component === 'number_v1')!;
  const next: ReportLayout = {
    ...layout,
    blocks: layout.blocks.map((b) =>
      b.id === block.id
        ? {
            ...b,
            widgets: [
              ...b.widgets,
              { id: 'w-text', slug: 'analysis', key: 'text', component: 'analysis_v1', integrationId: 0, x: 0, y: 40, w: 12, h: 3, custom: { html: '<p>My notes</p>' } },
              { ...num, id: 'w-jan', y: 44, custom: { period: { start: '2026-01-01', end: '2026-01-31' } } },
            ],
          }
        : b,
    ),
  };
  const now = new Date().toISOString();
  const cards: AnalysisCard[] = [
    { id: 'blk', title: 'Meta — General', html: '<p>old block</p>', author: 'ai', updatedAt: now, blockId: block.id, tone: 'general' },
    { id: 'top', title: 'AI analysis', html: '<p>old top</p>', author: 'ai', updatedAt: now },
    { id: 'me', title: 'Mine', html: '<p>mine</p>', author: 'human', updatedAt: now },
  ];
  await db.report.update({ where: { id: r0.id }, data: { layout: next as any, analysis: cards as any } });
  // the stored snapshot includes the editor widgets, as after a refresh
  const { snapshotReport } = await import('../src/lib/engine/report');
  const full = await db.report.findUniqueOrThrow({ where: { id: r0.id }, include: { project: true } });
  await db.report.update({ where: { id: r0.id }, data: { data: (await snapshotReport(full)) as any, dataSyncedAt: new Date(Date.now() - 60_000) } });
  return { company, project, meta, report: await db.report.findUniqueOrThrow({ where: { id: r0.id } }), blockId: block.id };
}

test('inferComparison: previous period, previous year, none and custom', async () => {
  const { inferComparison } = await import('../src/lib/services/report-period');
  assert.equal(inferComparison(OLD, { start: '2026-08-02', end: '2026-08-31' }), 'previous_period');
  assert.equal(inferComparison(OLD, { start: '2025-09-01', end: '2025-09-30' }), 'previous_year');
  assert.equal(inferComparison(OLD, null), 'none');
  assert.equal(inferComparison(OLD, { start: '2026-01-01', end: '2026-01-10' }), 'custom');
});

test('re-pulls with the new dates and the comparison rule', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, report } = await setup();
  await changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' });
  const r = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.equal(r.startDate, '2026-10-01');
  assert.equal(r.endDate, '2026-10-31');
  assert.equal(r.comparisonStart, '2026-08-31');
  assert.equal(r.comparisonEnd, '2026-09-30');
  assert.equal((r.data as any).range.start, '2026-10-01');
  assert.ok(r.dataSyncedAt! > report.dataSyncedAt!, 'synced again');

  await changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_year' });
  const y = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.deepEqual([y.comparisonStart, y.comparisonEnd], ['2025-10-01', '2025-10-31']);
  await changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'none' });
  const n = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.deepEqual([n.comparisonStart, n.comparisonEnd], [null, null]);
  await changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: { start: '2026-07-01', end: '2026-07-31' } });
  const c = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.deepEqual([c.comparisonStart, c.comparisonEnd], ['2026-07-01', '2026-07-31']);
});

test('rewrites only AI cards; text a person wrote keeps its words and gets the old period', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, report } = await setup();
  fail = false;
  const res = await withStub(() => changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' }));
  assert.deepEqual(res, { rewritten: 2, failed: 0, stale: 2 });
  const r = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  const cards = r.analysis as unknown as AnalysisCard[];
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.match(by.blk.html, /New text\./);
  assert.match(by.top.html, /New text\./);
  assert.equal(by.blk.staleFor, undefined);
  assert.equal(by.top.staleFor, undefined);
  assert.equal(by.me.html, '<p>mine</p>');
  assert.deepEqual(by.me.staleFor, OLD);
  // the text widget in the layout is a person's text too
  const text = (r.layout as unknown as ReportLayout).blocks.flatMap((b) => b.widgets).find((w) => w.id === 'w-text')!;
  assert.equal(text.custom?.html, '<p>My notes</p>');
  assert.deepEqual(text.custom?.staleFor, OLD);
});

test('a failed rewrite keeps the text and marks it with the old period', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, report } = await setup();
  fail = true;
  try {
    const res = await withStub(() => changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' }));
    assert.equal(res.failed, 2);
    assert.equal(res.rewritten, 0);
  } finally {
    fail = false;
  }
  const cards = (await db.report.findUniqueOrThrow({ where: { id: report.id } })).analysis as unknown as AnalysisCard[];
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.equal(by.blk.html, '<p>old block</p>');
  assert.equal(by.top.html, '<p>old top</p>');
  assert.deepEqual(by.blk.staleFor, OLD);
  assert.deepEqual(by.top.staleFor, OLD);
});

test('widgets with their own period keep it', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, report } = await setup();
  await changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' });
  const r = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  const jan = (r.layout as unknown as ReportLayout).blocks.flatMap((b) => b.widgets).find((w) => w.id === 'w-jan')!;
  assert.deepEqual(jan.custom?.period, { start: '2026-01-01', end: '2026-01-31' });
  const keys = Object.keys((r.data as any).widgets ?? {});
  assert.ok(keys.some((k) => k.endsWith('@2026-01-01..2026-01-31')), `widget-period value kept: ${keys.join(', ')}`);
});

test('a source that only errors aborts and changes nothing', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, meta, report } = await setup();
  await db.integration.update({ where: { id: meta.id }, data: { credentials: null } });
  const before = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  await assert.rejects(changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' }), new RegExp(meta.name));
  const after = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.equal(after.startDate, before.startDate);
  assert.equal(after.endDate, before.endDate);
  assert.equal(JSON.stringify(after.data), JSON.stringify(before.data));
  assert.equal(JSON.stringify(after.analysis), JSON.stringify(before.analysis));
  assert.equal(JSON.stringify(after.layout), JSON.stringify(before.layout));
});

test('refuses bad input and archived reports', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { archiveReport } = await import('../src/lib/services/reports');
  const { company, report } = await setup();
  await assert.rejects(changeReportPeriod(report.id, company.id, { start: '2026-10-31', end: '2026-10-01', comparison: 'none' }), /start must be on or before end/);
  await assert.rejects(changeReportPeriod(report.id, company.id, { start: '2026-13-01', end: '2026-10-01', comparison: 'none' }), /date/i);
  await assert.rejects(changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: { start: '2026-07-31', end: '2026-07-01' } }), /comparison/i);
  const other = await makeCompany('Other Period Co');
  await assert.rejects(changeReportPeriod(report.id, other.company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'none' }), /Not found/);
  await archiveReport(report.id, company.id);
  await assert.rejects(changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'none' }), /Restore the report first/);
});

test('editing clears the written-for note', async () => {
  const { withoutStale } = await import('../src/lib/services/report-period');
  const card = withoutStale({ id: 'c', staleFor: { start: '2026-09-01', end: '2026-09-30' } });
  assert.equal('staleFor' in card, false);
  assert.equal(card.id, 'c');
});

test('an edit saved while the numbers update is never overwritten: the change stops and asks to try again', async () => {
  const { changeReportPeriod } = await import('../src/lib/services/report-period');
  const { company, report } = await setup();
  const edited = { ...(report.layout as any), blocks: (report.layout as any).blocks.map((b: any, i: number) => (i === 0 ? { ...b, title: 'Renamed during the update' } : b)) };
  before = async () => {
    before = null;
    await db.report.update({ where: { id: report.id }, data: { layout: edited } });
  };
  try {
    await assert.rejects(
      withStub(() => changeReportPeriod(report.id, company.id, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' })),
      /changed while the numbers were updating/
    );
  } finally {
    before = null;
  }
  const r = await db.report.findUniqueOrThrow({ where: { id: report.id } });
  assert.equal((r.layout as any).blocks[0].title, 'Renamed during the update', 'the edit is kept');
  assert.equal(r.startDate, report.startDate, 'the period is unchanged');
});
