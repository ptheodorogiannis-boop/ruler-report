import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Create a workspace', description: 'Create a Ruler Reports workspace for your agency: connect client accounts, generate reports and dashboards, automate delivery.', alternates: { canonical: '/signup' } };
import { signupAction } from '@/app/actions/auth';

export default async function SignupPage() {
  const { t } = await getT();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-7">
        <div className="eyebrow">Ruler Reports</div>
        <h1 className="display mt-1 text-2xl font-semibold">{t('auth.createYourWorkspace')}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-2">{t('auth.ownerHint')}</p>
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
        <p className="mt-4 text-center text-xs text-ink-2">
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="link font-semibold text-brand">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
