// One name per captured screen, shared by the capture script and the demo router.
// "/projects/1?tab=goals" → "projects-1-goals"; a page without ?tab uses its default tab; other query parameters are
// not part of a screen's name.

const DEFAULT_TAB: [RegExp, string][] = [
  [/^\/projects\/\d+$/, 'overview'],
  [/^\/settings$/, 'branding'],
];

export function routeKey(href: string): string {
  const u = new URL(href, 'http://demo');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  let tab = u.searchParams.get('tab');
  if (!tab) for (const [re, t] of DEFAULT_TAB) if (re.test(path)) tab = t;
  const base = path === '/' ? 'home' : path.slice(1).split('/').join('-');
  return (tab ? `${base}-${tab}` : base).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

/** The file a screen is stored in: one per area, so a publish stays well under the file limit. */
export function routeGroup(key: string): string {
  if (/^projects-\d+-connect-/.test(key)) return 'connect-forms';
  const project = key.match(/^projects-\d+/);
  if (project) return project[0];
  if (key.startsWith('templates')) return 'templates';
  if (key.startsWith('settings')) return 'settings';
  return key;
}

export interface ManifestRoute {
  path: string;
  key: string;
  group: string;
}
export interface Manifest {
  version: 1;
  capturedAt: string;
  langs: ('en' | 'el')[];
  /** the screen whose chrome (navigation, account menu) frames the live views */
  chrome: string;
  routes: ManifestRoute[];
}
