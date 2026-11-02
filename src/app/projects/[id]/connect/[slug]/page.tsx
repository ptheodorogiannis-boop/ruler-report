import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { ActionForm } from '@/components/action-form';
import { PlatformTile } from '@/components/platform-tile';
import { connectIntegrationAction } from '@/app/actions/app';
import { assertProject, canAdmin, canWrite, requirePrincipal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { getCatalog } from '@/lib/catalog/build';
import { db } from '@/lib/db';
import { OAUTH_SLUGS, PROVIDER_NAME, PROVIDER_SLUGS, adsTokenConfigured, oauthAvailable, providerConfigured } from '@/lib/oauth/providers';
import { getT } from '@/lib/i18n/server';

const HELP: Record<string, string> = {
  google_sheets: 'Share the sheet as “Anyone with the link can view”, then paste spreadsheetId|||gid|||tab name (the ids are in the sheet URL). Columns are detected automatically: one date column, numeric columns become metrics, text columns become breakdowns.',
  csv_url: 'Any public (or header-authenticated) CSV/TSV URL. Columns are auto-detected.',
  rest_api: 'A URL returning a JSON array of objects (or {data:[…]}). Add auth headers below if needed.',
  webhook_ingest: 'Creates an endpoint you can push rows to: POST /api/v2/ingest/{integration id} with {"rows":[{"date":"2026-10-01","leads":3}]} using an API token. Perfect for Make/Zapier/n8n scenarios, call trackers and CRM exports.',
  make: 'Push rows from Make scenarios with the HTTP module (see the Push API in /api-docs).',
  n8n: 'Push rows from n8n with the HTTP Request node (see the Push API in /api-docs).',
  zapier: 'Push rows from Zapier with Webhooks by Zapier (see the Push API in /api-docs).',
  pluga: 'Push rows from Pluga with a webhook action (see the Push API in /api-docs).',
  woo_commerce: 'Create REST API keys in WooCommerce → Settings → Advanced → REST API (read access). HTTPS required.',
};

/** sign-in networks explain themselves in the reader's language */
const HELP_KEY: Record<string, string> = { facebook_ads: 'connect.helpMetaAds', facebook: 'connect.helpFacebook', instagram_business: 'connect.helpInstagram', google_adwords: 'connect.helpGoogleAds', google_analytics_4: 'connect.helpGa4', search_console: 'connect.helpGsc', youtube: 'connect.helpYoutube', google_my_business: 'connect.helpGbp' };

const fieldLabel = 'mb-1.5 block text-sm font-medium leading-5 text-ink';

export default async function ConnectForm({ params, searchParams }: { params: Promise<{ id: string; slug: string }>; searchParams: Promise<{ oauth_error?: string; reconnect?: string }> }) {
  const p = await requirePrincipal();
  const { t } = await getT();
  const { id, slug } = await params;
  const { oauth_error, reconnect } = await searchParams;
  const project = await assertProject(p, Number(id)).catch(() => null);
  const def = getIntegrationDef(slug);
  if (!project || !def) notFound();
  if (!canWrite(p)) notFound();
  // reconnect (spec v3 §1.2): the same row keeps its id, reports and automations; only the credentials change
  const existing = Number(reconnect) ? await db.integration.findFirst({ where: { id: Number(reconnect), projectId: project.id, slug } }) : null;
  const live = def.connector !== 'demo';
  const custom = def.archetype === 'custom';
  const oauthSlug = OAUTH_SLUGS[slug];
  const provider = oauthAvailable(slug);
  const providerName = oauthSlug ? PROVIDER_NAME[oauthSlug.provider] : '';
  const metricCount = custom ? null : getCatalog(slug).length;
  // Google/Meta networks: sign-in is the way in; the token form is the fallback behind a disclosure
  const signInFirst = !!oauthSlug;
  const others = oauthSlug ? PROVIDER_SLUGS[oauthSlug.provider].filter((s) => s !== slug && oauthAvailable(s)).map((s) => getIntegrationDef(s)!.name) : [];

  const manualForm = (
    <ActionForm action={connectIntegrationAction} submit={live ? t('connect.testConnect') : t('connect.connect')} className="space-y-4">
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="slug" value={slug} />
      {existing && <input type="hidden" name="replaceId" value={existing.id} />}
      <div>
        <label className={fieldLabel} htmlFor="f-source">
          {def.sourceIdLabel ?? t('connect.accountId')}
        </label>
        <input id="f-source" name="sourceId" className="input" placeholder={def.sourceIdLabel} required={def.auth !== 'none' && live} defaultValue={existing?.sourceId ?? ''} readOnly={!!existing} />
      </div>
      <div>
        <label className={fieldLabel} htmlFor="f-name">
          {t('connect.displayName')}
        </label>
        <input id="f-name" name="name" className="input" placeholder={`${project.name} – ${def.name}`} />
      </div>
      {(def.fields ?? []).map((f) => (
        <div key={f.name}>
          <label className={fieldLabel} htmlFor={`f-${f.name}`}>
            {f.label}
          </label>
          <input id={`f-${f.name}`} name={`cred_${f.name}`} type={f.secret ? 'password' : 'text'} className="input" autoComplete="off" />
          {f.help && <p className="mt-1.5 text-xs leading-4 text-ink-3">{f.help}</p>}
        </div>
      ))}
      {def.auth === 'oauth_google' && (
        <div>
          <label className={fieldLabel} htmlFor="f-token">
            {t('connect.googleToken')}
          </label>
          <input id="f-token" name="cred_refreshToken" type="password" className="input" autoComplete="off" />
          <p className="mt-1.5 text-xs leading-4 text-ink-3">{t('connect.googleTokenHint')}</p>
        </div>
      )}
      {(slug === 'csv_url' || slug === 'rest_api' || slug === 'google_sheets') && (
        <div>
          <label className={fieldLabel} htmlFor="f-headers">
            {t('connect.headers')}
          </label>
          <input id="f-headers" name="headers" className="input font-mono text-xs" placeholder='{"Authorization":"Bearer …"}' />
        </div>
      )}
      {!custom && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="demo" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" defaultChecked={!live} />
          <span>
            <span className="font-medium">{t('connect.useDemo')}</span>
            <span className="mt-0.5 block text-xs leading-4 text-ink-3">{t('connect.useDemoHint', { suffix: live ? '' : t('connect.noLiveSuffix') })}</span>
          </span>
        </label>
      )}
    </ActionForm>
  );

  return (
    <AppShell active="/projects">
      <PageHeader title={existing ? t('connect.reconnectTitle', { name: existing.name }) : t('connect.connectTitle', { name: def.name })} subtitle={<>{t('connect.to')} <Link href={`/projects/${project.id}`} className="link font-medium text-ink">{project.name}</Link></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          {oauth_error && (
            <p role="alert" className="mb-5 border-l-2 border-[var(--down)] pl-3 text-sm leading-6 text-[var(--down)]">
              {oauth_error}
            </p>
          )}
          {existing && (
            <p className="mb-5 border-l-2 border-[var(--line-strong)] pl-3 text-sm leading-6 text-ink-2" data-reconnect>
              {t('connect.reconnecting', { name: existing.name, id: existing.sourceId })}
            </p>
          )}

          {signInFirst ? (
            <>
              <div className="flex items-start gap-4" data-signin={provider ? 'ready' : 'off'}>
                <PlatformTile slug={slug} size="lg" />
                <div className="min-w-0">
                  {provider ? (
                    <>
                      <p className="max-w-[56ch] text-sm leading-6 text-ink-2">
                        {existing ? t('connect.reconnectHint', { provider: providerName }) : others.length ? t('connect.bundleHint', { provider: providerName, others: others.join(', ') }) : t('connect.signInHint', { provider: providerName })}
                      </p>
                      <a
                        href={existing ? `/api/oauth/${provider}/start?projectId=${project.id}&slug=${slug}&reconnect=${existing.id}` : `/api/oauth/${provider}/start?projectId=${project.id}&slug=${slug}&bundle=1`}
                        className="btn-primary mt-4"
                      >
                        {t('connect.continueWith', { provider: providerName })}
                      </a>
                    </>
                  ) : (
                    <>
                      <p className="text-[15px] font-medium leading-6">{slug === 'google_adwords' && providerConfigured('google') && !adsTokenConfigured() ? t('connect.adsNeedsToken') : t('connect.notSetUp', { provider: providerName })}</p>
                      <p className="mt-1 max-w-[56ch] text-sm leading-6 text-ink-2">
                        {canAdmin(p) ? (
                          <>
                            {t('connect.notSetUpAdmin')}{' '}
                            <Link href="/settings?tab=system" className="link font-medium text-ink">
                              {t('connect.setItUp')}
                            </Link>
                          </>
                        ) : (
                          t('connect.askAdmin')
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <details className="group mt-6 border-t border-[var(--line)] pt-4" open={!!existing && !provider}>
                <summary className="cursor-pointer select-none text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]">{t('connect.manualToggle')}</summary>
                <div className="mt-4">{manualForm}</div>
              </details>
            </>
          ) : (
            manualForm
          )}
        </div>
        <aside className="space-y-3">
          <div className="card p-5 text-sm">
            <h2 className="mb-1.5 font-semibold">{t('connect.about')}</h2>
            <p className="leading-6 text-ink-2">{HELP_KEY[slug] ? t(HELP_KEY[slug]) : HELP[slug] ?? (live ? t('connect.liveConnector') : t('connect.noLiveConnector'))}</p>
            {metricCount != null && <p className="num mt-3 text-xs text-ink-3">{t('connect.metricsAvailable', { count: metricCount })}</p>}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
