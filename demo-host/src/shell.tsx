// The demo shell: routing, language, sign-in, toasts, downloads, and the clicks and submits of captured screens.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { I18nProvider } from '@/components/i18n-provider';
import { dictFor, lookupFor } from '@/lib/i18n';
import { setRequestLocale } from '@/lib/i18n/request';
import { bus, getLocation, parseHref, setBusHandlers, setLocation, subscribeLocation, type Locale } from './bus';
import { matchRoute } from './router';
import type { Manifest } from './route-key';
import { AppFrame, internalHref } from './captured';
import { demoT } from './demo-strings';
import { downloadCsv, downloadPdf } from './downloads';
import { isFileLink, saveFileLink } from './file-links';
import { resetDemo } from './server/store';
import { ALL_NAMESPACES } from './i18n-all';
import { LoginView } from './views/LoginView';
import { ReportPageView } from './views/ReportPageView';
import { PublicReportView } from './views/PublicReportView';
import { NewReportView } from './views/NewReportView';
import { Missing } from './views/common';

const hrefOf = (l: { path: string; search: string }) => l.path + (l.search ? `?${l.search}` : '');

export function Shell({ manifest, initialLocale }: { manifest: Manifest; initialLocale: Locale }) {
  const loc = useSyncExternalStore(subscribeLocation, getLocation, getLocation);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [signedIn, setSignedIn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const stack = useRef<string[]>([]);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  // the shared components read the app's language through the request store
  setRequestLocale(locale, lookupFor(locale));
  const dict = useMemo(() => dictFor(locale, ALL_NAMESPACES), [locale]);

  const navigate = useCallback((href: string, opts?: { replace?: boolean }) => {
    const h = internalHref(href);
    if (!h) return;
    if (h.startsWith('/api/pdf/')) return void downloadPdf(h, localeRef.current);
    if (/^\/api\/v2\/reports\/\d+\/export\.csv/.test(h)) return void downloadCsv(h, localeRef.current);
    // signing up needs the full app (review M11)
    if (!signedInRef.current && /^\/signup(?:[/?#]|$)/.test(h)) return bus.toast(demoT(localeRef.current, 'worksInFullApp'));
    const cur = hrefOf(getLocation());
    if (!opts?.replace && cur !== h) stack.current.push(cur);
    setLocation(parseHref(h));
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setBusHandlers({
      navigate,
      refresh: () => setRefreshKey((k) => k + 1),
      back: () => setLocation(parseHref(stack.current.pop() ?? '/overview')),
      signIn: () => setSignedIn(true),
      signOut: () => {
        setSignedIn(false);
        stack.current = [];
        setLocation({ path: '/login', search: '' });
      },
      toast: (text) => setToast({ text, n: Date.now() }),
      setLocale: (l) => setLocale(l),
      locale: () => localeRef.current,
    });
  }, [navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // clicks: internal links route in place (PDF/CSV links become downloads), demo reset, static captured buttons explain
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest('[data-demo-reset]')) {
        e.preventDefault();
        resetDemo();
        bus.toast(demoT(localeRef.current, 'resetDone'));
        bus.navigate('/overview');
        return;
      }
      const a = t.closest('a[href]') as HTMLAnchorElement | null;
      if (a) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (isFileLink(a)) {
          e.preventDefault();
          return saveFileLink(a, localeRef.current);
        }
        const raw = a.getAttribute('href');
        const h = internalHref(raw);
        if (h) {
          e.preventDefault();
          a.closest('details')?.removeAttribute('open');
          bus.navigate(h);
        } else if (raw && /^https?:/i.test(raw)) {
          a.target = '_blank';
          a.rel = 'noreferrer';
        }
        return;
      }
      const b = t.closest('button') as HTMLButtonElement | null;
      if (b && !e.defaultPrevented && b.closest('[data-captured-host]') && !b.closest('[data-live-root]') && !b.closest('form') && !b.closest('summary')) bus.toast(demoT(localeRef.current, 'worksInFullApp'));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // submits: GET forms of live views (the client period picker) route in place; captured forms act in the demo
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      const method = (form.getAttribute('method') ?? '').toLowerCase();
      if (form.closest('[data-live-root], [data-live-page]')) {
        if (e.defaultPrevented || method !== 'get') return;
        e.preventDefault();
        const params = new URLSearchParams();
        new FormData(form).forEach((v, k) => typeof v === 'string' && params.append(k, v));
        const base = internalHref(form.getAttribute('action')) ?? getLocation().path;
        bus.navigate(`${base.split('?')[0]}?${params}`);
        return;
      }
      if (!form.closest('[data-captured-host]')) return;
      e.preventDefault();
      if (form.hasAttribute('data-locale-switch')) {
        const v = (e.submitter as HTMLButtonElement | null)?.value;
        if (v === 'en' || v === 'el') bus.setLocale(v);
        return;
      }
      if (form.closest('.umenu-panel')) return bus.signOut();
      bus.toast(demoT(localeRef.current, method === 'get' ? 'filtersNote' : 'savedInDemo'));
    };
    document.addEventListener('submit', onSubmit);
    return () => document.removeEventListener('submit', onSubmit);
  }, []);

  const route = matchRoute(hrefOf(loc), manifest);
  useEffect(() => {
    if (signedIn && route.kind === 'live' && route.view === 'login') bus.navigate('/overview', { replace: true });
  }, [signedIn, route]);

  let body;
  if (route.kind === 'live' && (route.view === 'public-report' || route.view === 'public-dashboard')) {
    // a client view opened from the app keeps a way back to it (review C2)
    const back = signedIn && stack.current.length > 0;
    body = (
      <>
        <PublicReportView token={route.token!} kind={route.view === 'public-report' ? 'report' : 'dashboard'} query={route.query} appLocale={locale} refreshKey={refreshKey} />
        {back && (
          <button type="button" className="demo-back no-print" data-demo-back onClick={() => bus.back()}>
            {demoT(locale, 'backToApp')}
          </button>
        )}
      </>
    );
  } else if (!signedIn || (route.kind === 'live' && route.view === 'login')) {
    body = <LoginView locale={locale} />;
  } else {
    let content = null;
    if (route.kind === 'live' && (route.view === 'report' || route.view === 'dashboard')) content = <ReportPageView id={route.id!} kind={route.view} locale={locale} refreshKey={refreshKey} />;
    else if (route.kind === 'live' && route.view === 'new') content = <NewReportView query={route.query} locale={locale} />;
    else if (route.kind === 'missing') content = <Missing locale={locale} />;
    body = (
      <AppFrame route={route} manifest={manifest} locale={locale}>
        {content}
      </AppFrame>
    );
  }

  return (
    <I18nProvider locale={locale} dict={dict}>
      {body}
      <div className="demo-badge" aria-hidden="true">
        {demoT(locale, 'sampleData')}
      </div>
      <div role="status" aria-live="polite" className="demo-toast-region">
        {toast && (
          <div key={toast.n} className="demo-toast">
            {toast.text}
          </div>
        )}
      </div>
    </I18nProvider>
  );
}
