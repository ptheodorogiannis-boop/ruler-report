import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { ActionForm } from '@/components/action-form';
import { connectIntegrationAction } from '@/app/actions/app';
import { assertProject, canWrite, requirePrincipal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { getCatalog } from '@/lib/catalog/build';
import { db } from '@/lib/db';
import { PROVIDER_NAME, oauthAvailable } from '@/lib/oauth/providers';
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
  facebook_ads: 'Use “Continue with Meta” (when configured) to pick ad accounts, or paste a System User token with ads_read. Reach is fetched as a true period total.',
  google_analytics_4: 'Use “Continue with Google” (when GOOGLE_CLIENT_ID/SECRET are set) to pick properties, or paste a refresh token (needs those env vars) / a short-lived access token for testing.',
  search_console: 'Same Google credentials as GA4. The site URL must match the Search Console property (https://example.com/ or sc-domain:example.com).',
  woo_commerce: 'Create REST API keys in WooCommerce → Settings → Advanced → REST API (read access). HTTPS required.',
};

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
  const provider = oauthAvailable(slug);
  const metricCount = custom ? null : getCatalog(slug).length;
  return (
    <AppShell active="/projects">
      <PageHeader title={existing ? t('connect.reconnectTitle', { name: existing.name }) : t('connect.connectTitle', { name: def.name })} subtitle={<>{t('connect.to')} <Link href={`/projects/${project.id}`} className="font-semibold text-brand">{project.name}</Link></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          {oauth_error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{oauth_error}</div>}
          {existing && (
            <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-reconnect>
              {t('connect.reconnecting', { name: existing.name, id: existing.sourceId })}
            </div>
          )}
          {provider && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <a href={`/api/oauth/${provider}/start?projectId=${project.id}&slug=${slug}${existing ? `&reconnect=${existing.id}` : ''}`} className="btn-primary inline-flex">
                {t('connect.continueWith', { provider: PROVIDER_NAME[provider] })}
              </a>
              <div className="mt-2 text-xs text-slate-500">{t('connect.oauthHint')}</div>
            </div>
          )}
          <ActionForm action={connectIntegrationAction} submit={live ? t('connect.testConnect') : t('connect.connect')} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="slug" value={slug} />
            {existing && <input type="hidden" name="replaceId" value={existing.id} />}
            <div>
              <label className="label">{def.sourceIdLabel ?? t('connect.accountId')}</label>
              <input name="sourceId" className="input" placeholder={def.sourceIdLabel} required={def.auth !== 'none' && !(!live)} defaultValue={existing?.sourceId ?? ''} readOnly={!!existing} />
            </div>
            <div>
              <label className="label">{t('connect.displayName')}</label>
              <input name="name" className="input" placeholder={`${project.name} – ${def.name}`} />
            </div>
            {(def.fields ?? []).map((f) => (
              <div key={f.name}>
                <label className="label">{f.label}</label>
                <input name={`cred_${f.name}`} type={f.secret ? 'password' : 'text'} className="input" autoComplete="off" />
                {f.help && <div className="mt-1 text-xs text-slate-400">{f.help}</div>}
              </div>
            ))}
            {def.auth === 'oauth_google' && (
              <div>
                <label className="label">{t('connect.googleToken')}</label>
                <input name="cred_refreshToken" type="password" className="input" autoComplete="off" />
                <div className="mt-1 text-xs text-slate-400">{t('connect.googleTokenHint')}</div>
              </div>
            )}
            {(slug === 'csv_url' || slug === 'rest_api' || slug === 'google_sheets') && (
              <div>
                <label className="label">{t('connect.headers')}</label>
                <input name="headers" className="input font-mono text-xs" placeholder='{"Authorization":"Bearer …"}' />
              </div>
            )}
            {!custom && (
              <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                <input type="checkbox" name="demo" className="mt-0.5" defaultChecked={!live} />
                <span>
                  <strong>{t('connect.useDemo')}</strong>
                  <span className="block text-xs text-slate-500">{t('connect.useDemoHint', { suffix: live ? '' : t('connect.noLiveSuffix') })}</span>
                </span>
              </label>
            )}
          </ActionForm>
        </div>
        <div className="space-y-3">
          <div className="card p-4 text-sm">
            <div className="mb-1 font-semibold">{t('connect.about')}</div>
            <div className="text-slate-600">{HELP[slug] ?? (live ? t('connect.liveConnector') : t('connect.noLiveConnector'))}</div>
            {metricCount != null && <div className="mt-2 text-xs text-slate-500">{t('connect.metricsAvailable', { count: metricCount })}</div>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
