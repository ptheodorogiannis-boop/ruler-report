import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { ActionForm } from '@/components/action-form';
import { createProjectAction } from '@/app/actions/app';
import { canWrite, projectScope, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { ClientMark } from '@/components/client-mark';
import { PlatformIcon } from '@/components/platform-icon';
import { getIntegrationDef } from '@/lib/catalog/integrations';

export const dynamic = 'force-dynamic';

const TZ = ['UTC', 'Europe/Athens', 'Europe/London', 'Europe/Berlin', 'Europe/Stockholm', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  const { q } = await searchParams;
  const projects = await db.project.findMany({
    where: { ...projectScope(p), ...(q ? { name: { contains: q } } : {}) },
    include: { integrations: { select: { slug: true, status: true } }, _count: { select: { reports: true } } },
    orderBy: { name: 'asc' },
  });

  return (
    <AppShell active="/projects">
      <PageHeader title={t('nav.projects')} subtitle={t('projects.subtitle')} actions={
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder={t('projects.searchPlaceholder')} className="input w-56" />
          <button className="btn">{t('common.search')}</button>
        </form>
      } />

      {canWrite(p) && (
        <details className="card mb-5 p-4" open={projects.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">{t('projects.new')}</summary>
          <ActionForm action={createProjectAction} submit={t('projects.create')} className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="label">{t('projects.clientName')}</label>
              <input name="name" className="input" required placeholder="Acme Running Co" />
            </div>
            <div>
              <label className="label">{t('projects.timezone')}</label>
              <select name="timezone" className="input" defaultValue="Europe/Athens">
                {TZ.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('projects.currency')}</label>
              <input name="currency" className="input" defaultValue="EUR" maxLength={3} />
            </div>
            <div>
              <label className="label">{t('projects.numberFormat')}</label>
              <select name="decimal" className="input">
                <option value="comma_dot">1,234.56</option>
                <option value="dot_comma">1.234,56</option>
              </select>
            </div>
          </ActionForm>
        </details>
      )}

      {projects.length === 0 ? (
        <Empty title={t('projects.noneFound')} hint={t('projects.noneHint')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((pr) => {
            const active = pr.integrations.filter((i) => i.status === 'active');
            const uniq = [...new Set(active.map((i) => i.slug))];
            return (
              <Link key={pr.id} href={`/projects/${pr.id}`} className="card block p-4 transition hover:border-brand hover:shadow-md">
                <div className="flex items-center gap-3">
                  <ClientMark name={pr.name} logo={pr.logo} size={40} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{pr.name}</div>
                    <div className="text-xs text-slate-500">
                      {pr.timezone} · {pr.currency}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {uniq.slice(0, 10).map((s) => (
                    <span key={s} title={getIntegrationDef(s)?.name} className="inline-flex">
                      <PlatformIcon slug={s} size={16} />
                    </span>
                  ))}
                  {uniq.length === 0 && <span className="text-xs text-slate-400">{t('projects.noIntegrations')}</span>}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span>{t('projects.integrationsCount', { count: active.length })}</span>
                  <span>{t('projects.reportsCount', { count: pr._count.reports })}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
