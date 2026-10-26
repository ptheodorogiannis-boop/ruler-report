// The app frame: a captured screen (navigation, account menu, page), or the captured chrome with a live view mounted in
// its <main>. Screens load on demand, one file per area and language.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { routeGroup, type Manifest } from './route-key';
import type { Route } from './router';
import { bus, type Locale } from './bus';
import { demoT } from './demo-strings';
import { canPersist, createdIds, getDb } from './server/store';

const cache = new Map<string, Promise<Record<string, string>>>();
/** Areas already loaded, so a screen whose area is loaded shows at once instead of after a loading frame. */
const resolved = new Map<string, Record<string, string>>();

export function loadGroup(locale: Locale, group: string): Promise<Record<string, string>> {
  const k = `${locale}/${group}`;
  if (!cache.has(k)) {
    const p = fetch(`views/${k}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`views/${k}.json: ${r.status}`);
        return r.json() as Promise<Record<string, string>>;
      })
      .then((g) => (resolved.set(k, g), g))
      .catch((e) => {
        cache.delete(k);
        throw e;
      });
    cache.set(k, p);
  }
  return cache.get(k)!;
}

/** An app href the demo routes itself: a path, or a link to the capture/dev server; null for anything else. */
export function internalHref(href: string | null | undefined): string | null {
  if (!href || /^(#|mailto:|tel:|sms:|javascript:)/i.test(href)) return null;
  if (href.startsWith('/')) return href;
  try {
    const u = new URL(href);
    // the capture server, and the hosted address the captured screens show instead of it (review M4)
    if (/^(localhost|127\.0\.0\.1|reports\.ruler\.agency)$/.test(u.hostname)) return u.pathname + u.search;
  } catch {
    // not a URL
  }
  return null;
}

/** Connect forms were captured for project 1; on another client's form, name that client instead (review M3). */
function renameConnectForm(host: HTMLElement, path: string) {
  const n = Number(path.match(/^\/projects\/(\d+)\/connect\//)?.[1]);
  if (!n || n === 1) return;
  const db = getDb();
  const from = db.$tables.project.find((p) => Number(p.id) === 1)?.name as string | undefined;
  const to = db.$tables.project.find((p) => Number(p.id) === n)?.name as string | undefined;
  if (from && to) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue?.includes(from)) t.nodeValue = t.nodeValue.split(from).join(to);
    host.querySelectorAll<HTMLElement>('[title], [aria-label], [alt], [placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'alt', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v?.includes(from)) el.setAttribute(a, v.split(from).join(to));
      }
    });
  }
  host.querySelectorAll<HTMLElement>('[href^="/projects/1"], [action^="/projects/1"]').forEach((el) => {
    for (const a of ['href', 'action']) {
      const v = el.getAttribute(a);
      if (v && /^\/projects\/1(?=[/?#]|$)/.test(v)) el.setAttribute(a, v.replace(/^\/projects\/1/, `/projects/${n}`));
    }
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Demo-only touches on a freshly injected screen. */
function decorate(host: HTMLElement, route: Route, locale: Locale, activeBase: string | null) {
  if (route.kind === 'captured') renameConnectForm(host, route.path);
  if (activeBase) {
    host.querySelectorAll('nav a[aria-current]').forEach((a) => {
      a.removeAttribute('aria-current');
      a.classList.remove('is-active');
    });
    const link = host.querySelector(`nav a[href="${activeBase}"]`);
    link?.setAttribute('aria-current', 'page');
    link?.classList.add('is-active');
  }
  const panel = host.querySelector('.umenu-panel .p-1\\.5') ?? host.querySelector('.umenu-panel');
  if (panel && canPersist() && !panel.querySelector('[data-demo-reset]')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'navlink w-full';
    b.setAttribute('data-demo-reset', '');
    b.innerHTML = `<span>${esc(demoT(locale, 'resetDemo'))}</span>`;
    panel.insertBefore(b, panel.querySelector('form'));
  }
  if (route.kind === 'captured' && (route.key === 'reports' || route.key === 'dashboards')) {
    const kind = route.key === 'reports' ? 'report' : 'dashboard';
    const ids = createdIds(kind);
    const main = host.querySelector('main');
    if (ids.length && main && !main.querySelector('[data-demo-created]')) {
      const rows = getDb().$tables.report.filter((r) => ids.includes(Number(r.id)));
      const card = document.createElement('section');
      card.className = 'card mb-6 p-4';
      card.setAttribute('data-demo-created', '');
      card.innerHTML = `<div class="eyebrow mb-2">${esc(demoT(locale, 'createdInDemo'))}</div><ul class="space-y-1.5">${rows
        .map((r) => `<li><a class="font-semibold text-brand" href="/${kind === 'report' ? 'reports' : 'dashboards'}/${r.id}">${esc(String(r.title))}</a> <span class="text-xs text-ink-3">${esc(String(r.startDate))} → ${esc(String(r.endDate))}</span></li>`)
        .join('')}</ul>`;
      const header = main.firstElementChild;
      header ? header.after(card) : main.prepend(card);
    }
  }
}

export function AppFrame({ route, manifest, locale, children }: { route: Route; manifest: Manifest; locale: Locale; children?: ReactNode }) {
  const live = route.kind !== 'captured';
  const key = route.kind === 'captured' ? route.key : manifest.chrome;
  const group = route.kind === 'captured' ? route.group : routeGroup(manifest.chrome);
  const id = `${locale}/${group}/${key}`;
  const loaded = resolved.get(`${locale}/${group}`);
  const [state, setState] = useState<{ id: string; html?: string; error?: boolean }>({ id: '' });
  // the screen for THIS address only: never the previous screen while the next one loads (review M1)
  const html = loaded ? loaded[key] : state.id === id ? state.html : undefined;
  const error = loaded ? !loaded[key] : state.id === id && !!state.error;
  const hostRef = useRef<HTMLDivElement>(null);
  const [main, setMain] = useState<HTMLElement | null>(null);
  const q = route.kind === 'live' ? new URLSearchParams(route.query) : null;
  const activeBase = route.kind === 'live' ? (route.view === 'dashboard' || (route.view === 'new' && q?.get('kind') === 'dashboard') ? '/dashboards' : '/reports') : null;

  useEffect(() => {
    if (loaded) return;
    let current = true;
    loadGroup(locale, group).then(
      (g) => current && setState(g[key] ? { id, html: g[key] } : { id, error: true }),
      () => current && setState({ id, error: true }),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!loaded]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!html) {
      host.innerHTML = '';
      host.removeAttribute('data-key');
      setMain(null);
      return;
    }
    host.innerHTML = html;
    host.setAttribute('data-key', key);
    const m = host.querySelector<HTMLElement>('main#main') ?? host.querySelector<HTMLElement>('main');
    if (live && m) {
      m.innerHTML = '';
      m.setAttribute('data-live-root', '');
    }
    decorate(host, route, locale, activeBase);
    setMain(live ? m : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, live, live ? 'live' : key, route.kind === 'captured' ? route.path : '', locale, activeBase]);

  return (
    <>
      {!html && !error && (
        <div className="py-24 text-center text-sm text-ink-3" role="status" data-demo-loading>
          {demoT(locale, 'loading')}
        </div>
      )}
      {error && (
        <div className="card mx-auto my-16 max-w-md p-6 text-center text-sm" role="alert">
          <p>{demoT(locale, 'loadFailed')}</p>
          <button type="button" className="btn mt-4" onClick={() => bus.back()}>
            {demoT(locale, 'back')}
          </button>
        </div>
      )}
      <div ref={hostRef} data-captured-host="" />
      {main && children ? createPortal(children, main) : null}
    </>
  );
}
