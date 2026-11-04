'use client';
// Connecting Matomo (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): the Matomo address and an
// API token, "Load sites", tick the sites, Connect. Each site becomes its own integration; the token is stored encrypted on
// each one. A wrong address or token shows Matomo's own message and connects nothing.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { connectMatomoAction, listMatomoSitesAction } from '@/app/actions/app';
import { useT } from '@/components/i18n-provider';
import { ListFilter } from '@/components/list-filter';

type Site = { id: string; name: string; url: string; inProject: boolean };
const fieldLabel = 'mb-1.5 block text-sm font-medium leading-5 text-ink';

export function MatomoConnect({ projectId }: { projectId: number }) {
  const t = useT();
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState('');
  const [tokenAuth, setTokenAuth] = useState('');
  const [sites, setSites] = useState<Site[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [connecting, startConnect] = useTransition();

  // the list belongs to the address and token it was loaded with
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setSites(null);
    setPicked(new Set());
  };
  const load = () =>
    startLoad(async () => {
      setError(null);
      const r = await listMatomoSitesAction({ projectId, baseUrl, tokenAuth });
      if (!r.ok) {
        setSites(null);
        setError(r.error);
        return;
      }
      setSites(r.sites);
      setPicked(new Set(r.sites.length === 1 ? [r.sites[0].id] : []));
    });
  const connect = () =>
    startConnect(async () => {
      setError(null);
      const r = await connectMatomoAction({ projectId, baseUrl, tokenAuth, siteIds: [...picked] });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/projects/${projectId}?tab=integrations&added=${r.created}&refreshed=${r.refreshed}&ids=${r.ids.join(',')}`);
    });
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div data-matomo-connect>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div>
          <label className={fieldLabel} htmlFor="m-address">
            {t('connect.matomoAddress')}
          </label>
          <input id="m-address" type="url" inputMode="url" className="input" autoComplete="off" spellCheck={false} placeholder="https://analytics.example.com" value={baseUrl} onChange={edit(setBaseUrl)} required />
          <p className="mt-1.5 text-xs leading-4 text-ink-3">{t('connect.matomoAddressHint')}</p>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="m-token">
            {t('connect.matomoToken')}
          </label>
          <input id="m-token" type="password" className="input" autoComplete="off" spellCheck={false} value={tokenAuth} onChange={edit(setTokenAuth)} required />
          <p className="mt-1.5 text-xs leading-4 text-ink-3">{t('connect.matomoTokenHint')}</p>
        </div>
        <button className={sites ? 'btn' : 'btn-primary'} disabled={loading}>
          {loading ? t('connect.loadingSites') : t('connect.loadSites')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 border-l-2 border-[var(--down)] pl-3 text-sm leading-6 text-[var(--down)]" data-matomo-error>
          {error}
        </p>
      )}

      {sites && (
        <div className="mt-6 border-t border-[var(--line)] pt-5" data-matomo-sites>
          <h2 className="mb-3 text-sm font-medium">{t('connect.matomoSites')}</h2>
          {sites.length === 0 ? (
            <p className="text-sm text-ink-2">{t('connect.noSites')}</p>
          ) : (
            <>
              <ListFilter label={t('connect.searchSites')} placeholder={t('connect.searchSites')} countLabel={t('common.shownOf')} emptyLabel={t('common.noMatches')}>
                <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                  {sites.map((s) => (
                    <li key={s.id} data-search={`${s.name} ${s.url} ${s.id}`}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--paper)]" data-matomo-site={s.id}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={picked.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                            {s.url && <span className="truncate">{s.url}</span>}
                            <span className="num">ID {s.id}</span>
                          </span>
                          {s.inProject && <span className="mt-1 block text-xs leading-4 text-ink-2">{t('connect.siteInProject')}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </ListFilter>
              <button type="button" className="btn-primary mt-4" disabled={!picked.size || connecting} onClick={connect}>
                {connecting ? t('connect.connecting') : t('connect.connectSites', { count: picked.size })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
