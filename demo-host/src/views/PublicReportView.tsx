// The client link (src/components/public-report.tsx) in the browser: the same dossier, cover layouts, period picker and
// PDF menu, in the project's language or ?lang=. Views are not counted in the demo.
import { Lock } from 'lucide-react';
import { MediaImage } from '@/components/media-image';
import { DataFootnotes } from '@/components/data-note';
import { themeVars } from '@/lib/layout/theme';
import { PlatformIcon } from '@/components/platform-icon';
import { ReportBody } from '@/components/widgets';
import { PrintButton } from '@/components/action-form';
import { ReportCover, coverLayoutOf } from '@/components/report-cover';
import { UnlockClient } from '@/components/unlock-client';
import { DashboardControls } from '@/components/dashboard-controls';
import { I18nProvider } from '@/components/i18n-provider';
import { dictFor, lookupFor } from '@/lib/i18n';
import { setRequestLocale, tr } from '@/lib/i18n/request';
import { clientPreset } from '@/lib/services/dashboards';
import { formatDisplayDate, today } from '@/lib/util/dates';
import { sanitizeHtml } from '@/lib/util/sanitize';
import { ALL_NAMESPACES, stripClientPrefix } from '../i18n-all';
import type { Locale } from '../bus';
import { demoT } from '../demo-strings';
import { isUnlocked } from '../server/store';
import { loadPublic, useLoaded, type PublicData } from './load';
import { Loading, Missing } from './common';

/** The client link's language: the link's own ?lang, else Greek when the demo is shown in Greek, else the project's (review I4). */
export function clientLang(query: string, appLocale: Locale): string | undefined {
  return new URLSearchParams(query).get('lang') ?? (appLocale === 'el' ? 'el' : undefined);
}

export function PublicReportView({ token, kind, query, appLocale, refreshKey }: { token: string; kind: 'report' | 'dashboard'; query: string; appLocale: Locale; refreshKey: number }) {
  const sp = new URLSearchParams(query);
  const preset = sp.get('preset') ?? undefined;
  const lang = clientLang(query, appLocale);
  // the picker form always sends `preset`, so a missing `compare` then means unticked; a plain link keeps the comparison
  const compare = kind === 'dashboard' ? (preset ? sp.get('compare') === '1' : sp.get('compare') !== '0') : undefined;
  const { data: d, loading } = useLoaded(() => loadPublic(token, kind, { preset, compare, lang }), [token, kind, query, refreshKey]);
  if (!d) return <div data-live-page>{loading ? <Loading locale={appLocale} /> : <Missing locale={appLocale} />}</div>;
  return <PublicPage d={d} token={token} kind={kind} query={query} lang={lang} />;
}

/** The client link from loaded data (pure, so tests can render it). */
export function PublicPage({ d, token, kind, query, lang: langProp }: { d: PublicData; token: string; kind: 'report' | 'dashboard'; query: string; lang?: string }) {
  const sp = new URLSearchParams(query);
  const preset = sp.get('preset') ?? undefined;
  const lang = langProp ?? sp.get('lang') ?? undefined;
  const embed = sp.get('embed') === '1';
  const { r, locale, view, cards, timeline } = d;
  setRequestLocale(locale, lookupFor(locale));
  const company = r.project.company;
  const style = { ['--brand' as any]: company.brandColor, ['--brand-soft' as any]: company.brandColor + '1a' };

  if (r.password && !isUnlocked(token)) {
    return (
      <I18nProvider locale={locale} dict={dictFor(locale, ALL_NAMESPACES)}>
        <div className="flex min-h-screen items-center justify-center p-4" style={style} lang={locale} data-live-page>
          <div className="card w-full max-w-sm p-7">
            <div className="eyebrow">{r.project.name}</div>
            <h1 className="display mt-1 text-2xl font-semibold">{stripClientPrefix(r.title, r.project.name)}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
              <Lock size={14} className="text-brand" aria-hidden="true" /> {tr('public.passwordProtected')}
            </p>
            <div className="mt-4">
              <UnlockClient token={token} kind={kind} lang={lang} embed={embed} labels={{ password: tr('public.password'), checking: tr('public.checking'), view: tr('public.view') }} />
            </div>
            <div className="mt-3 text-xs text-ink-3" data-demo-password-hint>
              {demoT(locale, 'demoPassword')} <code>demo1234</code>
            </div>
          </div>
        </div>
      </I18nProvider>
    );
  }

  const { data, range, comparison, updatedAt } = view;
  const df = r.project.dateFormat;
  const sources = data.sources;
  const title = stripClientPrefix(r.title, r.project.name);
  const coverLayout = coverLayoutOf(data.theme);
  const showPeriod = data.theme?.showPeriod !== false;
  const coverProps = { projectName: r.project.name, title, subtitle: r.subtitle, logo: r.project.logo, brandColor: company.brandColor, range, comparison, dateFormat: df, live: kind === 'dashboard', marker: kind === 'dashboard' ? today(r.project.timezone) : undefined, cover: data.theme?.cover, theme: data.theme };
  const head = (
    <ReportCover slot="head" {...coverProps}>
      {comparison && showPeriod && <div className="mt-1 text-[11px] text-ink-3">{tr('public.comparisonNote')}</div>}
      {kind === 'dashboard' && <DashboardControls report={r} preset={clientPreset(r, preset)} compare={!!comparison} updatedAt={updatedAt ?? data.generated_at} timezone={r.project.timezone} embed={embed} lang={lang} />}
    </ReportCover>
  );
  const meta = (
    <>
      {sources.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow mb-2">{tr('public.sources')}</div>
          <ul className="space-y-1.5">
            {sources.map((s) => {
              const account = (() => {
                const a = stripClientPrefix(s.account_name, r.project.name);
                return a.toLowerCase().startsWith(s.platform.toLowerCase()) ? a.slice(s.platform.length).replace(/^\s*[–—-]\s*/, '').trim() : a;
              })();
              return (
                <li key={s.integrationId} className="flex items-center gap-2 text-sm">
                  <PlatformIcon slug={s.slug} size={16} />
                  <span className="truncate">
                    <span className="font-medium">{s.platform}</span>
                    {account && account !== s.platform && <span className="text-ink-3"> · {account}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {timeline.length > 0 && (
        <div className="mt-8">
          <div className="eyebrow mb-2">{tr('public.timeline')}</div>
          <ol className="space-y-3">
            {timeline.map((ev) => (
              <li key={ev.id} className="border-l-2 border-[var(--line-strong)] pl-3">
                <div className="num text-[11px] text-ink-3">{formatDisplayDate(ev.date, df)}</div>
                <div className="text-sm font-semibold">{ev.title}</div>
                <div className="analysis text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.content) }} />
                {ev.image && <MediaImage src={ev.image} alt="" className="tl-thumb" fit="cover" />}
              </li>
            ))}
          </ol>
        </div>
      )}
      {company.showDataNotes && <DataFootnotes sources={sources} />}
      {company.showDataNotes && (
        <div className="mt-8 text-[11px] leading-relaxed text-ink-3" data-data-note-footer>
          {tr('public.genericDataNote')} {tr('public.dataFetched', { date: formatDisplayDate(data.generated_at.slice(0, 10), df) })}
        </div>
      )}
      {!embed && !company.hidePoweredBy && <div className="mt-10 text-[11px] text-ink-3">{tr('common.poweredBy')}</div>}
    </>
  );

  return (
    <I18nProvider locale={locale} dict={dictFor(locale, ALL_NAMESPACES)}>
      <div style={{ ...style, ...themeVars(data.theme, company.brandColor) }} className="report-root min-h-screen" lang={locale} data-cover-layout={coverLayout} data-live-page>
        {!embed && (
          <header className="dossier-head no-print border-b border-[var(--line)] bg-[var(--card)]">
            <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3 md:px-8">
              {company.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo} alt={company.name} className="h-7 max-w-[160px] object-contain" />
              ) : (
                <span className="display text-[15px] font-semibold">{company.name}</span>
              )}
              <PrintButton pdf={{ token, query: { preset: kind === 'dashboard' ? clientPreset(r, preset) : undefined, compare: kind === 'dashboard' ? (comparison ? '1' : '0') : undefined, lang: lang ?? locale } }} labels={{ print: tr('public.printPdf'), download: tr('public.downloadPdf'), continuous: tr('public.continuous'), pages: tr('public.onePerPage'), browserPrint: tr('public.browserPrint') }} />
            </div>
          </header>
        )}
        {coverLayout === 'header' && (
          <div className="mx-auto max-w-[1280px] px-4 pt-8 md:px-8 md:pt-12">
            <ReportCover slot="hero" {...coverProps} />
          </div>
        )}
        <main data-cover-layout={coverLayout} className={`dossier mx-auto max-w-[1280px] px-4 pb-16 md:px-8 ${coverLayout === 'header' ? 'pt-4' : 'pt-8 md:pt-12'}`}>
          {coverLayout !== 'none' && (
            <aside className="dossier-cover">
              <div className="cover-head">{head}</div>
              <div className="cover-meta">{meta}</div>
            </aside>
          )}
          <div id="document" className="dossier-body space-y-12">
            {coverLayout === 'none' && <div className="cover-head cover-head-inline">{head}</div>}
            <ReportBody data={data} fmt={{ decimalSeparatorFormat: r.project.decimalSeparatorFormat }} brand={company.brandColor} dataNotes={company.showDataNotes} cards={cards} />
            {coverLayout === 'none' && <section className="dossier-foot">{meta}</section>}
          </div>
        </main>
      </div>
    </I18nProvider>
  );
}
