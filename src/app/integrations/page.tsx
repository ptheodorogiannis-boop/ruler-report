import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { PlatformTile } from '@/components/platform-tile';
import { AppShell, PageHeader } from '@/components/shell';
import { requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS, type Category } from '@/lib/catalog/integrations';
import { getCatalog } from '@/lib/catalog/build';
import { db } from '@/lib/db';
import { ListFilter } from '@/components/list-filter';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const rows = await db.integration.groupBy({ by: ['slug', 'status'], where: { companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, _count: true });
  const count = (slug: string) => rows.filter((r) => r.slug === slug && r.status === 'active').reduce((a, r) => a + r._count, 0);
  const live = INTEGRATIONS.filter((i) => i.connector !== 'demo').length;
  return (
    <AppShell active="/integrations">
      <PageHeader title={t('nav.integrations')} subtitle={t('integrations.subtitle', { count: INTEGRATIONS.length, live })} />
      <ListFilter label={t('connect.searchIntegrations')} placeholder={t('connect.searchIntegrations')} countLabel={t('common.shownOf')} emptyLabel={t('common.noMatches')}>
      <div className="space-y-8">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
          <section key={c} data-search-group>
            <h2 className="mb-3 text-sm font-semibold text-ink-2">{t(`integrations.cat_${c}`)}</h2>
            <div className="card overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[28%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <tbody className="divide-y divide-[var(--line)]">
                  {INTEGRATIONS.filter((i) => i.category === c).map((i) => (
                    <tr key={i.slug} data-search={`${i.name} ${i.slug}`}>
                      <td className="td">
                        <span className="inline-flex min-w-0 items-center gap-2.5 font-medium" title={i.slug}>
                          <PlatformTile slug={i.slug} size="sm" />
                          <span className="truncate">{i.name}</span>
                        </span>
                      </td>
                      <td className={`td text-xs ${i.connector !== 'demo' ? 'font-medium text-ink' : 'text-ink-3'}`}>{i.connector !== 'demo' ? t('connect.liveData') : t('connect.sampleData')}</td>
                      <td className="td num text-xs text-ink-2">{i.archetype === 'custom' ? t('integrations.columnsAuto') : t('integrations.widgetsCount', { count: getCatalog(i.slug).length })}</td>
                      <td className="td num text-right text-xs text-ink-2">{t('integrations.connectedCount', { count: count(i.slug) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      </ListFilter>
      <p className="mt-8 text-sm text-ink-2">
        {t('integrations.needConnect')}{' '}
        <Link href="/projects" className="link font-medium text-ink">
          {t('integrations.openProject')}
        </Link>{' '}
        {t('integrations.connectPath')}
      </p>
    </AppShell>
  );
}
