// The server actions the live components import (`@/app/actions/{app,editor,auth,public}` resolve here in the demo).
// Same names, inputs and result shapes as the app's; the bodies follow the app's, for the demo company, without
// sessions or cache revalidation, and save the viewer's changes after each write.
import { getDb, persist, unlock } from './store';
import { bus } from '../bus';
import { createReport } from '@/lib/services/reports';
import { listCampaignsFor } from '@/lib/services/campaigns';
import { reportView, saveAsTemplate, saveLayout, type SaveLayoutResult } from '@/lib/layout/service';
import { analyse, analyseBlock } from '@/lib/ai/insights';
import { TONE_LABEL, isTone, type Tone } from '@/lib/ai/tones';
import { textToHtml } from '@/lib/util/sanitize';
import { randomToken } from '@/lib/crypto';
import { getRequestLocale } from '@/lib/i18n/request';
import { demoT } from '../demo-strings';
import { t } from '@/lib/i18n';
import type { CampaignScope } from '@/lib/engine/campaigns';
import type { AnalysisCard, Campaign } from '@/lib/engine/types';
import type { ReportLayout } from '@/lib/layout/types';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

/** The app's fallback note reads "(AI unavailable: Anthropic API 503: …)"; on a client page that is a plain sentence instead (review M15). */
function plainAiNote(html: string): string {
  return html.replace(/\(AI unavailable: Anthropic API \d+: ([^)<]*)\)/g, (_m, why: string) => `(${demoT(getRequestLocale(), 'aiNotUsed')}: ${why.trim()})`);
}
const plainCards = (cards: AnalysisCard[]) => cards.map((c) => (c.author === 'ai' ? { ...c, html: plainAiNote(c.html) } : c));
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

const COMPANY_ID = 1;
const DEMO_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'demo1234';

async function loadReport(id: number) {
  const r = await getDb().report.findFirst({ where: { id, companyId: COMPANY_ID }, include: { project: true } });
  if (!r) throw new Error('Report not found');
  return r as any;
}
async function loadCards(id: number) {
  const r = await loadReport(id);
  return { r, cards: ((r.analysis as AnalysisCard[] | null) ?? []) as AnalysisCard[] };
}

// ───────── auth and public ─────────
export async function loginAction(_: unknown, fd: FormData): Promise<{ error?: string } | void> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) return { error: 'Invalid email or password.' };
  bus.signIn();
  bus.navigate('/overview');
}

/** The demo password shown on the gate opens a protected sample link for the session; ?lang and ?embed are kept. */
export async function unlockShareAction(_: unknown, fd: FormData): Promise<{ error: string } | undefined> {
  const token = String(fd.get('token') ?? '');
  const kind = String(fd.get('kind') ?? 'report');
  if (String(fd.get('password') ?? '') !== DEMO_PASSWORD) return { error: t(getRequestLocale(), 'public.wrongPassword') };
  unlock(token);
  const q = new URLSearchParams();
  const lang = String(fd.get('lang') ?? '');
  if (lang === 'en' || lang === 'el') q.set('lang', lang);
  if (fd.get('embed') === '1') q.set('embed', '1');
  bus.navigate(`/${kind === 'dashboard' ? 'd' : kind === 'goals' ? 'g' : 'r'}/${token}${q.size ? `?${q}` : ''}`);
  // the gate usually sits on the same address, so the view also has to re-render to show the unlocked link
  bus.refresh();
  return undefined;
}

// ───────── reports ─────────
export async function createReportAction(input: {
  projectId: number;
  kind: 'report' | 'dashboard';
  title: string;
  subtitle?: string;
  start?: string;
  end?: string;
  comparisonStart?: string;
  comparisonEnd?: string;
  preset?: string;
  templateId: number;
  integrationIds: number[];
  withAi?: boolean;
  campaigns?: Record<number, CampaignScope>;
}): Promise<Result<{ id: number; kind: string }>> {
  try {
    const r = await createReport({
      companyId: COMPANY_ID,
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      start: input.start,
      end: input.end,
      comparisonStart: input.comparisonStart || null,
      comparisonEnd: input.comparisonEnd || null,
      preset: input.preset as any,
      templateId: input.templateId,
      integrationIds: input.integrationIds,
      createdBy: 1,
      withAi: input.withAi,
      campaigns: input.campaigns,
    } as any);
    const cards = (r.analysis as AnalysisCard[] | null) ?? [];
    if (cards.length) await getDb().report.update({ where: { id: r.id }, data: { analysis: plainCards(cards) } });
    persist();
    return { ok: true, id: r.id, kind: r.kind };
  } catch (e) {
    return fail(e);
  }
}

export async function listCampaignsAction(integrationId: number): Promise<Campaign[]> {
  const i = await getDb().integration.findFirst({ where: { id: integrationId, companyId: COMPANY_ID }, include: { project: true } });
  if (!i) throw new Error('Integration not found');
  return listCampaignsFor(i as any, (i as any).project);
}

// ───────── editor ─────────
export async function saveLayoutAction(input: { reportId: number; layout: ReportLayout }): Promise<Result<SaveLayoutResult>> {
  try {
    const out = await saveLayout(await loadReport(input.reportId), input.layout);
    persist();
    return { ok: true, ...out };
  } catch (e) {
    return fail(e);
  }
}

export async function saveReportAsTemplateAction(input: { reportId: number; title: string; description?: string }): Promise<Result<{ id: number; title: string }>> {
  try {
    const tpl = await saveAsTemplate(await loadReport(input.reportId), COMPANY_ID, input);
    persist();
    return { ok: true, id: tpl.id, title: tpl.title };
  } catch (e) {
    return fail(e);
  }
}

// ───────── analysis cards ─────────
export async function saveAnalysisAction(input: { reportId: number; cardId?: string; title: string; html: string }): Promise<Result> {
  try {
    const { r, cards } = await loadCards(input.reportId);
    const now = new Date().toISOString();
    const next = input.cardId
      ? cards.map((c) => (c.id === input.cardId ? { ...c, title: input.title, html: textToHtml(input.html), author: 'human' as const, updatedAt: now } : c))
      : [...cards, { id: randomToken(6), title: input.title, html: textToHtml(input.html), author: 'human' as const, updatedAt: now }];
    await getDb().report.update({ where: { id: r.id }, data: { analysis: next } });
    persist();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAnalysisAction(input: { reportId: number; cardId: string }): Promise<Result> {
  try {
    const { r, cards } = await loadCards(input.reportId);
    await getDb().report.update({ where: { id: r.id }, data: { analysis: cards.filter((c) => c.id !== input.cardId) } });
    persist();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateBlockAnalysisAction(input: { reportId: number; blockId: string; tone: Tone; language?: string; notes?: string }): Promise<Result<{ ai: boolean }>> {
  try {
    if (!isTone(input.tone)) throw new Error('Unknown tone');
    const { r, cards } = await loadCards(input.reportId);
    const data = (await reportView(r)).data;
    const sec = data.sections.find((s) => s.id === input.blockId);
    if (!sec) throw new Error('This block no longer exists');
    const a = await analyseBlock(data, input.blockId, { tone: input.tone, language: input.language, notes: input.notes, projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
    const card: AnalysisCard = { id: randomToken(6), title: `${sec.title} — ${TONE_LABEL[input.tone]}`, html: plainAiNote(a.html), author: 'ai', updatedAt: new Date().toISOString(), blockId: input.blockId, tone: input.tone };
    const kept = cards.filter((c) => !(c.author === 'ai' && c.blockId === input.blockId && (c.tone ?? 'general') === input.tone));
    await getDb().report.update({ where: { id: r.id }, data: { analysis: [...kept, card] } });
    persist();
    return { ok: true, ai: a.ai };
  } catch (e) {
    return fail(e);
  }
}

export async function generateAllBlocksAction(input: { reportId: number; language?: string }): Promise<Result<{ ai: boolean; blocks: number }>> {
  try {
    const { r, cards } = await loadCards(input.reportId);
    const data = (await reportView(r)).data;
    const sections = data.sections.filter((s) => s.blocks.length > 0);
    let ai = false;
    const fresh: AnalysisCard[] = [];
    for (const sec of sections) {
      const a = await analyseBlock(data, sec.id, { tone: 'general', language: input.language, projectName: r.project.name, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
      ai = ai || a.ai;
      fresh.push({ id: randomToken(6), title: `${sec.title} — ${TONE_LABEL.general}`, html: plainAiNote(a.html), author: 'ai', updatedAt: new Date().toISOString(), blockId: sec.id, tone: 'general' });
    }
    const kept = cards.filter((c) => !(c.author === 'ai' && c.blockId && (c.tone ?? 'general') === 'general' && sections.some((s) => s.id === c.blockId)));
    await getDb().report.update({ where: { id: r.id }, data: { analysis: [...kept, ...fresh] } });
    persist();
    return { ok: true, ai, blocks: fresh.length };
  } catch (e) {
    return fail(e);
  }
}

export async function generateAnalysisAction(input: { reportId: number; language?: string; notes?: string }): Promise<Result<{ ai: boolean }>> {
  try {
    const { r, cards } = await loadCards(input.reportId);
    const data = (await reportView(r)).data;
    const a = await analyse(data, r.project.name, { language: input.language, notes: input.notes, decimalSeparatorFormat: r.project.decimalSeparatorFormat });
    const card: AnalysisCard = { id: randomToken(6), title: a.ai ? 'AI analysis' : 'Automatic analysis', html: plainAiNote(a.html), author: 'ai', updatedAt: new Date().toISOString() };
    await getDb().report.update({ where: { id: r.id }, data: { analysis: [...cards, card] } });
    persist();
    return { ok: true, ai: a.ai };
  } catch (e) {
    return fail(e);
  }
}
