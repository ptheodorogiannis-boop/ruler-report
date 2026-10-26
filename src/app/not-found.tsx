import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import Link from 'next/link';
import { StaticAvatar } from '@/components/avatar-static';
import { WORKSPACE_SEED } from '@/lib/avatar';

export const metadata: Metadata = { title: 'Page not found' };

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <a href="#back" className="skip-link">
        {t('notfound.skip')}
      </a>
      <StaticAvatar seed={WORKSPACE_SEED} size={120} expression="far-right-glance" label={t('notfound.face')} className="mb-6" />
      <div className="eyebrow">404</div>
      <h1 className="display mt-2 text-[clamp(30px,5vw,48px)] font-semibold leading-[1.05]">{t('notfound.title')}</h1>
      <p className="mt-3 max-w-md text-sm text-ink-2">{t('notfound.body')}</p>
      <svg className="mt-8 w-full max-w-md" height="28" aria-hidden="true">
        <line x1="0" y1="27" x2="100%" y2="27" className="rband-base" />
        <line x1="0" y1="27" x2="0" y2="5" className="rband-tick-major" />
        <line x1="100%" y1="27" x2="100%" y2="5" className="rband-tick-major" />
      </svg>
      <Link id="back" href="/" className="btn-primary mt-8">
        {t('notfound.back')}
      </Link>
    </main>
  );
}
