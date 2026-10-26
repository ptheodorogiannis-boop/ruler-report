'use server';

import { revalidatePath } from 'next/cache';
import { canWrite, requirePrincipal, type Principal } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveAsTemplate, saveLayout, type SaveLayoutResult } from '@/lib/layout/service';
import type { ReportLayout } from '@/lib/layout/types';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function writer(): Promise<Principal> {
  const p = await requirePrincipal();
  if (!canWrite(p)) throw new Error('Your role is read-only.');
  return p;
}
async function loadReport(p: Principal, id: number) {
  const r = await db.report.findFirst({ where: { id, companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!r) throw new Error('Report not found');
  return r;
}

/** Autosave from the editor: the whole layout, debounced on the client. Returns the raw data store so new widgets get their values. */
export async function saveLayoutAction(input: { reportId: number; layout: ReportLayout }): Promise<Result<SaveLayoutResult>> {
  try {
    const p = await writer();
    const r = await loadReport(p, input.reportId);
    const out = await saveLayout(r, input.layout);
    revalidatePath(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    return { ok: true, ...out };
  } catch (e) {
    return fail(e);
  }
}

export async function saveReportAsTemplateAction(input: { reportId: number; title: string; description?: string }): Promise<Result<{ id: number; title: string }>> {
  try {
    const p = await writer();
    const r = await loadReport(p, input.reportId);
    const t = await saveAsTemplate(r, p.companyId, input);
    revalidatePath('/templates');
    return { ok: true, id: t.id, title: t.title };
  } catch (e) {
    return fail(e);
  }
}
