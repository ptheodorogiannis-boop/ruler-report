// App-wide search (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §2): clients, reports, dashboards,
// connected accounts and, inside a project, the platforms to connect. Scoped like every other read (the principal's
// company and projects; a client user sees only reports and dashboards). Matching ignores case and accents and treats the
// query as plain text, so it is done here over the company's own rows rather than with the database's LIKE (SQLite folds
// case for ASCII only, and "%" or "_" would be wildcards there).
import type { Principal } from '@/lib/auth';
import { INTEGRATIONS, getIntegrationDef } from '@/lib/catalog/integrations';
import { db } from '@/lib/db';
import { fold } from '@/lib/util/text';

export type SearchKind = 'clients' | 'reports' | 'dashboards' | 'accounts' | 'connect';
export interface SearchItem {
  label: string;
  sub?: string;
  href: string;
}
export interface SearchGroup {
  kind: SearchKind;
  items: SearchItem[];
}
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_PER_GROUP = 8;
/** rows read per kind before matching; a workspace beyond this searches its most recent rows */
const SCAN = 2000;

export async function searchAll(p: Principal, q: string, projectId?: number): Promise<SearchGroup[]> {
  const needle = fold(q.trim());
  if (needle.length < SEARCH_MIN_CHARS) return [];
  const hit = (...texts: (string | null | undefined)[]) => texts.some((t) => !!t && fold(t).includes(needle));
  const client = p.role === 'client';
  const inProjects = p.projectIds ? { in: p.projectIds } : undefined;

  const projects = await db.project.findMany({ where: { companyId: p.companyId, ...(inProjects ? { id: inProjects } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: SCAN });
  const projectName = new Map(projects.map((x) => [x.id, x.name]));
  const reports = await db.report.findMany({ where: { companyId: p.companyId, archivedAt: null, ...(inProjects ? { projectId: inProjects } : {}) }, select: { id: true, title: true, kind: true, projectId: true }, orderBy: { createdAt: 'desc' }, take: SCAN });
  const accounts = client ? [] : await db.integration.findMany({ where: { companyId: p.companyId, ...(inProjects ? { projectId: inProjects } : {}) }, select: { id: true, name: true, slug: true, projectId: true }, orderBy: { createdAt: 'desc' }, take: SCAN });
  const here = projectId != null && projectName.has(projectId) ? projectId : null;

  const groups: SearchGroup[] = [
    { kind: 'clients', items: client ? [] : projects.filter((x) => hit(x.name)).map((x) => ({ label: x.name, href: `/projects/${x.id}` })) },
    { kind: 'reports', items: reports.filter((r) => r.kind === 'report' && hit(r.title)).map((r) => ({ label: r.title, sub: projectName.get(r.projectId), href: `/reports/${r.id}` })) },
    { kind: 'dashboards', items: reports.filter((r) => r.kind === 'dashboard' && hit(r.title)).map((r) => ({ label: r.title, sub: projectName.get(r.projectId), href: `/dashboards/${r.id}` })) },
    {
      kind: 'accounts',
      items: accounts
        .filter((a) => hit(a.name, getIntegrationDef(a.slug)?.name))
        .map((a) => ({ label: a.name, sub: [getIntegrationDef(a.slug)?.name, projectName.get(a.projectId)].filter(Boolean).join(' · '), href: `/projects/${a.projectId}?tab=integrations` })),
    },
    { kind: 'connect', items: client || here == null ? [] : INTEGRATIONS.filter((d) => hit(d.name, d.slug)).map((d) => ({ label: d.name, href: `/projects/${here}/connect/${d.slug}` })) },
  ];
  return groups.map((g) => ({ ...g, items: g.items.slice(0, SEARCH_PER_GROUP) })).filter((g) => g.items.length > 0);
}
