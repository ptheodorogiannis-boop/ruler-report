import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { I18nProvider } from '@/components/i18n-provider';
import { getPrincipal } from '@/lib/auth';
import { dictFor } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Sign in', description: 'Sign in to your Ruler Reports workspace: multichannel client reports, live dashboards, automations and goals for marketing agencies.', alternates: { canonical: '/login' } };

export default async function LoginPage() {
  if (await getPrincipal()) redirect('/overview');
  // signed out, so the browser's Accept-Language decides (spec v3 §5); the form is a client component and needs the provider
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} dict={dictFor(locale, ['auth', 'common'])}>
      <LoginForm
        demoHint={
          process.env.NODE_ENV !== 'production' ? (
            <>
              Demo: <code>admin@demo.local</code> / <code>demo1234</code> (after <code>npm run setup</code>)
            </>
          ) : undefined
        }
      />
    </I18nProvider>
  );
}
