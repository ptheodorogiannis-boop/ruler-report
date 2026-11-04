import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { Wordmark } from '@/components/brand-marks';
import { signupAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Create a workspace', description: 'Create a Ruler Reports workspace for your agency: connect client accounts, generate reports and dashboards, automate delivery.', alternates: { canonical: '/signup' } };

// Same frame as the sign-in (docs/DESIGN.md › Ruler glass pass): the wordmark above one glass panel on the ground.
export default async function SignupPage() {
  const { t } = await getT();
  return (
    <main className="public-stage ground">
      <div className="public-wrap">
        <div className="public-mark">
          <Wordmark height={26} title="Ruler" />
          <span className="public-product">Reports</span>
        </div>
        <section className="public-panel" aria-labelledby="signup-title">
          <h1 id="signup-title" className="public-title">
            {t('auth.createYourWorkspace')}
          </h1>
          <p className="public-sub mb-6">{t('auth.ownerHint')}</p>
          <AuthForm
            action={signupAction}
            submit={t('auth.createWorkspaceShort')}
            pending={t('auth.pleaseWait')}
            fields={[
              { name: 'company', label: t('auth.companyName') },
              { name: 'name', label: t('auth.yourName'), autoComplete: 'name' },
              { name: 'email', label: t('auth.workEmail'), type: 'email', autoComplete: 'username' },
              { name: 'password', label: t('auth.passwordRule'), type: 'password', autoComplete: 'new-password' },
            ]}
          />
          <p className="mt-6 text-center text-[13px] text-ink-2">
            {t('auth.haveAccount')}{' '}
            <Link href="/login" className="link font-medium text-ink">
              {t('auth.signIn')}
            </Link>
          </p>
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
