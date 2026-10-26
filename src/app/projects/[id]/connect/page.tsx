import Link from 'next/link';
import { PlatformIcon } from '@/components/platform-icon';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { assertProject, requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS, type Category } from '@/lib/catalog/integrations';
import { getT } from '@/lib/i18n/server';

export default async function ConnectCatalog({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const p = await requirePrincipal();
  const { t } = await getT();
  const { id } = await params;
  const { q } = await searchParams;
  const project = await assertProject(p, Number(id)).catch(() => null);
  if (!project) notFound();
  const list = INTEGRATIONS.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.slug.includes(q.toLowerCase()));
  const cats = Object.keys(CATEGORY_LABEL) as Category[];
  return (
    <AppShell active="/projects">
      <PageHeader
        title={t('connect.title', { name: project.name })}
        subtitle={t('connect.subtitle', { count: INTEGRATIONS.length })}
        actions={
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder={t('connect.searchPlaceholder')} className="input w-56" />
            <button className="btn">{t('connect.search')}</button>
          </form>
        }
      />
      <div className="space-y-6">
        {cats.map((c) => {
          const items = list.filter((i) => i.category === c);
          if (!items.length) return null;
          return (
            <section key={c}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{CATEGORY_LABEL[c]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((i) => (
                  <Link key={i.slug} href={`/projects/${project.id}/connect/${i.slug}`} className="card flex items-center gap-3 p-3 transition hover:border-brand hover:shadow-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: i.color }}>
                      <PlatformIcon slug={i.slug} size={20} tone="white" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{i.name}</span>
                      <span className="flex gap-1 text-[11px] font-semibold">
                        {i.connector !== 'demo' ? <span className="rounded bg-emerald-50 px-1 text-emerald-700">{t('connect.live')}</span> : <span className="rounded bg-slate-100 px-1 text-slate-500">{t('connect.demoData')}</span>}
                        {!i.inReportei && <span className="rounded bg-indigo-50 px-1 text-indigo-600">{t('connect.extra')}</span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
