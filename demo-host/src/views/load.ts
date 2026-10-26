// What each live view needs, computed in the browser the way the app's server pages compute it.
import { useEffect, useRef, useState } from 'react';
import { getDb, persist } from '../server/store';
import { persistSeed, reportView, type ReportView } from '@/lib/layout/service';
import { sanitizeHtml } from '@/lib/util/sanitize';
import { localeForPublic, type Locale } from '@/lib/i18n';
import { CATEGORY_LABEL, getIntegrationDef, isAdsSlug } from '@/lib/catalog/integrations';
import { campaignScopeOf } from '@/lib/engine/campaigns';
import type { AnalysisCard } from '@/lib/engine/types';
import type { CardView } from '@/components/analysis-panel';

const COMPANY_ID = 1;
const fullReport = { project: { include: { company: true } } } as const;

export interface ReportPageData {
  r: any;
  view: ReportView;
  customMetrics: { id: number; name: string; formula: string }[];
  cards: CardView[];
  timeline: any[];
  fmt: { decimalSeparatorFormat: string };
  shareUrl: string;
}

const cardsOf = (r: any): CardView[] => ((r.analysis as AnalysisCard[] | null) ?? []).map((c) => ({ id: c.id, title: c.title, html: sanitizeHtml(c.html), raw: c.html, author: c.author, blockId: c.blockId, tone: c.tone }));
const timelineOf = (projectId: number, range: { start: string; end: string }) => getDb().timelineEvent.findMany({ where: { projectId, date: { gte: range.start, lte: range.end } }, orderBy: { date: 'asc' } });

export async function loadReportPage(id: number, kind: 'report' | 'dashboard'): Promise<ReportPageData | null> {
  const r = await getDb().report.findFirst({ where: { id, kind, companyId: COMPANY_ID }, include: { ...fullReport, template: true } });
  if (!r) return null;
  const view = await reportView(r as any, { includeHidden: true });
  if (view.seeded) {
    await persistSeed(r as any, view);
    persist();
  }
  const customMetrics = (await getDb().customMetric.findMany({ where: { companyId: COMPANY_ID, OR: [{ projectId: null }, { projectId: r.projectId }] }, orderBy: { name: 'asc' } })).map((m) => ({ id: m.id, name: m.name, formula: m.formula }));
  return {
    r,
    view,
    customMetrics,
    cards: cardsOf(r),
    timeline: await timelineOf(r.projectId, view.range),
    fmt: { decimalSeparatorFormat: (r as any).project.decimalSeparatorFormat },
    shareUrl: `/${kind === 'report' ? 'r' : 'd'}/${r.shareToken}`,
  };
}

export interface PublicData {
  r: any;
  locale: Locale;
  view: ReportView;
  cards: (AnalysisCard & { html: string })[];
  timeline: any[];
}

export async function loadPublic(token: string, kind: 'report' | 'dashboard', opts: { preset?: string; compare?: boolean; lang?: string }): Promise<PublicData | null> {
  const r = await getDb().report.findFirst({ where: { shareToken: token, kind, shareEnabled: true }, include: fullReport });
  if (!r) return null;
  const locale = localeForPublic((r as any).project, opts.lang);
  const view = await reportView(r as any, { preset: opts.preset, compare: opts.compare });
  return { r, locale, view, cards: ((r.analysis as AnalysisCard[] | null) ?? []).map((c) => ({ ...c, html: sanitizeHtml(c.html) })), timeline: await timelineOf(r.projectId, view.range) };
}

export interface NewReportData {
  kind: 'report' | 'dashboard';
  projects: any[];
  project: any | null;
  templates: { id: number; title: string; description: string; isDefault: boolean }[];
  integrations: any[];
}

export async function loadNewReport(query: string): Promise<NewReportData> {
  const sp = new URLSearchParams(query);
  const kind = sp.get('kind') === 'dashboard' ? 'dashboard' : 'report';
  const projects = await getDb().project.findMany({ where: { companyId: COMPANY_ID }, orderBy: { name: 'asc' } });
  const project = projects.find((x) => x.id === Number(sp.get('project'))) ?? null;
  if (!project) return { kind, projects, project: null, templates: [], integrations: [] };
  const [templates, integrations] = await Promise.all([
    getDb().template.findMany({ where: { kind, OR: [{ companyId: null }, { companyId: COMPANY_ID }] }, orderBy: [{ isDefault: 'desc' }, { title: 'asc' }] }),
    getDb().integration.findMany({ where: { projectId: project.id, status: 'active' }, orderBy: [{ slug: 'asc' }] }),
  ]);
  return {
    kind,
    projects,
    project,
    templates: templates.map((t) => ({ id: t.id, title: t.title, description: t.description, isDefault: t.isDefault })),
    integrations: integrations.map((i) => {
      const def = getIntegrationDef(i.slug);
      return { id: i.id, label: i.name, platform: def?.name ?? i.slug, slug: i.slug, color: def?.color ?? '#94a3b8', category: def ? CATEGORY_LABEL[def.category] : 'Other', isAds: isAdsSlug(i.slug), campaigns: campaignScopeOf(i as any) };
    }),
  };
}

/** Run a loader; keep showing the last result while a refresh is in flight so editors never remount. */
export function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: unknown; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (data) => n === seq.current && setState({ data, error: null, loading: false }),
      (error) => n === seq.current && setState((s) => ({ data: s.data, error, loading: false })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
