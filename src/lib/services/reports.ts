import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { randomToken } from '@/lib/crypto';
import { snapshotReport } from '@/lib/engine/report';
import { analyse } from '@/lib/ai/insights';
import type { AnalysisCard, DateRange } from '@/lib/engine/types';
import { emitEvent } from './webhooks';
import { presetRange, previousPeriod, type Preset } from '@/lib/util/dates';

import { scopeSchema, type CampaignScope } from '@/lib/engine/campaigns';

export interface CreateReportInput {
  companyId: number;
  projectId: number;
  kind: 'report' | 'dashboard';
  title: string;
  subtitle?: string;
  start?: string;
  end?: string;
  comparisonStart?: string | null;
  comparisonEnd?: string | null;
  preset?: Preset;
  /** dashboards: presets the client may switch to from the public link (spec v3 §3.5) */
  clientPresets?: string[];
  templateId: number;
  integrationIds: number[];
  createdBy?: number | null;
  automationId?: number | null;
  withAi?: boolean;
  /** campaign scope per ads account for this report (wizard / API); stored as Report.campaignScopes */
  campaigns?: Record<string | number, CampaignScope>;
}

export async function createReport(inp: CreateReportInput) {
  const project = await db.project.findFirst({ where: { id: inp.projectId, companyId: inp.companyId } });
  if (!project) throw new Error('Project not found');
  const template = await db.template.findFirst({ where: { id: inp.templateId, OR: [{ companyId: null }, { companyId: inp.companyId }] } });
  if (!template) throw new Error('Template not found');
  const integrations = await db.integration.findMany({ where: { id: { in: inp.integrationIds }, projectId: inp.projectId } });
  if (integrations.length === 0) throw new Error('Select at least one integration that belongs to this project');

  let range: DateRange;
  let comp: DateRange | null = null;
  const preset = inp.kind === 'dashboard' ? inp.preset ?? 'last_30d' : 'custom';
  if (inp.kind === 'dashboard' && preset !== 'custom') {
    range = presetRange(preset, project.timezone);
    comp = previousPeriod(range);
  } else {
    if (!inp.start || !inp.end) throw new Error('start and end are required');
    if (inp.start > inp.end) throw new Error('start must be on or before end');
    range = { start: inp.start, end: inp.end };
    comp = inp.comparisonStart && inp.comparisonEnd ? { start: inp.comparisonStart, end: inp.comparisonEnd } : null;
  }

  // validate the per-account scopes before anything is written
  const campaignScopes = inp.campaigns
    ? Object.fromEntries(
        Object.entries(inp.campaigns).map(([k, v]) => {
          const r = scopeSchema.safeParse(v);
          if (!r.success) throw new Error(`Invalid campaign scope for account ${k}`);
          return [String(k), r.data];
        }),
      )
    : undefined;
  const report = await db.report.create({
    data: {
      companyId: inp.companyId,
      projectId: inp.projectId,
      kind: inp.kind,
      title: inp.title,
      subtitle: inp.subtitle ?? 'Performance analysis',
      startDate: range.start,
      endDate: range.end,
      comparisonStart: comp?.start ?? null,
      comparisonEnd: comp?.end ?? null,
      preset,
      templateId: template.id,
      integrationIds: integrations.map((i) => i.id),
      shareToken: randomToken(24),
      ...(inp.clientPresets?.length ? { clientPresets: inp.clientPresets as any } : {}),
      createdBy: inp.createdBy ?? null,
      automationId: inp.automationId ?? null,
      ...(campaignScopes ? { campaignScopes: campaignScopes as any } : {}),
    },
    include: { project: true },
  });
  await db.template.update({ where: { id: template.id }, data: { usedCount: { increment: 1 } } });

  if (inp.kind === 'report') {
    const data = await snapshotReport(report);
    let analysis: AnalysisCard[] | undefined;
    if (inp.withAi) {
      const a = await analyse(data, project.name, { decimalSeparatorFormat: project.decimalSeparatorFormat });
      analysis = [{ id: randomToken(6), title: a.ai ? 'AI analysis' : 'Automatic analysis', html: a.html, author: 'ai', updatedAt: new Date().toISOString() }];
    }
    await db.report.update({ where: { id: report.id }, data: { data: data as any, dataSyncedAt: new Date(), ...(analysis ? { analysis: analysis as any } : {}) } });
  }

  const base = process.env.APP_URL || 'http://localhost:3100';
  const url = `${base}/${inp.kind === 'report' ? 'r' : 'd'}/${report.shareToken}`;
  await emitEvent(inp.companyId, inp.projectId, inp.kind === 'report' ? 'report_created' : 'dashboard_created', {
    id: report.id,
    title: report.title,
    url,
    internal_url: `${base}/${inp.kind === 'report' ? 'reports' : 'dashboards'}/${report.id}`,
    start_date: range.start,
    end_date: range.end,
  });
  return db.report.findUniqueOrThrow({ where: { id: report.id } });
}

export const shareUrl = (kind: string, token: string) => `${process.env.APP_URL || 'http://localhost:3100'}/${kind === 'report' ? 'r' : kind === 'goals' ? 'g' : 'd'}/${token}`;

/** A copy under a new link (spec v3 §3.6): same project, layout, theme, data, analysis, sources and preset; no password, no views, not tied to an automation. */
export async function duplicateReport(id: number, companyId: number) {
  const r = await db.report.findFirst({ where: { id, companyId } });
  if (!r) throw new Error('Report not found');
  const { id: _id, createdAt: _c, updatedAt: _u, shareToken: _t, password: _p, views: _v, automationId: _a, title: _title, ...rest } = r;
  const data: Record<string, unknown> = { title: `Copy of ${r.title}`, shareToken: randomToken(24), password: null, views: 0, automationId: null };
  // null JSON columns are left out so Prisma keeps them null without the DbNull dance
  for (const [k, v] of Object.entries(rest)) if (v !== null) data[k] = v;
  return db.report.create({ data: data as Prisma.ReportUncheckedCreateInput });
}

/**
 * Switch between a frozen report and a live dashboard (spec v3 §3.6). Report → dashboard keeps the layout and theme, goes
 * live on the last 30 days and drops the frozen data; dashboard → report freezes today's range of its preset. Same kind: no-op.
 */
export async function convertReport(id: number, companyId: number, kind: 'report' | 'dashboard') {
  const r = await db.report.findFirst({ where: { id, companyId }, include: { project: true } });
  if (!r) throw new Error('Report not found');
  if (r.kind === kind) return r;
  if (kind === 'dashboard') {
    const range = presetRange('last_30d', r.project.timezone);
    const comp = previousPeriod(range);
    return db.report.update({ where: { id: r.id }, data: { kind: 'dashboard', preset: 'last_30d', startDate: range.start, endDate: range.end, comparisonStart: comp.start, comparisonEnd: comp.end, data: Prisma.DbNull, dataSyncedAt: null }, include: { project: true } });
  }
  const preset = (r.preset && r.preset !== 'custom' ? r.preset : 'last_30d') as Preset;
  const range = presetRange(preset, r.project.timezone);
  const comp = previousPeriod(range);
  const frozen = await db.report.update({ where: { id: r.id }, data: { kind: 'report', preset: 'custom', startDate: range.start, endDate: range.end, comparisonStart: comp.start, comparisonEnd: comp.end, clientPresets: Prisma.DbNull }, include: { project: true } });
  const data = await snapshotReport(frozen);
  return db.report.update({ where: { id: r.id }, data: { data: data as any, dataSyncedAt: new Date() }, include: { project: true } });
}
