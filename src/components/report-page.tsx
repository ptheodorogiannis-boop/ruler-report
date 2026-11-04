import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import { Archive, Copy, Download, ExternalLink, Mail, Presentation, RefreshCw } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/shell';
import { ClientMark } from '@/components/client-mark';
import { themeVars } from '@/lib/layout/theme';
import { ReportBody, SourceStatusList } from '@/components/widgets';
import { ReportEditor } from '@/components/report-editor';
import { RulerBand } from '@/components/ruler-band';
import { AnalysisPanel, type CardView } from '@/components/analysis-panel';
import { AskBox } from '@/components/ask-box';
import { aiConfigured } from '@/lib/ai/insights';
import { ConfirmButton, CopyButton, PrintButton } from '@/components/action-form';
import { archiveReportAction, convertReportAction, duplicateReportAction, restoreReportAction, emailReportAction, refreshReportAction, retrySourceAction, updateDashboardPresetAction, updateShareAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import type { AnalysisCard } from '@/lib/engine/types';
import { persistSeed, reportView } from '@/lib/layout/service';
import { requestBaseUrl } from '@/lib/share';
import { ROLLING_PRESETS } from '@/lib/services/dashboards';
import { PRESET_LABEL, formatDisplayDate, today, type Preset } from '@/lib/util/dates';
import { sanitizeHtml } from '@/lib/util/sanitize';

export async function InternalReport({ id, kind }: { id: number; kind: 'report' | 'dashboard' }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  const r = await db.report.findFirst({ where: { id, kind, companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: { include: { company: true } }, template: true } });
  if (!r) notFound();
  const write = canWrite(p);
  // the composed view (layout + per-widget settings applied); a writer's first visit stores the seeded layout
  const view = await reportView(r, { includeHidden: write });
  if (write) await persistSeed(r, view);
  const { data, range, comparison } = view;
  const customMetrics = write ? (await db.customMetric.findMany({ where: { companyId: r.companyId, OR: [{ projectId: null }, { projectId: r.projectId }] }, orderBy: { name: 'asc' } })).map((m) => ({ id: m.id, name: m.name, formula: m.formula })) : [];
  const cards: CardView[] = (((r.analysis as unknown as AnalysisCard[]) ?? []) as AnalysisCard[]).map((c) => ({ id: c.id, title: c.title, html: sanitizeHtml(c.html), raw: c.html, author: c.author, blockId: c.blockId, tone: c.tone }));
  const timeline = await db.timelineEvent.findMany({ where: { projectId: r.projectId, date: { gte: range.start, lte: range.end } }, orderBy: { date: 'asc' } });
  // client questions asked on the shared link (spec §3), newest first
  const ai = aiConfigured();
  const questions = write ? await db.clientQuestion.findMany({ where: { reportId: r.id }, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
  const fmt = { decimalSeparatorFormat: r.project.decimalSeparatorFormat };
  const url = `${await requestBaseUrl()}/${kind === 'report' ? 'r' : 'd'}/${r.shareToken}`;
  const base = kind === 'report' ? '/reports' : '/dashboards';
  const df = r.project.dateFormat;

  return (
    <AppShell active={base}>
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
            {kind === 'report' && r.dataSyncedAt && <span className="ml-2 text-xs text-ink-3">snapshot {r.dataSyncedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>}
          </>
        }
        actions={
          <>
            {r.shareEnabled && <CopyButton text={url} label={t('share.copyLink')} />}
            {r.shareEnabled && (
              <a href={url} target="_blank" rel="noreferrer" className="btn">
                <ExternalLink size={14} /> {t('share.openClientView')}
              </a>
            )}
            <PrintButton labels={{ print: t('public.printPdf') }} />
            <a className="btn" href={`/api/v2/reports/${r.id}/export.csv`}>
              <Download size={14} /> {t('share.exportCsv')}
            </a>
            {kind === 'report' && (
              <Link className="btn" href={`/reports/${r.id}/studio`}>
                <Presentation size={14} /> Studio
              </Link>
            )}
            {write && (
              <form action={refreshReportAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn" title={kind === 'report' ? t('share.refreshSnapshot') : t('share.bypassCache')}>
                  <RefreshCw size={14} /> {t('share.refreshData')}
                </button>
              </form>
            )}
          </>
        }
      />
      </div>

      <RulerBand range={range} comparison={comparison} size="sm" dateFormat={df} live={kind === 'dashboard'} marker={kind === 'dashboard' ? today(r.project.timezone) : undefined} className="mb-6 max-w-3xl" />

      {kind === 'dashboard' && write && (
        <form action={updateDashboardPresetAction} className="no-print mb-4 flex flex-wrap items-center gap-2" data-dashboard-period>
          <input type="hidden" name="id" value={r.id} />
          <span className="text-sm text-slate-500">{t('share.periodLabel')}</span>
          <select name="preset" defaultValue={r.preset} className="input w-44">
            {(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'previous_month', 'this_quarter', 'year_to_date'] as Preset[]).map((x) => (
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
        </form>
      )}

      {write && (
        <details className="no-print card mb-5 p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t('share.sharingDelivery')}</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-slate-500">{t('share.anyoneHint')}</div>
              <code className="block break-all rounded bg-slate-50 px-2 py-1.5 text-xs">{r.shareEnabled ? url : 'Sharing is disabled'}</code>
              <div className="flex flex-wrap gap-2">
                <form action={updateShareAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="toggle" />
                  <button className="btn">{r.shareEnabled ? t('share.disableLink') : t('share.enableLink')}</button>
                </form>
                <form action={updateShareAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="rotate" />
                  <ConfirmButton className="btn" message={t('share.rotateConfirm')}>
                    {t('share.rotateLink')}
                  </ConfirmButton>
                </form>
              </div>
              <form action={updateShareAction} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="op" value="password" />
                <input name="password" type="password" className="input" placeholder={r.password ? t('share.passwordSet') : t('share.optionalPassword')} />
                <button className="btn">{t('common.save')}</button>
              </form>
              <div className="space-y-2 border-t border-[var(--line)] pt-3" data-client-ask>
                <div className="label">{t('share.clientAsk')}</div>
                <p className="text-xs text-ink-3">{ai ? t('share.clientAskHint') : t('share.clientAskNoKey')}</p>
                {ai && (
                  <form action={updateShareAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="op" value="clientAsk" />
                    <button className="btn" aria-pressed={r.clientAsk}>
                      {r.clientAsk ? t('share.clientAskOff') : t('share.clientAskOn')}
                    </button>
                  </form>
                )}
                {questions.length > 0 && (
                  <div data-client-questions>
                    <div className="label mt-3">{t('share.clientQuestions')}</div>
                    <ul className="mt-1 divide-y divide-[var(--line)]">
                      {questions.map((q) => (
                        <li key={q.id}>
                          <details className="py-2">
                            <summary className="flex cursor-pointer justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate">{q.question}</span>
                              <span className="num shrink-0 text-xs text-ink-3">{q.createdAt.toISOString().slice(0, 10)}</span>
                            </summary>
                            <p className="mt-1 text-sm text-ink-2">{q.answer}</p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400">Embed: <code>{`<iframe src="${url}?embed=1" width="100%" height="900"></iframe>`}</code></div>
            </div>
            <div className="space-y-2">
              <form action={emailReportAction} className="space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <label className="label">Email this {kind}</label>
                <div className="flex gap-2">
                  <input name="to" className="input" placeholder="client@example.com" />
                  <button className="btn">
                    <Mail size={14} /> {t('share.send')}
                  </button>
                </div>
                <div className="text-xs text-slate-400">{t('share.smtpHint')}</div>
              </form>
              <div className="flex flex-wrap gap-2 pt-3" data-report-more>
                <form action={duplicateReportAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn">
                    <Copy size={14} /> {t('common.duplicate')}
                  </button>
                </form>
                <form action={convertReportAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="kind" value={kind === 'report' ? 'dashboard' : 'report'} />
                  <ConfirmButton className="btn" message={kind === 'report' ? t('share.convertToDashboardConfirm') : t('share.convertToReportConfirm')}>
                    {kind === 'report' ? t('share.convertToDashboard') : t('share.convertToReport')}
                  </ConfirmButton>
                </form>
              </div>
              <form action={archiveReportAction} className="pt-3">
                <input type="hidden" name="id" value={r.id} />
                <button className="btn">
                  <Archive size={14} /> {t('reports.archive')}
                </button>
              </form>
            </div>
          </div>
        </details>
      )}

      <div className="space-y-8">
        {r.archivedAt && (
          <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" data-archived-banner>
            <span className="text-ink-2">{t('reports.archivedBanner')}</span>
            {write && (
              <form action={restoreReportAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn">{t('reports.restore')}</button>
              </form>
            )}
          </div>
        )}
        <AnalysisPanel reportId={r.id} cards={cards} editable={write} />
        {write ? (
          <>
            {/* writers edit in place, so the failed-source controls (spec v3 §1.3) sit above the editor */}
            {kind === 'report' && <SourceStatusList sources={data.sources} actions={{ reportId: r.id, projectId: r.projectId, retry: retrySourceAction }} />}
          <ReportEditor reportId={r.id} kind={kind} title={r.title} clientName={r.project.name} dateFormat={r.project.dateFormat} brand={r.project.company.brandColor} initialLayout={view.layout} initialData={view.raw} sources={view.projectSources} currency={r.project.currency} range={range} comparison={comparison} fmt={fmt} customMetrics={customMetrics} cards={cards} />
          </>
        ) : (
          <div className="report-root" style={themeVars(data.theme, r.project.company.brandColor)}>
            <ReportBody data={{ ...data, events: timeline.map((ev) => ({ date: ev.date, title: ev.title })) }} fmt={fmt} brand={r.project.company.brandColor} dataNotes={r.project.company.showDataNotes} cards={cards} />
          </div>
        )}
        {timeline.length > 0 && (
          <section className="print-section space-y-2">
            <h2 className="text-lg font-medium">{t('common.timeline')}</h2>
            <ol className="space-y-2">
              {timeline.map((t) => (
                <li key={t.id} className="card p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-xs text-slate-400">{formatDisplayDate(t.date, df)}</span>
                  </div>
                  <div className="analysis text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.content) }} />
                </li>
              ))}
            </ol>
          </section>
        )}
        <AskBox reportId={r.id} />
      </div>
    </AppShell>
  );
}
