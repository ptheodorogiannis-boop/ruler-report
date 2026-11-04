import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import '@bible-strong/avatar-react/styles.css';
import './globals.css';
import { getLocale } from '@/lib/i18n/server';
import { setServerLocale } from '@/lib/i18n/server';

// One family (docs/DESIGN.md › Ruler glass pass): Manrope for titles, text and figures, with Greek. The brand's licensed
// faces (Avantt for titles, ABC Arizona Flare for running text) swap in later through --font-display / --font-sans.
const manrope = Manrope({ subsets: ['latin', 'latin-ext', 'greek'], variable: '--font-sans', display: 'swap' });

const base = process.env.APP_URL || 'http://localhost:3100';
export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: { default: 'Ruler Reports', template: '%s · Ruler Reports' },
  description: 'Marketing reports, live dashboards, automations and goals for agencies.',
  applicationName: 'Ruler Reports',
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName: 'Ruler Reports', title: 'Ruler Reports', description: 'Marketing reports your clients can trust.' },
  twitter: { card: 'summary_large_image', title: 'Ruler Reports', description: 'Marketing reports your clients can trust.' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  setServerLocale(locale);
  return (
    <html lang={locale} className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
