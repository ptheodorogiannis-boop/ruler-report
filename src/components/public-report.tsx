import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { MediaImage } from '@/components/media-image';
import { DataFootnotes } from '@/components/data-note';
import { themeVars } from '@/lib/layout/theme';
import { PlatformIcon } from '@/components/platform-icon';
import { ReportBody } from '@/components/widgets';
import { PrintButton } from '@/components/action-form';
import { ReportCover, coverLayoutOf } from '@/components/report-cover';
import { unlockCookie } from '@/lib/share';
import { UnlockClient } from '@/components/unlock-client';
import { DashboardControls } from '@/components/dashboard-controls';
import { printAttrs } from '@/lib/print';
import { localeForPublic } from '@/lib/i18n';
import { tr } from '@/lib/i18n/request';
import { setServerLocale } from '@/lib/i18n/server';
import { pdfAvailable } from '@/lib/services/pdf';
import { clientPreset } from '@/lib/services/dashboards';
import { getPrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import type { AnalysisCard } from '@/lib/engine/types';
import { reportView } from '@/lib/layout/service';
import { emitEvent } from '@/lib/services/webhooks';
import { formatDisplayDate, today } from '@/lib/util/dates';
import { sanitizeHtml } from '@/lib/util/sanitize';

const lastHit = new Map<string, number>();

/** "Acme Running Co | Monthly report" → "Monthly report" when the client is already shown as the eyebrow. */
export function stripClientPrefix(title: string, client: string): string {
  const t = title.trim();
  const c = client.trim();
  if (!c || !t.toLowerCase().startsWith(c.toLowerCase())) return t;
  const rest = t.slice(c.length).replace(/^\s*[|:–—-]\s*/, '').trim();
  return rest.length >= 3 ? rest : t;
}

/**
 * The client-facing report as a dossier (docs/DESIGN.md › Structure pass): a cover column on the left (title, period
 * band, sources, timeline) and the document on the right. The cover layout (spec v3 §4.2) moves the image above both
 * columns (`header`) or drops the column altogether (`none`, sources and timeline then close the document).
 * `?print=1&layout=pages` is the PDF service's view of the same page.
 */
export async function PublicReport({ token, kind, embed, preset, compare, print, layout, lang }: { token: string; kind: 'report' | 'dashboard'; embed?: boolean; preset?: string; compare?: boolean; print?: string; layout?: string; lang?: string }) {
  const r = await db.report.findFirst({ where: { shareToken: token, kind, shareEnabled: true }, include: { project: { include: { company: true } } } });
  if (!r) notFound();
  const company = r.project.company;
  // the client's language: ?lang= wins, else the project's (spec v3 §5)
  const locale = localeForPublic(r.project, lang);
  setServerLocale(locale);
  const style = { ['--brand' as any]: company.brandColor, ['--brand-soft' as any]: company.brandColor + '1a' };

  if (r.password) {
    const ok = (await cookies()).get(`rr_pw_${r.id}`)?.value === unlockCookie(r.id, r.password);
    if (!ok) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4" style={style} lang={locale}>
          <div className="card w-full max-w-sm p-7">
            <div className="eyebrow">{r.project.name}</div>
            <h1 className="display mt-1 text-2xl font-semibold">{stripClientPrefix(r.title, r.project.name)}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
              <Lock size={14} className="text-brand" aria-hidden="true" /> {tr('public.passwordProtected')}
            </p>
            <div className="mt-4">
              <UnlockClient token={token} kind={kind} lang={lang} embed={embed} labels={{ password: tr('public.password'), checking: tr('public.checking'), view: tr('public.view') }} />
            </div>
          </div>
        </div>
      );
    }
  }

  // count views from outside the workspace only, and debounce the webhook per link
  const me = await getPrincipal();
  // a print render (the PDF service, or someone opening ?print=1) is not a client view either (review I2)
  if ((!me || me.companyId !== r.companyId) && print !== '1') {
    await db.report.update({ where: { id: r.id }, data: { views: { increment: 1 } } });
    const now = Date.now();
    if (now - (lastHit.get(token) ?? 0) > 10 * 60_000) {
      lastHit.set(token, now);
      await emitEvent(r.companyId, r.projectId, 'report_viewed', { id: r.id, title: r.title, kind });
    }
  }

  const { data, range, comparison, updatedAt } = await reportView(r, { preset, compare });
  const cards = ((r.analysis as unknown as AnalysisCard[]) ?? []).map((c) => ({ ...c, html: sanitizeHtml(c.html) }));
  const timeline = await db.timelineEvent.findMany({ where: { projectId: r.projectId, date: { gte: range.start, lte: range.end } }, orderBy: { date: 'asc' } });
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
              // the account name usually repeats the client and the platform ("Acme – Google Ads"); keep only what is new
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
            {timeline.map((t) => (
              <li key={t.id} className="border-l-2 border-[var(--line-strong)] pl-3">
                <div className="num text-[11px] text-ink-3">{formatDisplayDate(t.date, df)}</div>
                <div className="text-sm font-semibold">{t.title}</div>
                <div className="analysis text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }} />
                {t.image && <MediaImage src={t.image} alt="" className="tl-thumb" fit="cover" />}
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
    <div style={{ ...style, ...themeVars(data.theme, company.brandColor) }} className="report-root min-h-screen" lang={locale} data-cover-layout={coverLayout} {...printAttrs({ print, layout })}>
      <a href="#document" className="skip-link">
        {tr('public.skipToReport')}
      </a>
      {!embed && print !== '1' && (
        <header className="dossier-head no-print border-b border-[var(--line)] bg-[var(--card)]">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-3 md:px-8">
            {company.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt={company.name} className="h-7 max-w-[160px] object-contain" />
            ) : (
              <span className="display text-[15px] font-semibold">{company.name}</span>
            )}
            <PrintButton pdf={pdfAvailable() ? { token, query: { preset: kind === 'dashboard' ? clientPreset(r, preset) : undefined, compare: kind === 'dashboard' ? (comparison ? '1' : '0') : undefined, lang } } : undefined} labels={{ print: tr('public.printPdf'), download: tr('public.downloadPdf'), continuous: tr('public.continuous'), pages: tr('public.onePerPage'), browserPrint: tr('public.browserPrint') }} />
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

        {/* ── document ── */}
        <div id="document" className="dossier-body space-y-12">
          {coverLayout === 'none' && <div className="cover-head cover-head-inline">{head}</div>}
          <ReportBody data={data} fmt={{ decimalSeparatorFormat: r.project.decimalSeparatorFormat }} brand={company.brandColor} dataNotes={company.showDataNotes} cards={cards} />
          {coverLayout === 'none' && <section className="dossier-foot">{meta}</section>}
        </div>
      </main>
    </div>
  );
}
