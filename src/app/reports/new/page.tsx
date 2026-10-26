import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { ReportBuilder } from '@/components/report-builder';
import { canWrite, projectScope, requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, getIntegrationDef, isAdsSlug } from '@/lib/catalog/integrations';
import { campaignScopeOf } from '@/lib/engine/campaigns';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NewReport({ searchParams }: { searchParams: Promise<{ project?: string; kind?: string }> }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  if (!canWrite(p)) notFound();
  const sp = await searchParams;
  const kind = sp.kind === 'dashboard' ? 'dashboard' : 'report';
  const projects = await db.project.findMany({ where: projectScope(p), orderBy: { name: 'asc' } });
  const project = sp.project ? projects.find((x) => x.id === Number(sp.project)) : undefined;

  if (!project) {
    return (
      <AppShell active={kind === 'report' ? '/reports' : '/dashboards'}>
        <PageHeader title={`New ${kind}`} subtitle={t('wizard.pickClient')} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((x) => (
            <Link key={x.id} href={`/reports/new?project=${x.id}&kind=${kind}`} className="card p-4 font-semibold transition hover:border-brand">
              {x.name}
            </Link>
          ))}
        </div>
      </AppShell>
    );
  }
  const [templates, integrations] = await Promise.all([
    db.template.findMany({ where: { kind, OR: [{ companyId: null }, { companyId: p.companyId }] }, orderBy: [{ isDefault: 'desc' }, { title: 'asc' }] }),
    db.integration.findMany({ where: { projectId: project.id, status: 'active' }, orderBy: [{ slug: 'asc' }] }),
  ]);
  return (
    <AppShell active={kind === 'report' ? '/reports' : '/dashboards'}>
      <PageHeader title={`New ${kind} for ${project.name}`} subtitle={kind === 'report' ? t('wizard.reportExplainer') : t('wizard.dashboardExplainer')} />
      <ReportBuilder
        project={{ id: project.id, name: project.name, timezone: project.timezone }}
        templates={templates.map((t) => ({ id: t.id, title: t.title, description: t.description, isDefault: t.isDefault }))}
        integrations={integrations.map((i) => {
          const def = getIntegrationDef(i.slug);
          return { id: i.id, label: i.name, platform: def?.name ?? i.slug, slug: i.slug, color: def?.color ?? '#94a3b8', category: def ? CATEGORY_LABEL[def.category] : 'Other', isAds: isAdsSlug(i.slug), campaigns: campaignScopeOf(i) };
        })}
        kind={kind}
      />
    </AppShell>
  );
}
