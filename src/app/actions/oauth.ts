'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { assertProject, canWrite, requirePrincipal } from '@/lib/auth';
import { PENDING_COOKIE, openPending } from '@/lib/oauth/pending';
import { finalizeSelection, pendingMatches } from '@/lib/oauth/flow';

/** Picker form submit: create one integration per ticked account, then drop the pending tokens. */
export async function finishOAuthAction(_: unknown, fd: FormData) {
  const projectId = Number(fd.get('projectId'));
  try {
    const p = await requirePrincipal();
    if (!canWrite(p)) throw new Error('Your role is read-only.');
    await assertProject(p, projectId);
    const slug = String(fd.get('slug'));
    const jar = await cookies();
    const pending = openPending(jar.get(PENDING_COOKIE)?.value);
    if (!pendingMatches(pending, p, projectId, slug)) throw new Error('The sign-in session expired — start the connection again.');
    await finalizeSelection(pending, fd.getAll('pick').map(String));
    jar.delete(PENDING_COOKIE);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/projects/${projectId}?tab=integrations`);
}

export async function cancelOAuthAction(fd: FormData) {
  (await cookies()).delete(PENDING_COOKIE);
  redirect(`/projects/${Number(fd.get('projectId'))}/connect`);
}
