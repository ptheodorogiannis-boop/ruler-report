import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search } from 'lucide-react';
import { PlatformTile } from '@/components/platform-tile';
import { QuickConnect } from '@/components/quick-connect';
import { AppShell, PageHeader } from '@/components/shell';
import { assertProject, canAdmin, canWrite, requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS, type Category } from '@/lib/catalog/integrations';
import { getT } from '@/lib/i18n/server';

/**
 * Connect: the one-sign-in tiles first, then every platform. Live connectors are cards grouped by category; the
 * platforms that only produce sample data sit under one heading as compact rows, so "live" is the thing you see.
 */
export default async function ConnectCatalog({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; oauth_error?: string }> }) {
  const p = await requirePrincipal();
  const { t } = await getT();
  const { id } = await params;
  const { q, oauth_error } = await searchParams;
  const project = await assertProject(p, Number(id)).catch(() => null);
  if (!project) notFound();
  const needle = q?.trim().toLowerCase() ?? '';
  const list = INTEGRATIONS.filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.slug.includes(needle));
  const live = list.filter((i) => i.connector !== 'demo');
  const sample = list.filter((i) => i.connector === 'demo').sort((a, b) => a.name.localeCompare(b.name));
  const cats = Object.keys(CATEGORY_LABEL) as Category[];
  const href = (slug: string) => `/projects/${project.id}/connect/${slug}`;
  return (
    <AppShell active="/projects">
      <PageHeader title={t('connect.title', { name: project.name })} subtitle={t('connect.subtitleCounts', { count: INTEGRATIONS.length, live: INTEGRATIONS.filter((i) => i.connector !== 'demo').length })} />

      {oauth_error && (
        <p role="alert" className="mb-5 border-l-2 border-[var(--down)] pl-3 text-sm leading-6 text-[var(--down)]">
          {oauth_error}
        </p>
      )}

      {canWrite(p) && <QuickConnect projectId={project.id} admin={canAdmin(p)} />}

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <h2 className="display text-lg font-semibold leading-6">{t('connect.allIntegrations')}</h2>
        <form className="relative w-full sm:w-64" role="search">
          <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input name="q" type="search" defaultValue={q} placeholder={t('connect.searchIntegrations')} aria-label={t('connect.searchIntegrations')} className="input pl-9" />
        </form>
      </div>
      {list.length === 0 && <p className="mt-4 text-sm text-ink-2">{t('connect.noIntegrationMatch', { q: q ?? '' })}</p>}

      {live.length > 0 && (
        <section className="mt-6" aria-labelledby="live-data" data-live-integrations>
          <h3 id="live-data" className="text-[15px] font-semibold leading-5">
            {t('connect.liveTitle')}
          </h3>
          <div className="mt-4 space-y-6">
            {cats.map((c) => {
              const items = live.filter((i) => i.category === c);
              if (!items.length) return null;
              return (
                <div key={c}>
                  <h4 className="mb-2 text-sm text-ink-2">{t(`integrations.cat_${c}`)}</h4>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((i) => (
                      <li key={i.slug}>
                        <Link href={href(i.slug)} className="card flex h-full items-center gap-3 p-3 transition-colors hover:border-[var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                          <PlatformTile slug={i.slug} size="lg" />
                          <span className="min-w-0 truncate text-sm font-medium leading-5">{i.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sample.length > 0 && (
        <section className="mt-10" aria-labelledby="sample-data" data-sample-integrations>
          <h3 id="sample-data" className="text-[15px] font-semibold leading-5">
            {t('connect.sampleTitle')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-ink-2">{t('connect.sampleHint')}</p>
          <ul className="mt-3 grid gap-x-6 border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sample.map((i) => (
              <li key={i.slug} className="border-b border-[var(--line)]">
                <Link href={href(i.slug)} className="flex h-10 items-center gap-2.5 rounded-md px-1 text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                  <PlatformTile slug={i.slug} size="sm" />
                  <span className="truncate">{i.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
