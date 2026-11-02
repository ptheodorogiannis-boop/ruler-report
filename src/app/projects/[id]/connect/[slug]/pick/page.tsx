// Single-network picker. Since the one-consent flow, only Reconnect lands here (spec v3 §1.2): the user signs in
// again and picks the account that is already connected.
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
import { detailParts } from '@/lib/oauth/detail';
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
      <PageHeader title={t('connect.choose', { noun: oauth.noun })} subtitle={<>{t('connect.toConnectTo')} <Link href={`/projects/${project.id}`} className="link font-medium text-ink">{project.name}</Link></>} />
      <div className="card max-w-3xl p-6">
        {!valid ? (
          <div className="space-y-4 text-sm">
            <p className="text-ink-2">{t('connect.expired', { provider })}</p>
            <Link href={`/projects/${project.id}/connect/${slug}`} className="btn-primary">
              {t('connect.backTo', { name: def.name })}
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm leading-6 text-ink-2">
              {t('connect.signedInWith', { provider })}
              {pending.account ? <> {t('connect.as')} <span className="font-medium text-ink">{pending.account}</span></> : null}. {t('connect.onlyAccessible')}
            </p>
            {pending.integrationId && (
              <p className="mb-4 text-sm leading-6 text-ink" data-reconnect>
                {t('connect.reconnectPick')}
              </p>
            )}
            {error && (
              <p role="alert" className="mb-4 text-sm text-[var(--down)]">
                {t('connect.networkError', { error })}
              </p>
            )}
            {!error && options.length === 0 && <p className="mb-4 text-sm text-ink-2">{t('connect.noAccessible', { noun: oauth.noun, provider })}</p>}
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
              <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {options.map((o) => (
                  <li key={o.key}>
                    <label className="flex cursor-pointer items-start gap-3 px-1 py-3 transition-colors hover:bg-[var(--paper)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
                      <input type="checkbox" name="pick" value={o.key} disabled={!!o.blocked} className="mt-0.5 h-4 w-4 accent-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium leading-5">{o.name}</span>
                        <span className="num flex flex-wrap gap-x-3 text-xs leading-4 text-ink-3">
                          {detailParts(o.detail, t).map((part, i) => (
                            <span key={i}>{part}</span>
                          ))}
                        </span>
                        {existing.has(o.sourceId) && <span className="mt-1 block text-xs text-ink-2">{t('connect.inProject')}</span>}
                        {o.blocked && <span className="mt-1 block text-xs text-ink-2">{t(`connect.blocked_${o.blocked}`)}</span>}
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
