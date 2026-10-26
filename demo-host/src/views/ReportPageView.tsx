// The agency's report / dashboard page (src/components/report-page.tsx, writer view) in the browser. Differences from
// the app, each a ledgered ruling: no Studio button (out of scope), the PDF menu instead of browser print (Claude pages
// block printing), confirm-free buttons (Claude pages refuse confirm()), and forms that act in the demo store.
import Link from 'next/link';
import { Copy, Download, ExternalLink, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { ClientMark } from '@/components/client-mark';
import { SourceStatusList } from '@/components/widgets';
import { ReportEditor } from '@/components/report-editor';
import { RulerBand } from '@/components/ruler-band';
import { AnalysisPanel } from '@/components/analysis-panel';
import { AskBox } from '@/components/ask-box';
import { CopyButton, PrintButton } from '@/components/action-form';
import { useT } from '@/components/i18n-provider';
import { ROLLING_PRESETS } from '@/lib/services/dashboards';
import { convertReport, duplicateReport } from '@/lib/services/reports';
import { formatDisplayDate, today, type Preset } from '@/lib/util/dates';
import { sanitizeHtml } from '@/lib/util/sanitize';
import { bus, type Locale } from '../bus';
import { demoT } from '../demo-strings';
import { getDb, persist } from '../server/store';
import { loadReportPage, useLoaded, type ReportPageData } from './load';
import { DemoForm, Loading, Missing, PageHeader } from './common';

const PERIODS: Preset[] = ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'previous_month', 'this_quarter', 'year_to_date'];

export function ReportPageView({ id, kind, locale, refreshKey }: { id: number; kind: 'report' | 'dashboard'; locale: Locale; refreshKey: number }) {
  const { data: d, loading } = useLoaded(() => loadReportPage(id, kind), [id, kind, refreshKey]);
  if (!d) return loading ? <Loading locale={locale} /> : <Missing locale={locale} />;
  return <ReportPage d={d} kind={kind} locale={locale} />;
}

/** The page from loaded data (pure, so tests can render it). */
export function ReportPage({ d, kind, locale }: { d: ReportPageData; kind: 'report' | 'dashboard'; locale: Locale }) {
  const t = useT();
  const { r, view, cards, timeline, fmt, shareUrl, customMetrics } = d;
  const { data, range, comparison } = view;
  const df = r.project.dateFormat;
  const base = kind === 'report' ? '/reports' : '/dashboards';

  const savePeriod = async (fd: FormData) => {
    await getDb().report.update({ where: { id: r.id }, data: { preset: String(fd.get('preset')), clientPresets: fd.getAll('clientPresets').map(String) } });
    persist();
    bus.toast(demoT(locale, 'savedInDemo'));
    bus.refresh();
  };
  const duplicate = async () => {
    const copy = await duplicateReport(r.id, 1);
    persist();
    bus.navigate(`/${copy.kind === 'report' ? 'reports' : 'dashboards'}/${copy.id}`);
  };
  const convert = async () => {
    const next = await convertReport(r.id, 1, kind === 'report' ? 'dashboard' : 'report');
    persist();
    bus.navigate(`/${next.kind === 'report' ? 'reports' : 'dashboards'}/${next.id}`);
  };
  const remove = async () => {
    await getDb().report.delete({ where: { id: r.id } });
    persist();
    bus.toast(demoT(locale, 'deleted'));
    bus.navigate(base);
  };

  return (
    <div data-live-view="report-page">
      <div className="report-head">
        <PageHeader
          title={r.title}
          subtitle={
            <>
              <ClientMark name={r.project.name} logo={r.project.logo} size={24} className="mr-1.5 align-middle" />
              <Link href={`/projects/${r.projectId}`} className="font-semibold text-brand">
                {r.project.name}
              </Link>{' '}
              · {r.subtitle}
              {kind === 'report' && r.dataSyncedAt && <span className="ml-2 text-xs text-ink-3">{demoT(locale, 'snapshot')} {new Date(r.dataSyncedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC</span>}
            </>
          }
          actions={
            <>
              {r.shareEnabled && (
                <span onClickCapture={() => bus.toast(demoT(locale, 'linkCopied'))}>
                  <CopyButton text={shareUrl} label={t('share.copyLink')} />
                </span>
              )}
              {r.shareEnabled && (
                <Link href={shareUrl} className="btn">
                  <ExternalLink size={14} /> {t('share.openClientView')}
                </Link>
              )}
              <PrintButton pdf={r.shareEnabled ? { token: r.shareToken, query: { lang: locale } } : undefined} labels={{ print: t('public.printPdf'), download: t('public.downloadPdf'), continuous: t('public.continuous'), pages: t('public.onePerPage'), browserPrint: t('public.browserPrint') }} />
              <a className="btn" href={`/api/v2/reports/${r.id}/export.csv`}>
                <Download size={14} /> {t('share.exportCsv')}
              </a>
              <DemoForm locale={locale} onSubmit={() => (bus.refresh(), bus.toast(demoT(locale, 'savedInDemo')))}>
                <button className="btn" title={kind === 'report' ? t('share.refreshSnapshot') : t('share.bypassCache')}>
                  <RefreshCw size={14} /> {t('share.refreshData')}
                </button>
              </DemoForm>
            </>
          }
        />
      </div>

      <RulerBand range={range} comparison={comparison} size="sm" dateFormat={df} live={kind === 'dashboard'} marker={kind === 'dashboard' ? today(r.project.timezone) : undefined} className="mb-6 max-w-3xl" />

      {kind === 'dashboard' && (
        <DemoForm locale={locale} onSubmit={savePeriod} className="no-print mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">{t('share.periodLabel')}</span>
          <select name="preset" defaultValue={r.preset} className="input w-44" key={`preset-${r.preset}`}>
            {PERIODS.map((x) => (
              <option key={x} value={x}>
                {t(`presets.${x}`)}
              </option>
            ))}
          </select>
          <span className="ml-2 text-sm text-slate-500">{t('share.clientMaySwitch')}</span>
          {ROLLING_PRESETS.filter((x) => x !== r.preset).map((x) => (
            <label key={x} className="flex items-center gap-1 text-xs" data-client-preset={x}>
              <input type="checkbox" name="clientPresets" value={x} defaultChecked={((r.clientPresets as string[] | null) ?? []).includes(x)} /> {t(`presets.${x}`)}
            </label>
          ))}
          <button className="btn">{t('common.apply')}</button>
        </DemoForm>
      )}

      <details className="no-print card mb-5 p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t('share.sharingDelivery')}</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-slate-500">{t('share.anyoneHint')}</div>
            <code className="block break-all rounded bg-slate-50 px-2 py-1.5 text-xs">{r.shareEnabled ? shareUrl : demoT(locale, 'sharingDisabled')}</code>
            <div className="flex flex-wrap gap-2">
              <DemoForm locale={locale}>
                <button className="btn">{r.shareEnabled ? t('share.disableLink') : t('share.enableLink')}</button>
              </DemoForm>
              <DemoForm locale={locale}>
                <button className="btn">{t('share.rotateLink')}</button>
              </DemoForm>
            </div>
            <DemoForm locale={locale} className="flex gap-2">
              <input name="password" type="password" className="input" placeholder={r.password ? t('share.passwordSet') : t('share.optionalPassword')} />
              <button className="btn">{t('common.save')}</button>
            </DemoForm>
          </div>
          <div className="space-y-2">
            <DemoForm locale={locale} className="space-y-2">
              <label className="label">{demoT(locale, kind === 'report' ? 'emailReport' : 'emailDashboard')}</label>
              <div className="flex gap-2">
                <input name="to" className="input" placeholder="client@example.com" />
                <button className="btn">
                  <Mail size={14} /> {t('share.send')}
                </button>
              </div>
              <div className="text-xs text-slate-400">{t('share.smtpHint')}</div>
            </DemoForm>
            <div className="flex flex-wrap gap-2 pt-3" data-report-more>
              <DemoForm locale={locale} onSubmit={duplicate}>
                <button className="btn">
                  <Copy size={14} /> {t('common.duplicate')}
                </button>
              </DemoForm>
              <DemoForm locale={locale} onSubmit={convert}>
                <button className="btn">{kind === 'report' ? t('share.convertToDashboard') : t('share.convertToReport')}</button>
              </DemoForm>
            </div>
            <DemoForm locale={locale} onSubmit={remove} className="pt-3">
              <button className="btn-danger">
                <Trash2 size={14} /> {demoT(locale, kind === 'report' ? 'deleteReport' : 'deleteDashboard')}
              </button>
            </DemoForm>
          </div>
        </div>
      </details>

      <div className="space-y-8">
        <AnalysisPanel reportId={r.id} cards={cards} editable />
        {kind === 'report' && <SourceStatusList sources={data.sources} actions={{ reportId: r.id, projectId: r.projectId, retry: async () => bus.toast(demoT(locale, 'savedInDemo')) }} />}
        <ReportEditor key={`${kind}-${r.id}`} reportId={r.id} kind={kind} title={r.title} brand={r.project.company.brandColor} initialLayout={view.layout} initialData={view.raw} sources={view.projectSources} currency={r.project.currency} range={range} comparison={comparison} fmt={fmt as any} customMetrics={customMetrics} cards={cards} />
        {timeline.length > 0 && (
          <section className="print-section space-y-2">
            <h2 className="text-lg font-bold">{t('common.timeline')}</h2>
            <ol className="space-y-2">
              {timeline.map((ev) => (
                <li key={ev.id} className="card p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{ev.title}</span>
                    <span className="text-xs text-slate-400">{formatDisplayDate(ev.date, df)}</span>
                  </div>
                  <div className="analysis text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.content) }} />
                </li>
              ))}
            </ol>
          </section>
        )}
        <AskBox reportId={r.id} />
      </div>
    </div>
  );
}
