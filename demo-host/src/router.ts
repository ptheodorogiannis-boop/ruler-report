// Which demo screen an app link opens: a captured screen, a live view built from the app's code, or a "not in the demo" card.
import { routeKey, type Manifest } from './route-key';

export type LiveView = 'login' | 'report' | 'dashboard' | 'new' | 'public-report' | 'public-dashboard';
export type Route =
  | { kind: 'captured'; key: string; group: string; path: string; query: string }
  | { kind: 'live'; view: LiveView; id?: number; token?: string; query: string }
  | { kind: 'missing'; path: string };

/** Connect forms were captured for the first project only; other projects reuse them. */
const CONNECT_FORM_PROJECT = 1;

export function matchRoute(href: string, manifest: Manifest): Route {
  const u = new URL(href, 'http://demo');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = u.search.replace(/^\?/, '');
  const live = (view: LiveView, extra: { id?: number; token?: string } = {}): Route => ({ kind: 'live', view, ...extra, query });

  if (path === '/' || path === '/login') return live('login');
  if (path === '/reports/new' || path === '/dashboards/new') return live('new');
  let m = path.match(/^\/(reports|dashboards)\/(\d+)$/);
  if (m) return live(m[1] === 'reports' ? 'report' : 'dashboard', { id: Number(m[2]) });
  m = path.match(/^\/([rd])\/([A-Za-z0-9_-]+)$/);
  if (m) return live(m[1] === 'r' ? 'public-report' : 'public-dashboard', { token: m[2] });

  const byKey = new Map(manifest.routes.map((r) => [r.key, r]));
  const hit = byKey.get(routeKey(href));
  if (hit) return { kind: 'captured', key: hit.key, group: hit.group, path, query };
  m = path.match(/^\/projects\/\d+\/connect\/([a-z0-9_]+)$/);
  if (m) {
    const form = byKey.get(routeKey(`/projects/${CONNECT_FORM_PROJECT}/connect/${m[1]}`));
    if (form) return { kind: 'captured', key: form.key, group: form.group, path, query };
  }
  return { kind: 'missing', path };
}
