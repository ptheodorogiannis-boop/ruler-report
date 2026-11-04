// Changing a report's period (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §2): the snapshot is
// rebuilt for the new dates, AI cards are rewritten, text a person wrote is kept and marked with the period it was written
// for, and one write saves it all. A source that only errors in the new snapshot aborts the change before anything is saved.
import { db } from '@/lib/db';
import { analyse, analyseBlock } from '@/lib/ai/insights';
import { snapshotReport } from '@/lib/engine/report';
import type { AnalysisCard, DateRange, ReportData, WidgetValue } from '@/lib/engine/types';
import { AI_LANGUAGES } from '@/lib/ai/language';
import { reportView } from '@/lib/layout/service';
import type { ReportLayout } from '@/lib/layout/types';
import { comparisonFor, realDay, withoutStale, type ComparisonChoice } from './period-rules';

export { inferComparison, withoutStale, type ComparisonChoice } from './period-rules';

/** Every value of a snapshot, per account: the generated sections and the values added in the editor. */
function valuesByIntegration(data: ReportData | null): Map<number, WidgetValue[]> {
  const out = new Map<number, WidgetValue[]>();
  const add = (id: number, v: WidgetValue) => id > 0 && out.set(id, [...(out.get(id) ?? []), v]);
  for (const s of data?.sections ?? []) for (const b of s.blocks) add(b.integrationId, b.widget.value);
  for (const [k, b] of Object.entries(data?.widgets ?? {})) add(Number(k.split(':')[0]), b.widget.value);
  return out;
}

export async function changeReportPeriod(reportId: number, companyId: number, input: { start: string; end: string; comparison: ComparisonChoice; /** the language the agency writes AI text in (AI_LANGUAGES) */ language?: string }): Promise<{ rewritten: number; failed: number; stale: number }> {
  const r = await db.report.findFirst({ where: { id: reportId, companyId }, include: { project: true } });
  if (!r) throw new Error('Not found');
  if (r.archivedAt) throw new Error('Restore the report first');
  if (r.kind !== 'report') throw new Error('Dashboards follow their preset; only reports have a fixed period');
  if (!realDay(input.start) || !realDay(input.end)) throw new Error('Invalid date: use YYYY-MM-DD');
  if (input.start > input.end) throw new Error('start must be on or before end');
  const range = { start: input.start, end: input.end };
  const comparison = comparisonFor(range, input.comparison);
  const old = { start: r.startDate, end: r.endDate };
  const next = { ...r, startDate: range.start, endDate: range.end, comparisonStart: comparison?.start ?? null, comparisonEnd: comparison?.end ?? null };

  // 1. the new numbers, in memory
  const snapshot = await snapshotReport(next);

  // 2. an account that had numbers and now has only errors aborts the change (expired token, revoked access…)
  const before = valuesByIntegration(r.data as unknown as ReportData | null);
  const after = valuesByIntegration(snapshot);
  const broken = [...after].filter(([id, vals]) => before.get(id)?.some((v) => v.type !== 'error') && vals.length > 0 && vals.every((v) => v.type === 'error'));
  if (broken.length) {
    const names = new Map((await db.integration.findMany({ where: { id: { in: broken.map(([id]) => id) } }, select: { id: true, name: true } })).map((i) => [i.id, i.name]));
    throw new Error(broken.map(([id, vals]) => `${names.get(id) ?? `Account ${id}`}: ${(vals[0] as Extract<WidgetValue, { type: 'error' }>).message}`).join('; '));
  }

  // 3. AI cards are rewritten for the new dates, one at a time; a failed rewrite keeps its text and the old period
  const view = (await reportView({ ...next, data: snapshot as any })).data;
  // rewritten text keeps the agency's language (a Greek report stays Greek); anything unknown falls back to English
  const language = AI_LANGUAGES.find((l) => l === input.language) ?? 'English';
  const opts = { projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat, language };
  let rewritten = 0;
  let failed = 0;
  let stale = 0;
  const cards: AnalysisCard[] = [];
  for (const c of (r.analysis as unknown as AnalysisCard[] | null) ?? []) {
    if (c.author !== 'ai') {
      stale++;
      cards.push({ ...c, staleFor: c.staleFor ?? old });
      continue;
    }
    const a = c.blockId
      ? view.sections.some((s) => s.id === c.blockId)
        ? await analyseBlock(view, c.blockId, { tone: c.tone ?? 'general', ...opts })
        : null
      : await analyse(view, r.project.name, { decimalSeparatorFormat: opts.decimalSeparatorFormat, language });
    if (a?.ai) {
      rewritten++;
      cards.push({ ...withoutStale(c), html: a.html, updatedAt: new Date().toISOString() });
    } else {
      failed++;
      cards.push({ ...c, staleFor: c.staleFor ?? old });
    }
  }

  // 4. text widgets in the layout are a person's text: kept, marked with the period they were written for
  const layout = r.layout as unknown as ReportLayout | null;
  const nextLayout = layout && {
    ...layout,
    blocks: layout.blocks.map((b) => ({
      ...b,
      widgets: b.widgets.map((w) => {
        if (w.slug !== 'analysis') return w;
        stale++;
        return { ...w, custom: { ...w.custom, staleFor: w.custom?.staleFor ?? old } };
      }),
    })),
  };

  // 5. one write, and only over the report as it was read: an edit saved meanwhile (another tab, a teammate) is kept
  const written = await db.report.updateMany({
    where: { id: r.id, updatedAt: r.updatedAt },
    data: {
      startDate: range.start,
      endDate: range.end,
      comparisonStart: comparison?.start ?? null,
      comparisonEnd: comparison?.end ?? null,
      data: snapshot as any,
      dataSyncedAt: new Date(),
      analysis: cards as any,
      ...(nextLayout ? { layout: nextLayout as any } : {}),
    },
  });
  if (written.count === 0) throw new Error('The report changed while the numbers were updating. Your changes are kept: apply the period again.');
  return { rewritten, failed, stale };
}
