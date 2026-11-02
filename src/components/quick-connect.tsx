// "Connect with Google" / "Connect with Meta": one sign-in per provider, then the accounts-found picker lists every
// network it reaches. When the server has no OAuth app for a provider the tile says so plainly and sends admins to
// Settings → System, where the redirect URIs and the setup steps are.
import Link from 'next/link';
import { PlatformTile } from '@/components/platform-tile';
import { getT } from '@/lib/i18n/server';
import { PROVIDER_NAME, PROVIDER_SLUGS, adsTokenConfigured, oauthAvailable, providerConfigured } from '@/lib/oauth/providers';
import type { Provider } from '@/lib/oauth/state';

export async function QuickConnect({ projectId, admin, entry }: { projectId: number; admin: boolean; entry?: string }) {
  const { t } = await getT();
  const tiles: { provider: Provider; covers: string }[] = [
    { provider: 'google', covers: t('connect.googleCovers') },
    { provider: 'meta', covers: t('connect.metaCovers') },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-quick-connect>
      {tiles.map(({ provider, covers }) => {
        const name = PROVIDER_NAME[provider];
        const ready = providerConfigured(provider);
        return (
          <section key={provider} className="card flex flex-col p-5" aria-labelledby={`qc-${provider}`} data-provider={provider} data-ready={ready ? '1' : '0'}>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {PROVIDER_SLUGS[provider].map((slug) => (
                <PlatformTile key={slug} slug={slug} size="sm" dim={ready && !oauthAvailable(slug)} />
              ))}
            </div>
            <h2 id={`qc-${provider}`} className="display mt-4 text-lg font-semibold leading-6">
              {t('connect.withProvider', { provider: name })}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-2">{covers}</p>
            <div className="mt-auto pt-5">
              {ready ? (
                <>
                  <a href={`/api/oauth/${provider}/start?projectId=${projectId}&bundle=1${entry && PROVIDER_SLUGS[provider].includes(entry) ? `&slug=${entry}` : ''}`} className="btn-primary">
                    {t('connect.continueWith', { provider: name })}
                  </a>
                  {provider === 'google' && !adsTokenConfigured() && <p className="mt-3 text-xs leading-4 text-ink-3">{t('connect.adsNeedsToken')}</p>}
                </>
              ) : (
                <p className="text-sm leading-6 text-ink-2">
                  {t('connect.notSetUp', { provider: name })}{' '}
                  {admin ? (
                    <Link href="/settings?tab=system" className="link font-medium text-ink">
                      {t('connect.setItUp')}
                    </Link>
                  ) : (
                    t('connect.askAdmin')
                  )}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
