// The demo's location and the shell's handlers, shared by the Next shims, the actions and the shell without importing
// one another. The shell (Task 6) registers the handlers; until then they are harmless defaults.
export type Locale = 'en' | 'el';

export interface BusHandlers {
  navigate(href: string, opts?: { replace?: boolean }): void;
  refresh(): void;
  back(): void;
  signIn(): void;
  signOut(): void;
  toast(message: string): void;
  setLocale(locale: Locale): void;
  /** The language the demo is shown in now. */
  locale(): Locale;
}

const noop = () => {};
let handlers: BusHandlers = { navigate: noop, refresh: noop, back: noop, signIn: noop, signOut: noop, toast: noop, setLocale: noop, locale: () => 'en' };

export function setBusHandlers(next: Partial<BusHandlers>): void {
  handlers = { ...handlers, ...next };
}

export const bus: BusHandlers = {
  navigate: (href, opts) => handlers.navigate(href, opts),
  refresh: () => handlers.refresh(),
  back: () => handlers.back(),
  signIn: () => handlers.signIn(),
  signOut: () => handlers.signOut(),
  toast: (m) => handlers.toast(m),
  setLocale: (l) => handlers.setLocale(l),
  locale: () => handlers.locale(),
};

// ───────── location (owned here so hooks can subscribe) ─────────
export interface DemoLocation {
  path: string;
  search: string;
}
let location: DemoLocation = { path: '/login', search: '' };
const listeners = new Set<() => void>();

export function getLocation(): DemoLocation {
  return location;
}
export function setLocation(next: DemoLocation): void {
  if (next.path === location.path && next.search === location.search) return;
  location = next;
  for (const l of listeners) l();
}
export function subscribeLocation(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Split an app href ("/reports/1?tab=x#y") into path and search. */
export function parseHref(href: string): DemoLocation {
  const u = new URL(href, 'http://demo');
  return { path: u.pathname, search: u.search.replace(/^\?/, '') };
}
