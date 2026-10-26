// The demo's entry point: load the seed and the screen list, install the browser stand-ins for the app's server, render.
import { createRoot } from 'react-dom/client';
import { getDb, initStore } from './server/store';
import { handleApi } from './server/api';
import { installAnthropicBridge, type SampleFn } from './server/anthropic-bridge';
import { bus, setLocation, parseHref, type Locale } from './bus';
import { routeGroup, type Manifest } from './route-key';
import { loadGroup } from './captured';
import { Shell } from './shell';
import { demoT } from './demo-strings';
import { installFileLinks } from './file-links';
import type { Seed } from './seed/types';

const DEMO_CSS = `
.demo-toast-region{position:fixed;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;justify-content:center;pointer-events:none;z-index:1000;padding-inline:max(16px,env(safe-area-inset-left,0px)) max(16px,env(safe-area-inset-right,0px))}
.demo-toast{pointer-events:auto;max-width:560px;background:#141821;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(10,14,30,.22)}
@media (prefers-reduced-motion:no-preference){.demo-toast{animation:demo-toast-in .22s ease-out}}
@keyframes demo-toast-in{from{opacity:0;transform:translateY(8px)}}
.demo-badge{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:900;background:rgba(255,255,255,.92);color:#4a5163;border:1px solid rgba(20,24,33,.12);border-radius:999px;padding:3px 10px;font-size:11px;letter-spacing:.02em;pointer-events:none}
.demo-back{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:950;background:#141821;color:#fff;border:0;border-radius:999px;padding:8px 14px;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(10,14,30,.22);cursor:pointer}
.demo-back:hover{background:#2a3040}
.demo-back:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px #141821}
@media print{.demo-badge,.demo-toast-region,.demo-back{display:none}}
`;

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** Plain anchors a shared link may carry to open a client view directly (only #letters reach the page). */
function startPath(seed: Seed): string {
  const token = (kind: string) => seed.reports.find((r) => r.kind === kind && r.shareEnabled && !r.password)?.shareToken;
  const hash = window.location.hash.slice(1);
  if (hash === 'report' && token('report')) return `/r/${token('report')}`;
  if (hash === 'dashboard' && token('dashboard')) return `/d/${token('dashboard')}`;
  return '/login';
}

function viewerLocale(): Locale {
  const lang = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  return lang.startsWith('el') ? 'el' : 'en';
}

async function boot() {
  const style = document.createElement('style');
  style.textContent = DEMO_CSS;
  document.head.appendChild(style);
  const [seed, manifest] = await Promise.all([fetch('seed.json').then((r) => r.json() as Promise<Seed>), fetch('views/manifest.json').then((r) => r.json() as Promise<Manifest>)]);
  initStore(seed);

  // the app's own /api calls are answered in the browser; the Anthropic call goes to the viewer's Claude
  const net = window.fetch.bind(window);
  const pageHost = new URL(window.location.href).host;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(urlOf(input), window.location.href);
    const answer = url.host === pageHost ? await handleApi(url, init) : null;
    return answer ?? net(input, init);
  }) as typeof fetch;
  let sample: Promise<SampleFn | null> | null = null;
  installAnthropicBridge(() => {
    sample ??= (async () => {
      try {
        const c = (window as any).claude;
        return c?.use ? ((await c.use('sample')) as SampleFn | null) : null;
      } catch {
        return null;
      }
    })();
    return sample;
  });

  // Claude pages refuse dialogs, printing and <a download> (review I1): the app's "are you sure?" before removing a
  // block or a card is answered yes (the viewer just clicked remove), alerts and print become a note, files go to downloads
  try {
    window.confirm = () => true;
    window.alert = (message?: unknown) => bus.toast(String(message ?? ''));
    window.print = () => bus.toast(demoT(bus.locale(), 'usePdfDownload'));
  } catch {
    // read-only in this browser: the buttons stay as the viewer would see them anyway
  }
  installFileLinks();

  const locale = viewerLocale();
  setLocation(parseHref(startPath(seed)));
  void loadGroup(locale, routeGroup(manifest.chrome)).catch(() => null);
  const root = document.getElementById('demo-root')!;
  root.innerHTML = '';
  createRoot(root).render(<Shell manifest={manifest} initialLocale={locale} />);
  // read-only handles for the end-to-end test (navigation and the store); harmless for viewers
  (window as any).__demo = { navigate: (href: string) => bus.navigate(href), reports: () => getDb().$tables.report.map((r) => ({ id: r.id, kind: r.kind, title: r.title, layout: r.layout, analysis: r.analysis })) };
}

boot().catch((e) => {
  const root = document.getElementById('demo-root');
  if (root) root.innerHTML = `<div style="max-width:420px;margin:15vh auto;padding:24px;font:14px system-ui;text-align:center">${demoT(viewerLocale(), 'bootFailed')}<br><small style="color:#777">${String((e as Error)?.message ?? e).replace(/</g, '&lt;')}</small></div>`;
  console.error(e);
});
