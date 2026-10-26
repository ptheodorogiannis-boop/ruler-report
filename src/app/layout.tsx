import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import '@bible-strong/avatar-react/styles.css';
import './globals.css';
import { getLocale } from '@/lib/i18n/server';
import { setServerLocale } from '@/lib/i18n/server';

// Two families (docs/DESIGN.md › Type): Inter for UI and data (with Greek), Bricolage Grotesque for titles and KPI values.
const inter = Inter({ subsets: ['latin', 'latin-ext', 'greek'], variable: '--font-sans', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap', axes: ['opsz'] });

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
    <html lang={locale} className={`${inter.variable} ${bricolage.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
