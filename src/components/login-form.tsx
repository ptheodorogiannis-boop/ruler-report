'use client';

// Sign-in (docs/DESIGN.md › Ruler glass pass, design-system.md §6.3): the Ruler wordmark above one centred glass panel on
// the ground. Nothing else competes with the form: no illustration, one action, the sign-up link under it.
import Link from 'next/link';
import { useT } from '@/components/i18n-provider';
import { useActionState, useEffect, useState } from 'react';
import { loginAction } from '@/app/actions/auth';
import { Wordmark } from './brand-marks';

export function LoginForm({ demoHint }: { demoHint?: React.ReactNode }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(loginAction as (prev: unknown, fd: FormData) => Promise<{ error?: string } | void>, null as { error?: string } | null | void);
  const [editedSinceError, setEdited] = useState(false);
  useEffect(() => setEdited(false), [state]);
  const error = state && 'error' in state ? state.error : undefined;

  return (
    <main className="public-stage ground">
      <a href="#email" className="skip-link">
        {t('auth.skipToForm')}
      </a>
      <div className="public-wrap">
        <div className="public-mark">
          <Wordmark height={26} title="Ruler" />
          <span className="public-product">Reports</span>
        </div>
        <section className="public-panel" aria-labelledby="signin-title">
          <h1 id="signin-title" className="public-title">
            {t('auth.signIn')}
          </h1>
          <p className="public-sub">{t('auth.toWorkspace')}</p>
          <form action={formAction} className="mt-7 space-y-4" onChange={() => setEdited(true)}>
            <div>
              <label className="label" htmlFor="email">
                {t('auth.email')}
              </label>
              <input id="email" name="email" type="email" autoComplete="username" className="input input-lg" required aria-invalid={error && !editedSinceError ? true : undefined} />
            </div>
            <div>
              <label className="label" htmlFor="password">
                {t('auth.password')}
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" className="input input-lg" required aria-invalid={error && !editedSinceError ? true : undefined} />
            </div>
            {error && !editedSinceError && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="btn-primary btn-lg w-full" disabled={pending}>
              {pending ? t('auth.checking') : t('auth.signIn')}
            </button>
          </form>
          <p className="mt-6 text-center text-[13px] text-ink-2">
            {t('auth.newAgency')}{' '}
            <Link href="/signup" className="link inline-block py-1.5 font-medium text-ink">
              {t('auth.createWorkspace')}
            </Link>
          </p>
          {demoHint && <div className="public-hint">{demoHint}</div>}
        </section>
        <nav className="public-foot" aria-label={t('auth.legal')}>
          <Link href="/privacy" className="link">
            {t('auth.privacyPolicy')}
          </Link>
          <Link href="/terms" className="link">
            {t('auth.terms')}
          </Link>
        </nav>
      </div>
    </main>
  );
}
