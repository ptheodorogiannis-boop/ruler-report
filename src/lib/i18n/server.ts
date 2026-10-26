// Server helpers: the request's locale and a bound `t` (spec v3 §5).
import { headers } from 'next/headers';
import { getPrincipal } from '@/lib/auth';
import { lookupFor, resolveLocale, t, type Locale } from './index';
import { setRequestLocale } from './request';
import type { Vars } from './format';

/** The locale a signed-in user sees: their override, else their company's setting. */
export const principalLocale = (u: { locale: string | null; company: { locale: string } }): Locale => resolveLocale({ user: u.locale, company: u.company.locale });

/** The locale of the current request: the principal's, else what the browser asks for. */
export async function getLocale(): Promise<Locale> {
  const p = await getPrincipal().catch(() => null);
  if (p?.locale) return p.locale;
  try {
    const h = await headers();
    return resolveLocale({ acceptLanguage: h.get('accept-language') });
  } catch {
    return 'en';
  }
}

/** `{ locale, t }` for a server component or action. */
export async function getT(): Promise<{ locale: Locale; t: (key: string, vars?: Vars) => string }> {
  const locale = await getLocale();
  return { locale, t: (key, vars) => t(locale, key, vars) };
}

/** Bind the request store to `locale` with the real dictionary (server components, tests). */
export function setServerLocale(locale: Locale) {
  setRequestLocale(locale, lookupFor(locale));
}

export { localeForPublic, t } from './index';
