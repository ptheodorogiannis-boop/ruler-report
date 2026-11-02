// Settings → System: what the one-click Google / Meta sign-in needs, set once by an admin. Shows what is set, the
// exact environment variables and the redirect URIs to paste into Google Cloud and the Meta app.
import { CopyButton } from '@/components/action-form';
import { getT } from '@/lib/i18n/server';
import { adsTokenConfigured, providerConfigured } from '@/lib/oauth/providers';
import { requestBaseUrl } from '@/lib/share';

export async function SignInSetup() {
  const { t } = await getT();
  const base = (process.env.APP_URL || (await requestBaseUrl())).replace(/\/$/, '');
  const rows = [
    { id: 'google', title: t('settings.signinGoogle'), hint: t('settings.signinGoogleHint'), ready: providerConfigured('google'), vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], redirect: `${base}/api/oauth/google/callback` },
    { id: 'ads', title: t('settings.signinAds'), hint: t('settings.signinAdsHint'), ready: adsTokenConfigured(), vars: ['GOOGLE_ADS_DEVELOPER_TOKEN'], redirect: null },
    { id: 'meta', title: t('settings.signinMeta'), hint: t('settings.signinMetaHint'), ready: providerConfigured('meta'), vars: ['META_APP_ID', 'META_APP_SECRET'], redirect: `${base}/api/oauth/meta/callback` },
  ];
  return (
    <section className="card p-6 md:col-span-2" aria-labelledby="signin-setup" data-signin-setup>
      <h2 id="signin-setup" className="display text-lg font-semibold leading-6">
        {t('settings.signinTitle')}
      </h2>
      <p className="mt-1.5 max-w-[64ch] text-sm leading-6 text-ink-2">{t('settings.signinLead')}</p>
      <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" data-setup-row={r.id} data-ready={r.ready ? '1' : '0'}>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5">{r.title}</h3>
              <p className={`mt-0.5 text-sm leading-5 ${r.ready ? 'font-medium text-ink' : 'text-ink-3'}`}>{r.ready ? t('settings.signinReady') : t('settings.signinMissing')}</p>
              <p className="mt-2 text-xs leading-5 text-ink-3">{r.hint}</p>
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <p className="text-ink-2">
                {t('settings.signinVars')}{' '}
                {r.vars.map((v, i) => (
                  <span key={v}>
                    {i > 0 && ', '}
                    <code className="rounded bg-[var(--paper)] px-1.5 py-0.5 text-xs">{v}</code>
                  </span>
                ))}
              </p>
              {r.redirect && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-2">{t('settings.signinRedirect')}</span>
                  <code className="min-w-0 break-all rounded bg-[var(--paper)] px-1.5 py-0.5 text-xs">{r.redirect}</code>
                  <CopyButton text={r.redirect} label={t('common.copy')} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-5 text-ink-3">{t('settings.signinGuide')}</p>
    </section>
  );
}
