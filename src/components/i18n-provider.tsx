'use client';

// The client side of i18n (spec v3 §5): a page's server component picks the namespaces it needs with `dictFor` and
// hands them down; client components read them with `useT()`. The dictionaries themselves never enter the bundle.
import { createContext, useContext, type ReactNode } from 'react';
import { interpolate, type Vars } from '@/lib/i18n/format';
import { setRequestLocale } from '@/lib/i18n/request';

type Locale = 'en' | 'el';
const Ctx = createContext<{ locale: Locale; dict: Record<string, string> }>({ locale: 'en', dict: {} });

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Record<string, string>; children: ReactNode }) {
  // the shared widgets read the locale through `tr` on the client too: the page's dictionary is the lookup
  setRequestLocale(locale, (key) => dict[key]);
  return <Ctx.Provider value={{ locale, dict }}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx).locale;
}

/** `t(key, vars)` from the namespaces the page shipped; an unknown key renders as itself. */
export function useT(): (key: string, vars?: Vars) => string {
  const { dict } = useContext(Ctx);
  // outside a provider (a stray client component) the key itself shows — visibly, so it gets wired
  return (key, vars) => interpolate(dict[key] ?? key, vars);
}
