import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { ActionForm } from '@/components/action-form';
import { cancelOAuthAction, finishOAuthAction } from '@/app/actions/oauth';
import { assertProject, canWrite, requirePrincipal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { db } from '@/lib/db';
import { pendingMatches } from '@/lib/oauth/flow';
import { PENDING_COOKIE, openPending } from '@/lib/oauth/pending';
import { OAUTH_SLUGS, PROVIDER_NAME, listAccounts, type AccountOption } from '@/lib/oauth/providers';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function PickAccounts({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const p = await requirePrincipal();
  const { t } = await getT();
  const { id, slug } = await params;
  const project = await assertProject(p, Number(id)).catch(() => null);
  const def = getIntegrationDef(slug);
  const oauth = OAUTH_SLUGS[slug];
  if (!project || !def || !oauth || !canWrite(p)) notFound();

  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value);
  const valid = pendingMatches(pending, p, project.id, slug);
  let options: AccountOption[] = [];
  let error: string | null = null;
  if (valid) {
    try {
      options = await listAccounts(slug, pending.credentials);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const existing = new Set((await db.integration.findMany({ where: { projectId: project.id, slug }, select: { sourceId: true } })).map((i) => i.sourceId));
  const provider = PROVIDER_NAME[oauth.provider];

  return (
    <AppShell active="/projects">
      <PageHeader title={t('connect.choose', { noun: oauth.noun })} subtitle={<>{t('connect.toConnectTo')} <Link href={`/projects/${project.id}`} className="font-semibold text-brand">{project.name}</Link> — {t('connect.onePerAccount', { platform: def.name })}</>} />
      <div className="card max-w-3xl p-5">
        {!valid ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{t('connect.expired', { provider })}</div>
            <Link href={`/projects/${project.id}/connect/${slug}`} className="btn-primary inline-flex">{t('connect.backTo', { name: def.name })}</Link>
          </div>
        ) : (
          <>
            <div className="mb-3 text-sm text-slate-600">
              {t('connect.signedInWith', { provider })}
              {pending.account ? <> {t('connect.as')} <strong>{pending.account}</strong></> : null}. {t('connect.onlyAccessible')}
            </div>
            {pending.integrationId && (
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-reconnect>
                {t('connect.reconnectPick')}
              </div>
            )}
            {def.connector === 'demo' && (
              <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {t('connect.demoNote', { name: def.name })}
              </div>
            )}
            {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t('connect.couldNotList', { noun: oauth.noun, error })}</div>}
            {!error && options.length === 0 && <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{t('connect.noAccessible', { noun: oauth.noun, provider })}</div>}
            <ActionForm
              action={finishOAuthAction}
              submit={t('connect.connectSelected')}
              secondary={
                <button formAction={cancelOAuthAction} className="btn" formNoValidate>
                  {t('connect.cancel')}
                </button>
              }
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="slug" value={slug} />
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {options.map((o) => (
                  <li key={o.key}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                      <input type="checkbox" name="pick" value={o.key} className="mt-1" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{o.name}</span>
                        {o.detail && <span className="block truncate text-xs text-slate-500">{o.detail}</span>}
                        {existing.has(o.sourceId) && <span className="text-[11px] font-semibold text-amber-700">{t('connect.alreadyConnected')}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </ActionForm>
          </>
        )}
      </div>
    </AppShell>
  );
}
