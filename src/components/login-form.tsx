'use client';

// Sign-in as a moment (docs/DESIGN.md › Award pass › Login): the instrument gets a face.
import Link from 'next/link';
import { useT } from '@/components/i18n-provider';
import { useActionState, useEffect, useState } from 'react';
import { loginAction } from '@/app/actions/auth';
import { WORKSPACE_SEED } from '@/lib/avatar';
import { LoginAvatar, type Mood } from './avatar';
import { RulerBand } from './ruler-band';

const monthOf = (d: Date) => {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { range: { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` }, today: `${y}-${pad(m + 1)}-${pad(d.getDate())}` };
};

const CAPTION: Record<Mood, string> = {
  watch: 'auth.captionWatch',
  covered: 'auth.captionCovered',
  wrong: 'auth.captionWrong',
  thinking: 'auth.captionThinking',
  success: 'auth.captionSuccess',
};

export function LoginForm({ demoHint }: { demoHint?: React.ReactNode }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(loginAction as (prev: unknown, fd: FormData) => Promise<{ error?: string } | void>, null as { error?: string } | null | void);
  const [email, setEmail] = useState('');
  const [seed, setSeed] = useState(WORKSPACE_SEED);
  const [pwFocus, setPwFocus] = useState(false);
  const [editedSinceError, setEdited] = useState(false);

  // the face becomes yours a moment after you type a plausible address
  useEffect(() => {
    const t = setTimeout(() => setSeed(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? email : WORKSPACE_SEED), 350);
    return () => clearTimeout(t);
  }, [email]);
  useEffect(() => setEdited(false), [state]);

  const error = state && 'error' in state ? state.error : undefined;
  const mood: Mood = pending ? 'thinking' : error && !editedSinceError ? 'wrong' : pwFocus ? 'covered' : 'watch';
  const [month, setMonth] = useState<ReturnType<typeof monthOf> | null>(null);
  useEffect(() => setMonth(monthOf(new Date())), []);

  return (
    <main className="login grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <a href="#email" className="skip-link">
        {t('auth.skipToForm')}
      </a>
      <section className="login-stage relative flex flex-col items-center justify-center px-6 py-10 lg:py-0" aria-label={t('auth.yourAvatar')}>
        {/* sized by CSS (.login-avatar-lg: 168 px, 240 px from 1024 px) so the server renders the final box and nothing shifts */}
        <LoginAvatar seed={seed} mood={mood} className="login-avatar-lg" />
        <p className="login-caption mt-6 text-center text-base text-ink-2 lg:mt-8" aria-live="polite">
          {t(CAPTION[mood])}
        </p>
        <div className="login-ruler-slot mt-8 w-full max-w-[22rem]">{month && <RulerBand range={month.range} marker={month.today} live size="sm" className="login-ruler" />}</div>
        <div className="login-corner eyebrow absolute bottom-6 left-6 hidden lg:block">Ruler Reports</div>
        <div className="login-corner absolute bottom-6 right-6 hidden text-[11px] text-ink-3 lg:block">{t('auth.faceHint')}</div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 lg:border-l lg:border-[var(--line)] lg:bg-[var(--card)]">
        <div className="w-full max-w-[26rem]">
          <h1 className="display text-[34px] font-semibold leading-tight">{t('auth.signIn')}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{t('auth.toWorkspace')}</p>
          <form action={formAction} className="mt-8 space-y-5" onChange={() => setEdited(true)}>
            <div>
              <label className="label" htmlFor="email">
                {t('auth.email')}
              </label>
              <input id="email" name="email" type="email" autoComplete="username" className="input input-lg" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">
                {t('auth.password')}
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" className="input input-lg" required onFocus={() => setPwFocus(true)} onBlur={() => setPwFocus(false)} />
            </div>
            {error && !editedSinceError && (
              <div className="rounded-lg bg-[#fbeeec] px-3 py-2 text-sm text-down" role="alert">
                {error}
              </div>
            )}
            <button className="btn-primary btn-lg w-full" disabled={pending}>
              {pending ? t('auth.checking') : t('auth.signIn')}
            </button>
          </form>
          <p className="mt-5 text-center text-xs text-ink-2">
            {t('auth.newAgency')}{' '}
            <Link href="/signup" className="link inline-block py-1.5 font-semibold text-brand">
              {t('auth.createWorkspace')}
            </Link>
          </p>
          {demoHint && <div className="mt-6 rounded-lg bg-[var(--paper)] px-3 py-2 text-center text-[11px] text-ink-3">{demoHint}</div>}
        </div>
      </section>
    </main>
  );
}
