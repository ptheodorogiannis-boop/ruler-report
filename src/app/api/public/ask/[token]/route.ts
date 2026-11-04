// POST /api/public/ask/<shareToken> (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §3): a client's
// question on a shared link, answered in plain words from that report's numbers. Token-gated like /r, /d and the PDF
// route: the link must be enabled, the agency must have switched Ask on for the report, a password report needs its
// unlock cookie. At most 30 questions per report in a rolling 24 hours; every question and answer is stored so the agency
// sees what clients ask.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publicReportWhere, unlockCookie } from '@/lib/share';
import { CLIENT_ASK_DAILY, aiConfigured, askClient } from '@/lib/ai/insights';
import { localeForPublic, t } from '@/lib/i18n';
import { reportView } from '@/lib/layout/service';
import { clientPreset } from '@/lib/services/dashboards';

export const dynamic = 'force-dynamic';

// a dashboard client's own period and comparison travel with the question; the preset is checked against the ones the
// agency allows (clientPreset), so a crafted request never widens what can be queried
const Body = z.object({ question: z.string().trim().min(2).max(300), lang: z.string().max(8).optional(), preset: z.string().max(32).optional(), compare: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await db.report.findFirst({ where: publicReportWhere(token), include: { project: true } });
  if (!r) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!aiConfigured()) return NextResponse.json({ message: 'Questions are not available on this server' }, { status: 503 });
  if (!r.clientAsk) return NextResponse.json({ message: 'Questions are switched off for this report' }, { status: 403 });
  if (r.password && req.cookies.get(`rr_pw_${r.id}`)?.value !== unlockCookie(r.id, r.password)) return NextResponse.json({ message: 'Unlock the report first' }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'A question of 2 to 300 characters' }, { status: 422 });
  const locale = localeForPublic(r.project, body.data.lang);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // claim a place before counting, so questions sent at once cannot all read the same count: each one counts the rows up
  // to and including its own, the claim beyond the limit is withdrawn, and the row receives its answer below
  const claim = await db.clientQuestion.create({ data: { reportId: r.id, question: body.data.question, answer: '', locale, ai: true } });
  const used = await db.clientQuestion.count({ where: { reportId: r.id, createdAt: { gte: since }, id: { lte: claim.id } } });
  if (used > CLIENT_ASK_DAILY) {
    await db.clientQuestion.delete({ where: { id: claim.id } });
    return NextResponse.json({ message: t(locale, 'ask.limit') }, { status: 429 });
  }
  const view = await reportView(r, r.kind === 'dashboard' ? { preset: clientPreset(r, body.data.preset), compare: body.data.compare } : {});
  const { answer, ai } = await askClient(view.data, r.project.name, body.data.question, locale);
  await db.clientQuestion.update({ where: { id: claim.id }, data: { answer, ai } });
  return NextResponse.json({ answer });
}
