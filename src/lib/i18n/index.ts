// i18n core (spec v3 §5): `t(locale, key, vars)` with the fallback el → en → key, `dictFor` for the namespaces a client
// page needs, and the locale rules — user → company → browser → en in the app, `?lang=` → project on public pages.
import { el, en, type Dictionary } from './dicts';
import { interpolate, type Vars } from './format';
import { registerLookupResolver } from './request';

export const LOCALES = ['en', 'el'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (s: unknown): s is Locale => s === 'en' || s === 'el';
export const LOCALE_LABEL: Record<Locale, string> = { en: 'English', el: 'Ελληνικά' };

const DICTS: Record<Locale, Dictionary> = { en, el };

/** How a locale resolves to its dictionary (the request store asks for it on the server; the client never imports this file). */
export const lookupFor = (locale: Locale) => (key: string): string | undefined => DICTS[locale][key] ?? en[key];
registerLookupResolver(lookupFor);
const warned = new Set<string>();

/** The string for `key` in `locale`, else in English, else the key itself (logged once outside production). */
export function t(locale: Locale, key: string, vars?: Vars): string {
  let s = DICTS[locale]?.[key] ?? DICTS.en[key];
  if (s == null) {
    if (process.env.NODE_ENV !== 'production' && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    s = key;
  }
  return interpolate(s, vars);
}

/** A `t` bound to one locale. */
export const tFor = (locale: Locale) => (key: string, vars?: Vars) => t(locale, key, vars);

/** Only the keys of the given namespaces (`nav`, `editor`, …), with the English fallback applied, for a client page. */
export function dictFor(locale: Locale, namespaces: string[]): Dictionary {
  const want = new Set(namespaces);
  const out: Dictionary = {};
  for (const k of Object.keys(en)) {
    if (!want.has(k.slice(0, k.indexOf('.')))) continue;
    out[k] = DICTS[locale][k] ?? en[k];
  }
  return out;
}

/** The app locale: the user's override, else the company's setting, else a browser that asks for Greek, else English. */
export function resolveLocale(input: { user?: string | null; company?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(input.user)) return input.user;
  if (isLocale(input.company)) return input.company;
  const first = (input.acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('el') ? 'el' : 'en';
}

/** A public page's locale: `?lang=el|en` wins, else the project's locale, else English (an unknown `?lang` is ignored). */
export function localeForPublic(project: { locale: string | null | undefined }, lang?: string | null): Locale {
  if (isLocale(lang)) return lang;
  return isLocale(project.locale) ? project.locale : 'en';
}

/** The label of a dashboard preset (`presets.*`). */
export const presetLabel = (preset: string, locale: Locale) => t(locale, `presets.${preset}`);

export type { Dictionary, Vars };
