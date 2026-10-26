'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { safeEqual, sha256 } from '@/lib/crypto';
import { goalsUnlockCookie, publicPath, unlockCookie } from '@/lib/share';
import { localeForPublic, t } from '@/lib/i18n';

const WEEK = 7 * 86400;

export async function unlockShareAction(_: unknown, fd: FormData) {
  const token = String(fd.get('token'));
  const kindRaw = String(fd.get('kind'));
  const password = String(fd.get('password') ?? '');
  // the client's language and embed mode ride along the unlock (review I1)
  const q = { lang: fd.get('lang') ? String(fd.get('lang')) : null, embed: fd.get('embed') === '1' };
  if (kindRaw === 'goals') {
    // the project's public goals page (spec v3 §3.4)
    const p = await db.project.findUnique({ where: { goalsToken: token } });
    if (!p || !p.goalsPassword) redirect(publicPath('goals', token, q));
    if (!safeEqual(sha256(password), p.goalsPassword)) return { error: t(localeForPublic(p, q.lang), 'public.wrongPassword') };
    (await cookies()).set(`rr_gpw_${p.id}`, goalsUnlockCookie(p.id, p.goalsPassword), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: WEEK });
    redirect(publicPath('goals', token, q));
  }
  const kind = kindRaw === 'dashboard' ? 'dashboard' : 'report';
  const r = await db.report.findFirst({ where: { shareToken: token, kind, shareEnabled: true }, include: { project: true } });
  if (!r || !r.password) redirect(publicPath(kind, token, q));
  if (!safeEqual(sha256(password), r.password)) return { error: t(localeForPublic(r.project, q.lang), 'public.wrongPassword') };
  (await cookies()).set(`rr_pw_${r.id}`, unlockCookie(r.id, r.password), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: WEEK });
  redirect(publicPath(kind, token, q));
}
