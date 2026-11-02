// "Google accounts found" / "Meta accounts found": the picker after one consent for every network of a
// provider (Reportei's dialog of the same name, docs/REPORTEI-DEEP-DIVE.md). The tokens wait in the encrypted
// pending cookie; the lists are fetched here and again on submit, never trusted from the form.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell';
import { AccountsPicker, type PickerNetwork } from '@/components/accounts-picker';
import { PlatformTile } from '@/components/platform-tile';
import { assertProject, canWrite, requirePrincipal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { db } from '@/lib/db';
import { bundleMatches, pickValue } from '@/lib/oauth/flow';
import { PENDING_COOKIE, openPending } from '@/lib/oauth/pending';
import { detailParts } from '@/lib/oauth/detail';
import { OAUTH_SLUGS, PROVIDER_NAME, listBundle } from '@/lib/oauth/providers';
import { getT } from '@/lib/i18n/server';
import type { Provider } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export default async function AccountsFound({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ provider?: string }> }) {
  const p = await requirePrincipal();
  const { t } = await getT();
  const { id } = await params;
  const provider: Provider = (await searchParams).provider === 'meta' ? 'meta' : 'google';
  const project = await assertProject(p, Number(id)).catch(() => null);
  if (!project || !canWrite(p)) notFound();

  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value);
  const restart = `/api/oauth/${provider}/start?projectId=${project.id}&bundle=1`;
  if (!bundleMatches(pending, p, project.id, provider)) {
    return (
      <AppShell active="/projects">
        <AccountsPicker expired provider={provider} providerName={PROVIDER_NAME[provider]} projectId={project.id} projectName={project.name} restartHref={restart} networks={[]} />
      </AppShell>
    );
  }

  const [found, existing] = await Promise.all([
    listBundle(pending.slugs, pending.granted, pending.credentials),
    db.integration.findMany({ where: { projectId: project.id, slug: { in: pending.slugs } }, select: { slug: true, sourceId: true } }),
  ]);
  const inProject = new Set(existing.map((i) => `${i.slug}:${i.sourceId}`));
  const networks: PickerNetwork[] = found.map((n) => {
    const def = getIntegrationDef(n.slug)!;
    return {
      slug: n.slug,
      name: def.name,
      noun: OAUTH_SLUGS[n.slug].noun,
      mark: <PlatformTile slug={n.slug} />,
      error: n.error ?? null,
      notGranted: !!n.notGranted,
      // inactive accounts (a disabled ad account) last; the sort is stable, so the provider's order stays otherwise
      accounts: n.options
        .map((o) => ({ value: pickValue(n.slug, o.key), name: o.name, detail: detailParts(o.detail, t), inProject: inProject.has(`${n.slug}:${o.sourceId}`), inactive: !!o.inactive }))
        .sort((a, b) => Number(a.inactive) - Number(b.inactive)),
    };
  });

  return (
    <AppShell active="/projects">
      <AccountsPicker provider={provider} providerName={PROVIDER_NAME[provider]} account={pending.account ?? null} projectId={project.id} projectName={project.name} restartHref={restart} networks={networks} />
    </AppShell>
  );
}
