// The locale of the current render for components that cannot be handed one (spec v3 §5): the root layout, the shell
// and the public pages bind the signed-in / project locale per request (React `cache` is request-scoped on the server),
// and the client provider binds it for the editor's shared widgets. `tr(key)` reads it synchronously, so server
// components that tests render with renderToStaticMarkup stay synchronous.
//
// The store holds a lookup, not the dictionaries: on the server `src/lib/i18n/index.ts` registers the real one, on the
// client the provider hands over the namespaces the page shipped, so neither JSON file ever enters the client bundle.
// Outside a render (tests, scripts) and in the SSR pass of client trees React's cache is a passthrough and the
// module-level scope stands in — process-global on the server (Plan H final ruling on review I7).
import { cache } from 'react';
import { interpolate, type Vars } from './format';

type Locale = 'en' | 'el';
export type Lookup = (key: string) => string | undefined;
interface Scope {
  locale: Locale;
  lookup: Lookup;
}

const EMPTY: Lookup = () => undefined;
const store = cache(() => ({ scope: null as Scope | null }));
let fallback: Scope = { locale: 'en', lookup: EMPTY };
let resolver: ((locale: Locale) => Lookup) | null = null;
const warned = new Set<string>();

/** The server side registers how a locale resolves to its dictionary (done once by `src/lib/i18n/index.ts`). */
export function registerLookupResolver(fn: (locale: Locale) => Lookup) {
  resolver = fn;
}

/** Bind the locale of this request / render; `lookup` is the page's dictionary (the client provider), else the registered resolver's. */
export function setRequestLocale(locale: Locale, lookup?: Lookup) {
  const scope: Scope = { locale, lookup: lookup ?? (resolver ? resolver(locale) : fallback.lookup) };
  try {
    store().scope = scope;
  } catch {
    // outside a React render (tests, scripts): only the fallback applies
  }
  fallback = scope;
}

function scopeOf(): Scope {
  let s = fallback;
  try {
    s = store().scope ?? fallback;
  } catch {
    // no render in progress
  }
  // nothing bound yet (a route handler, a script, a test) but the server registered its dictionaries: use them
  if (s.lookup === EMPTY && resolver) s = { locale: s.locale, lookup: resolver(s.locale) };
  return s;
}

export function getRequestLocale(): Locale {
  return scopeOf().locale;
}

/** `t` bound to the request's locale; an unknown key renders as itself and logs once outside production. */
export const tr = (key: string, vars?: Vars): string => {
  const s = scopeOf();
  const raw = s.lookup(key);
  if (raw == null) {
    if (process.env.NODE_ENV !== 'production' && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key "${key}" (${s.locale})`);
    }
    return interpolate(key, vars);
  }
  return interpolate(raw, vars);
};
