// Signed in: straight to the workspace, as before. Signed out: a public home page. Google's OAuth verification needs a
// public page on the app's own domain that says what the app is, what it does with Google data and links the privacy
// policy; a bare redirect to /login does not count (docs/GOOGLE-VERIFICATION.md).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PublicFrame } from '@/components/public-frame';
import { getPrincipal } from '@/lib/auth';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: { absolute: `${LEGAL.product}: marketing reports for ${LEGAL.entity}'s clients` },
  description: `${LEGAL.product} builds marketing reports and live dashboards from Google and Meta accounts, read-only.`,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};

const SOURCES = [
  { group: 'Google', items: ['Google Ads', 'Google Analytics', 'Search Console', 'YouTube', 'Business Profile'] },
  { group: 'Meta', items: ['Meta Ads', 'Facebook Pages', 'Instagram'] },
];

export default async function Home() {
  const p = await getPrincipal();
  if (p) redirect(p.role === 'client' ? '/dashboards' : '/overview');
  return (
    <PublicFrame>
      <section className="max-w-[640px]">
        <h1 className="display text-[clamp(32px,4.4vw,52px)] font-semibold leading-[1.08]">Marketing reports your clients can read</h1>
        <p className="mt-5 text-lg leading-8 text-ink-2">
          {LEGAL.entity} uses {LEGAL.product} to turn its clients' ad, analytics and social accounts into reports and live dashboards.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/login" className="btn btn-primary btn-lg">
            Sign in
          </Link>
          <Link href="/privacy" className="link text-sm font-medium">
            How we use your data
          </Link>
        </div>
      </section>

      <section aria-labelledby="sources" className="mt-20 grid gap-10 border-t border-[var(--line)] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <h2 id="sources" className="display text-xl font-semibold leading-7">
          What it connects to
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <div key={s.group}>
              <h3 className="font-semibold">{s.group}</h3>
              <ul className="mt-3 space-y-2 text-ink-2">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="data" className="mt-14 grid gap-10 border-t border-[var(--line)] pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <h2 id="data" className="display text-xl font-semibold leading-7">
          Your data
        </h2>
        <div className="max-w-[620px] space-y-3 leading-7 text-ink-2">
          <p>
            You sign in on Google's or Meta's own page and choose the accounts to connect. {LEGAL.product} only reads: it fetches performance
            figures to show them in reports and never creates, edits or posts anything.
          </p>
          <p>
            Tokens are stored encrypted, data is never sold or used for advertising, and you can remove access at any time. The{' '}
            <Link href="/privacy" className="link font-medium">
              privacy policy
            </Link>{' '}
            has the details.
          </p>
        </div>
      </section>
    </PublicFrame>
  );
}
