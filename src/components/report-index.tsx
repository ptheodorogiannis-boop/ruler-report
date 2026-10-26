import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { Plus } from 'lucide-react';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { ReportRows, type ReportRow } from '@/components/report-rows';
import { canWrite, projectScope, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { containsText } from '@/lib/platform';
import { requestBaseUrl } from '@/lib/share';

export async function ReportIndex({ kind, q, project, page }: { kind: 'report' | 'dashboard'; q?: string; project?: string; page?: string }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  const per = 25;
  const pg = Math.max(1, Number(page) || 1);
  const projects = await db.project.findMany({ where: projectScope(p), orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const where = {
    AND: [{ companyId: p.companyId, kind }, p.projectIds ? { projectId: { in: p.projectIds } } : {}, project ? { projectId: Number(project) } : {}, q ? { OR: [{ title: containsText(q) }, { subtitle: containsText(q) }] } : {}],
  };
  const [items, total, baseUrl] = await Promise.all([db.report.findMany({ where, include: { project: { select: { name: true, dateFormat: true, logo: true } } }, orderBy: { createdAt: 'desc' }, skip: (pg - 1) * per, take: per }), db.report.count({ where }), requestBaseUrl()]);
  const base = kind === 'report' ? '/reports' : '/dashboards';
  const qs = (n: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(project ? { project } : {}), page: String(n) })}`;
  const rows: ReportRow[] = items.map((r) => ({
    id: r.id,
    kind,
    title: r.title,
    project: r.project.name,
    logo: r.project.logo,
    start: r.startDate,
    end: r.endDate,
    comparisonStart: r.comparisonStart,
    comparisonEnd: r.comparisonEnd,
    preset: r.preset,
    views: r.views,
    created: r.createdAt.toISOString().slice(0, 10),
    share: r.shareEnabled ? `${baseUrl}/${kind === 'report' ? 'r' : 'd'}/${r.shareToken}` : null,
    dateFormat: r.project.dateFormat,
  }));
  return (
    <AppShell active={base}>
      <PageHeader
        title={kind === 'report' ? (total === 1 ? t('reports.countReport') : t('reports.countReports', { count: total })) : total === 1 ? t('reports.countDashboard') : t('reports.countDashboards', { count: total })}
        subtitle={kind === 'report' ? t('reports.snapshotsHint') : t('reports.liveHint')}
        actions={
          canWrite(p) && (
            <Link href={`/reports/new?kind=${kind}`} className="btn-primary">
              <Plus size={14} /> {kind === 'report' ? t('reports.newReport') : t('reports.newDashboard')}
            </Link>
          )
        }
      />
      <form className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder={t('reports.searchTitle')} className="input w-64" aria-label={t('common.search')} />
        <select name="project" defaultValue={project ?? ''} className="input w-56" aria-label={t('overview.client')}>
          <option value="">{t('reports.allClients')}</option>
          {projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button className="btn">{t('common.filter')}</button>
      </form>
      {rows.length === 0 ? <Empty title={kind === 'report' ? t('reports.noneFoundReports') : t('reports.noneFoundDashboards')} hint={t('reports.noneHint')} /> : <ReportRows items={rows} base={base} />}
      {total > per && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="num text-ink-2">
            {(pg - 1) * per + 1}–{Math.min(pg * per, total)} of {total}
          </span>
          <div className="flex gap-2">
            {pg > 1 && (
              <Link href={qs(pg - 1)} className="btn">
                {t('common.previous')}
              </Link>
            )}
            {pg * per < total && (
              <Link href={qs(pg + 1)} className="btn">
                {t('common.next')}
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
