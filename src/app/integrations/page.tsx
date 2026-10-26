import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { PlatformIcon } from '@/components/platform-icon';
import { AppShell, PageHeader } from '@/components/shell';
import { requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS, type Category } from '@/lib/catalog/integrations';
import { getCatalog } from '@/lib/catalog/build';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const rows = await db.integration.groupBy({ by: ['slug', 'status'], where: { companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, _count: true });
  const count = (slug: string) => rows.filter((r) => r.slug === slug && r.status === 'active').reduce((a, r) => a + r._count, 0);
  const live = INTEGRATIONS.filter((i) => i.connector !== 'demo').length;
  const extra = INTEGRATIONS.filter((i) => !i.inReportei).length;
  return (
    <AppShell active="/integrations">
      <PageHeader title={t('nav.integrations')} subtitle={`${INTEGRATIONS.length} platforms · ${live} with live connectors · ${extra} beyond Reportei’s catalog. Connect accounts from a project.`} />
      <div className="space-y-6">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
          <section key={c}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{CATEGORY_LABEL[c]}</h2>
            <div className="card overflow-hidden">
              <table className="w-full">
                <tbody className="divide-y divide-[var(--line)]">
                  {INTEGRATIONS.filter((i) => i.category === c).map((i) => (
                    <tr key={i.slug}>
                      <td className="td w-64">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <PlatformIcon slug={i.slug} size={16} />
                          {i.name}
                        </span>
                      </td>
                      <td className="td font-mono text-xs text-slate-400">{i.slug}</td>
                      <td className="td">
                        {i.connector !== 'demo' ? <span className="badge bg-emerald-50 text-emerald-700">{t('integrations.liveWith', { connector: i.connector })}</span> : <span className="badge bg-slate-100 text-slate-500">{t('integrations.demoData')}</span>}{' '}
                        {!i.inReportei && <span className="badge bg-indigo-50 text-indigo-600">{t('integrations.extra')}</span>}
                      </td>
                      <td className="td text-xs text-slate-500">{i.archetype === 'custom' ? t('integrations.columnsAuto') : t('integrations.widgetsCount', { count: getCatalog(i.slug).length })}</td>
                      <td className="td text-right text-xs text-slate-500">{t('integrations.connectedCount', { count: count(i.slug) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        {t('integrations.needConnect')} <Link href="/projects" className="font-semibold text-brand">{t('integrations.openProject')}</Link> {t('integrations.connectPath')}
      </p>
    </AppShell>
  );
}
